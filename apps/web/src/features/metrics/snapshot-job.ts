import { logger } from '@x-llm-gateway/engine';

import { ensureMetricsTable } from './ensure-table';
import { aggregateBucket, aggregateRecentBuckets, alignToBucket } from './services/snapshot-aggregator';

const BUCKET_MINUTES = 5;

export async function startSnapshotJob(): Promise<NodeJS.Timeout> {
  logger.info({ bucketMinutes: BUCKET_MINUTES }, 'Starting perf snapshot job');

  try {
    await ensureMetricsTable();
  } catch (err) {
    logger.error({ err }, 'Failed to ensure instance_perf_snapshots table');
  }

  // 补齐最近 1 小时的历史桶
  aggregateRecentBuckets(12, BUCKET_MINUTES).catch((err) => {
    logger.warn({ err }, 'Failed to backfill perf snapshots');
  });

  const intervalMs = BUCKET_MINUTES * 60 * 1000;

  const timer = setInterval(() => {
    const now = new Date();
    const aligned = alignToBucket(now, BUCKET_MINUTES);
    const prevBucket = new Date(aligned.getTime() - intervalMs);

    aggregateBucket(prevBucket, BUCKET_MINUTES).catch((err) => {
      logger.warn({ err, prevBucket }, 'Perf snapshot aggregation failed');
    });
  }, intervalMs);

  return timer;
}

export function stopSnapshotJob(timer: NodeJS.Timeout): void {
  clearInterval(timer);
  logger.info('Perf snapshot job stopped');
}
