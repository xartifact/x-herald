import { getDatabase } from '@/core/db/client';
import { requestLogs } from '@/features/logs/db';
import { and, eq, lt } from 'drizzle-orm';
import logger from '@/core/lib/logger';

/**
 * 清理超时的流日志
 * 建议：通过 cron job 定期执行（每 5 分钟）
 */
export async function cleanupStaleStreams(timeoutMinutes: number = 5): Promise<number> {
  try {
    const db = getDatabase();
    const timeoutMs = timeoutMinutes * 60 * 1000;
    const cutoffTime = new Date(Date.now() - timeoutMs);

    const result = await db
      .update(requestLogs)
      .set({
        status: 'failure',
        streamStatus: 'failed',
        isComplete: true,
        errorMessage: `Stream timeout - no activity for ${timeoutMinutes} minutes`,
        errorType: 'stream_timeout',
        lastUpdatedAt: new Date(),
      })
      .where(
        and(
          eq(requestLogs.isComplete, false),
          eq(requestLogs.streamStatus, 'streaming'),
          lt(requestLogs.lastUpdatedAt, cutoffTime)
        )
      )
      .returning({ id: requestLogs.id });

    const count = result.length;
    if (count > 0) {
      logger.info({ count, cutoffTime }, 'Cleaned up stale streams');
    }

    return count;
  } catch (error) {
    logger.error({ error }, 'Failed to cleanup stale streams');
    return 0;
  }
}

/**
 * 查询当前未完成的流
 */
export async function getIncompleteStreams() {
  try {
    const db = getDatabase();

    const streams = await db
      .select({
        id: requestLogs.id,
        modelName: requestLogs.modelName,
        streamStatus: requestLogs.streamStatus,
        streamStartedAt: requestLogs.streamStartedAt,
        lastUpdatedAt: requestLogs.lastUpdatedAt,
        chunksProcessed: requestLogs.streamProgress,
      })
      .from(requestLogs)
      .where(eq(requestLogs.isComplete, false));

    return streams;
  } catch (error) {
    logger.error({ error }, 'Failed to query incomplete streams');
    return [];
  }
}
