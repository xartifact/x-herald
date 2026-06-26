import { sql } from 'drizzle-orm';

import { getDatabase } from '../../../db/client';
import rootLogger from '../../../lib/logger';

const logger = rootLogger.child({ module: 'rank-calculator' });

import { modelRequestStats } from '@x-llm-gateway/db';

/**
 * Lambda constant for exponential decay: ln(2) / 7 days ≈ 0.099 per day
 * This means the score halves every 7 days
 */
const LAMBDA = Math.LN2 / 7;

/**
 * Minimum score floor to prevent numerical underflow
 */
const MIN_SCORE_FLOOR = 0.001;

/**
 * Milliseconds per day for conversion
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Calculate the exponential decay score for a model based on request count and recency.
 * Uses the formula: score = requestCount × e^(-λ × daysSinceLastRequest)
 * where λ = ln(2)/7 (score halves every 7 days).
 *
 * @param requestCount - Total number of requests for the model
 * @param lastRequestAt - Timestamp of the most recent request (UTC)
 * @param now - Reference timestamp for calculation (defaults to current time, UTC)
 * @returns Decayed score with a minimum floor of 0.001
 *
 * @example
 * // A model with 100 requests made 3.5 days ago
 * calculateScore(100, new Date('2024-01-01'), new Date('2024-01-04T12:00:00Z'))
 * // Returns: 100 × e^(-0.099 × 3.5) ≈ 70.7
 */
export function calculateScore(
  requestCount: number,
  lastRequestAt: Date,
  now?: Date,
): number {
  // Cold start: no requests yet
  if (requestCount <= 0) {
    return 0;
  }

  const referenceTime = now ?? new Date();

  // Calculate days since last request (all timestamps in UTC)
  const msSinceLastRequest = Math.max(
    0,
    referenceTime.getTime() - lastRequestAt.getTime(),
  );
  const daysSinceLastRequest = msSinceLastRequest / MS_PER_DAY;

  // Apply exponential decay formula
  const decayFactor = Math.exp(-LAMBDA * daysSinceLastRequest);
  const rawScore = requestCount * decayFactor;

  // Apply minimum floor to prevent numerical underflow
  return Math.max(rawScore, MIN_SCORE_FLOOR);
}

/**
 * Recalculate scores for all models in the database using exponential decay.
 * This is intended to be called periodically (e.g., by a cron job) to handle
 * floating-point drift and ensure scores accurately reflect time decay.
 *
 * @returns Object containing the number of models processed and duration in milliseconds
 *
 * @example
 * // Call this from a cron endpoint
 * const result = await recalculateAll();
 * console.log(`Processed ${result.processed} models in ${result.duration}ms`);
 */
export async function recalculateAll(): Promise<{
  processed: number;
  duration: number;
}> {
  const startTime = Date.now();

  try {
    const db = getDatabase();
    const now = new Date();

    // Fetch all model stats from the database
    const allStats = await db.select().from(modelRequestStats);

    if (allStats.length === 0) {
      logger.debug('No model stats found for score recalculation');
      return { processed: 0, duration: Date.now() - startTime };
    }

    // Batch upsert with transaction for atomicity
    const processedCount = await db.transaction(async (tx) => {
      const values = allStats.map((stat) => ({
        modelId: stat.modelId,
        requestCount: stat.requestCount,
        lastRequestAt: stat.lastRequestAt,
        currentScore: calculateScore(stat.requestCount, stat.lastRequestAt, now),
        lastScoredAt: now,
      }));

      await tx
        .insert(modelRequestStats)
        .values(values)
        .onConflictDoUpdate({
          target: modelRequestStats.modelId,
          set: {
            currentScore: sql`excluded.current_score`,
            lastScoredAt: sql`excluded.last_scored_at`,
          },
        });

      return values.length;
    });

    const duration = Date.now() - startTime;

    logger.info(
      { processed: processedCount, durationMs: duration },
      'Completed batch score recalculation',
    );

    return { processed: processedCount, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(
      { error, durationMs: duration },
      'Failed to recalculate model scores',
    );
    throw error;
  }
}
