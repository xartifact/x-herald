import { eq, and, lt, or, isNull } from '@xartifact/x-herald-db'

import type { DbClient } from '../../db/client'
import { getDatabase } from '../../db/client'
import logger from '../../lib/logger'

import { virtualKeys } from '@xartifact/x-herald-db'

/**
 * 密钥「最近使用」的维护。
 *
 * 历史说明：本模块原有一个 `trackKeyUsage`，负责递增 `virtual_keys.total_requests`
 * / `total_tokens` 并 upsert `key_usage_daily`。整条链路已于本次迭代**停止写入**：
 *
 * - `key_usage_daily` 自建表以来从未被任何代码读取；且其 schema 声明
 *   （`timestamp`）与迁移 0027 的 `DATE` 不符，是潜在的类型漂移。
 * - `virtual_keys` 的两个累计列在 `getKeyStats` 重写后失去唯一读取点。
 *
 * 但它们**保留数据**（含超出日志 30 天留存窗口的历史，不可再生），
 * 计划在下个版本迭代删除。届时需一并清理 schema 定义与迁移 0027。
 *
 * `touchKeyLastUsed` 不受影响，继续维护 `lastUsedAt`。
 */

/**
 * 「最近使用」的写入节流窗口（毫秒）。
 *
 * 该字段由认证路径每请求触发，若每次都写同一行会形成热点行争用
 * （同一 key 的并发请求在该行上串行化）。窗口内重复请求只写一次；
 * 精度损失（最多滞后这个窗口）对「最近使用」显示无影响。
 */
const LAST_USED_THROTTLE_MS = 60_000

/** keyId → 上次已提交写入的时间戳（进程内，跨实例由 SQL 条件兜底） */
const lastTouchAt = new Map<string, number>()

/**
 * 记录密钥「最近使用」时间。
 *
 * 语义是**发起过请求**，因此与 token 用量无关 —— 缓存命中、纯 output 补全、
 * thinking-only、embedding、被取消的流都必须刷新它，否则面板显示「从未使用」
 * 但日志里有记录。
 *
 * 调用时机：认证通过、限流通过之后（认证失败/被拒不算「使用」）。
 * 失败仅记日志，不影响请求。
 *
 * 节流：进程内窗口 + SQL 侧 `last_used_at IS NULL OR last_used_at < now() - interval`
 * 双重条件。前者省掉本进程的重复写，后者保证多实例部署下也不会高频写同一行。
 */
export async function touchKeyLastUsed(keyId: string, db?: DbClient): Promise<void> {
  const now = Date.now()
  const previous = lastTouchAt.get(keyId)
  if (previous !== undefined && now - previous < LAST_USED_THROTTLE_MS) return
  // 先占位，避免并发请求同时穿透到 DB；写失败时回滚占位以便下次重试
  lastTouchAt.set(keyId, now)

  try {
    const database = db ?? getDatabase()
    const cutoff = new Date(now - LAST_USED_THROTTLE_MS)
    await database
      .update(virtualKeys)
      .set({ lastUsedAt: new Date() })
      .where(
        and(
          eq(virtualKeys.id, keyId),
          or(isNull(virtualKeys.lastUsedAt), lt(virtualKeys.lastUsedAt, cutoff)),
        ),
      )
  } catch (error) {
    lastTouchAt.delete(keyId)
    // 非致命：统计信息缺失不应影响请求
    logger.warn({ err: error, keyId }, 'Failed to touch key lastUsedAt')
  }
}
