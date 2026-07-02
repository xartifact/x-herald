import { eq, sql } from '@xartifact/x-llm-gateway-db'

import type { DbClient } from '../../db/client'
import { getDatabase } from '../../db/client'
import logger from '../../lib/logger'

import { virtualKeys, keyUsageDaily } from '@xartifact/x-llm-gateway-db'

/**
 * 更新密钥使用统计（异步，不阻塞请求）
 * 在请求完成后调用
 */
export async function trackKeyUsage(
  params: {
    keyId: string
    inputTokens: number
    outputTokens: number
  },
  db?: DbClient,
): Promise<void> {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const doTrack = async (trx: DbClient) => {
      // 更新 virtual_keys 的累计统计
      await trx
        .update(virtualKeys)
        .set({
          lastUsedAt: new Date(),
          totalRequests: sql`${virtualKeys.totalRequests} + 1`,
          totalTokens: sql`${virtualKeys.totalTokens} + ${params.inputTokens + params.outputTokens}`,
        })
        .where(eq(virtualKeys.id, params.keyId))

      // 更新 key_usage_daily（upsert）
      await trx
        .insert(keyUsageDaily)
        .values({
          keyId: params.keyId,
          date: today,
          requestCount: 1,
          inputTokens: BigInt(params.inputTokens),
          outputTokens: BigInt(params.outputTokens),
          totalTokens: BigInt(params.inputTokens + params.outputTokens),
        })
        .onConflictDoUpdate({
          target: [keyUsageDaily.keyId, keyUsageDaily.date],
          set: {
            requestCount: sql`${keyUsageDaily.requestCount} + 1`,
            inputTokens: sql`${keyUsageDaily.inputTokens} + ${BigInt(params.inputTokens)}`,
            outputTokens: sql`${keyUsageDaily.outputTokens} + ${BigInt(params.outputTokens)}`,
            totalTokens: sql`${keyUsageDaily.totalTokens} + ${BigInt(params.inputTokens + params.outputTokens)}`,
          },
        })
    }

    if (db) {
      await doTrack(db)
    } else {
      const dbInstance = getDatabase()
      await dbInstance.transaction(doTrack)
    }
  } catch (error) {
    // 非致命错误，记录日志但不抛出
    logger.warn({ err: error, keyId: params.keyId }, 'Failed to track key usage')
  }
}
