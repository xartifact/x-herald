import { lt, inArray } from '@xartifact/x-llm-gateway-db'

import { getDatabase } from '../../db/client'
import rootLogger from '../../lib/logger'

const logger = rootLogger.child({ module: 'log-cleanup' })

import { requestLogs, requestAttempts } from '@xartifact/x-llm-gateway-db'

/**
 * 清理过期日志
 * @param retentionDays 保留天数（默认30天）
 * @returns 删除的日志数量
 */
export async function cleanupLogs(retentionDays: number = 30): Promise<number> {
  const db = getDatabase()
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

  const expiredIds = await db
    .select({ id: requestLogs.id })
    .from(requestLogs)
    .where(lt(requestLogs.createdAt, cutoffDate))

  if (expiredIds.length === 0) {
    logger.info('No expired logs to clean up')
    return 0
  }

  const ids = expiredIds.map((r) => r.id)

  await db.delete(requestAttempts).where(inArray(requestAttempts.requestLogId, ids))

  const deleteResult = await db
    .delete(requestLogs)
    .where(lt(requestLogs.createdAt, cutoffDate))
    .returning({ id: requestLogs.id })

  const deletedCount = deleteResult.length
  logger.info({ deletedCount, retentionDays }, 'Logs cleaned up')

  return deletedCount
}

/**
 * 启动自动清理定时器
 * @param intervalHours 检查间隔小时数（默认24小时）
 * @param retentionDays 保留天数（默认30天）
 * @returns 定时器ID
 */
export function startAutoCleanup(
  intervalHours: number = 24,
  retentionDays: number = 30,
): NodeJS.Timeout {
  logger.info({ intervalHours, retentionDays }, 'Starting auto log cleanup scheduler')

  // 立即执行一次
  cleanupLogs(retentionDays).catch((error) => {
    logger.error({ error }, 'Initial log cleanup failed')
  })

  // 设置定时器
  const intervalMs = intervalHours * 60 * 60 * 1000
  const timerId = setInterval(() => {
    cleanupLogs(retentionDays).catch((error) => {
      logger.error({ error }, 'Scheduled log cleanup failed')
    })
  }, intervalMs)

  return timerId
}

/**
 * 停止自动清理定时器
 * @param timerId 定时器ID
 */
export function stopAutoCleanup(timerId: NodeJS.Timeout): void {
  clearInterval(timerId)
  logger.info('Auto log cleanup scheduler stopped')
}
