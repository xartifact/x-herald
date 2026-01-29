/**
 * 日志清理工具 - 自动删除超过保留期的日志
 */

import { sql } from 'drizzle-orm';
import { getDatabase, requestLogs } from '@x-llm-gateway/database';
import logger from './logger';

// 默认保留天数
const DEFAULT_RETENTION_DAYS = 30;

/**
 * 清理过期日志
 * @param retentionDays 保留天数，默认30天
 * @returns 删除的日志数量
 */
export async function cleanupOldLogs(retentionDays: number = DEFAULT_RETENTION_DAYS): Promise<number> {
  try {
    const db = getDatabase();

    // 计算截止日期
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    logger.info({
      retentionDays,
      cutoffDate: cutoffDate.toISOString(),
    }, 'Starting log cleanup');

    // 删除过期日志
    const result = await db
      .delete(requestLogs)
      .where(sql`${requestLogs.createdAt} < ${cutoffDate}`)
      .returning({ id: requestLogs.id });

    const deletedCount = result.length;

    logger.info({
      deletedCount,
      retentionDays,
      cutoffDate: cutoffDate.toISOString(),
    }, 'Log cleanup completed');

    return deletedCount;
  } catch (error) {
    logger.error({ error }, 'Failed to cleanup old logs');
    throw error;
  }
}

/**
 * 获取日志统计信息
 */
export async function getLogStats(): Promise<{
  totalCount: number;
  oldestLogDate: Date | null;
  newestLogDate: Date | null;
}> {
  try {
    const db = getDatabase();

    const stats = await db
      .select({
        totalCount: sql<number>`count(*)::int`,
        oldestDate: sql<Date>`min(${requestLogs.createdAt})`,
        newestDate: sql<Date>`max(${requestLogs.createdAt})`,
      })
      .from(requestLogs);

    return {
      totalCount: stats[0]?.totalCount || 0,
      oldestLogDate: stats[0]?.oldestDate || null,
      newestLogDate: stats[0]?.newestDate || null,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get log stats');
    throw error;
  }
}

/**
 * 启动自动清理定时器
 * @param intervalHours 检查间隔（小时），默认24小时
 * @param retentionDays 保留天数，默认30天
 * @returns 定时器句柄
 */
export function startAutoCleanup(
  intervalHours: number = 24,
  retentionDays: number = DEFAULT_RETENTION_DAYS
): ReturnType<typeof setInterval> {
  logger.info({
    intervalHours,
    retentionDays,
  }, 'Starting auto log cleanup scheduler');

  // 立即执行一次清理
  cleanupOldLogs(retentionDays).catch((error) => {
    logger.error({ error }, 'Initial log cleanup failed');
  });

  // 设置定时器
  const intervalMs = intervalHours * 60 * 60 * 1000;
  const timer = setInterval(() => {
    cleanupOldLogs(retentionDays).catch((error) => {
      logger.error({ error }, 'Scheduled log cleanup failed');
    });
  }, intervalMs);

  return timer;
}

/**
 * 停止自动清理定时器
 */
export function stopAutoCleanup(timer: ReturnType<typeof setInterval>): void {
  clearInterval(timer);
  logger.info('Auto log cleanup scheduler stopped');
}
