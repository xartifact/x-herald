/**
 * 潜在模型 service
 *
 * 职责：
 *  - recordPotentialHit: 累积命中数，达到阈值后 UPSERT 到 DB（每个进程独立计数）
 *  - lookupActivePotentialTarget: 在路由热路径上按 model_name 查 active 映射
 *  - CRUD: list / get / update / delete
 *  - convertToAccessModel: 提升为 access_model（带事务）
 *  - runCleanup: 删除 last_seen_at < now - 30 days 且 action='observe' 且 enabled=true 的行
 *
 * 设计要点：
 *  - 进程内计数防止恶意客户端刷随机 model_name 占据 DB
 *  - 路由热路径上的 lookup 是 O(1) 索引扫描，DB 命中失败返回 null
 *  - recordPotentialHit 在调用方用 fire-and-forget，不阻塞请求
 *  - convertToAccessModel 跨表写入包在一个事务里（access_model 创建 + potential_models 删除）
 */

import { and, eq, sql, lt, inArray, desc } from '@xartifact/x-llm-gateway-db'
import type { Database } from '../../db/client'
import { getDatabase } from '../../db/client'
import rootLogger from '../../lib/logger'
import {
  potentialModels,
  accessModels,
  type PotentialModel,
  type PotentialModelAction,
} from '@xartifact/x-llm-gateway-db'

import { createAccessModel } from '../access-models/service'

const logger = rootLogger.child({ module: 'potential-models-service' })

const HIT_THRESHOLD = 3
const SAMPLE_KEY_TRIM_INTERVAL_MS = 5 * 60_000

/** 进程内累积计数：model_name -> { count, firstSeenAt } */
const hitCounters = new Map<string, { count: number; virtualKeyId?: string }>()

let lastSampleTrim = 0

function noteSampleKey(modelName: string, virtualKeyId?: string): void {
  if (!virtualKeyId) return
  const entry = hitCounters.get(modelName) ?? { count: 0 }
  entry.virtualKeyId = virtualKeyId
  hitCounters.set(modelName, entry)
}

function trimCounters(): void {
  const now = Date.now()
  if (now - lastSampleTrim < SAMPLE_KEY_TRIM_INTERVAL_MS) return
  lastSampleTrim = now
  // bound memory: drop cold entries
  for (const [name, entry] of hitCounters) {
    if (entry.count === 0) hitCounters.delete(name)
  }
}

/**
 * 记录一次潜在模型命中。
 *  - 首次见到：仅写进程内计数器
 *  - 第 HIT_THRESHOLD 次：首次落库（INSERT ... ON CONFLICT DO NOTHING）
 *  - 之后：UPSERT 增加 request_count + 更新 last_seen_at / sampleVirtualKeyIds
 *
 * 调用方应 fire-and-forget（不要 await）。失败只打 warn 日志，不影响请求。
 */
export async function recordPotentialHit(
  modelName: string,
  virtualKeyId?: string,
  db?: Database,
): Promise<void> {
  if (!modelName || modelName.length > 255) return
  trimCounters()

  const counter = hitCounters.get(modelName) ?? { count: 0 }
  counter.count += 1
  hitCounters.set(modelName, counter)
  if (virtualKeyId) noteSampleKey(modelName, virtualKeyId)

  const sampleKey = counter.virtualKeyId
  const database = db ?? getDatabase()

  try {
    if (counter.count === HIT_THRESHOLD) {
      // 首次落库
      await database
        .insert(potentialModels)
        .values({
          modelName,
          requestCount: 1,
          sampleVirtualKeyIds: sampleKey ? [sampleKey] : [],
        })
        .onConflictDoNothing({ target: potentialModels.modelName })
      logger.info({ modelName }, 'Potential model first persisted (hit threshold)')
    } else if (counter.count > HIT_THRESHOLD) {
      // 已落库的行：累加计数 + 更新 last_seen_at + 维护 sample
      await database
        .update(potentialModels)
        .set({
          requestCount: sql`${potentialModels.requestCount} + 1`,
          lastSeenAt: new Date(),
          sampleVirtualKeyIds: sampleKey
            ? sql`(SELECT array_agg(DISTINCT v) FROM (
                  SELECT unnest(${potentialModels.sampleVirtualKeyIds} || ARRAY[${sampleKey}]::text[]) AS v
                ) s)`
            : sql`${potentialModels.sampleVirtualKeyIds}`,
          updatedAt: new Date(),
        })
        .where(eq(potentialModels.modelName, modelName))
    }
  } catch (error) {
    logger.warn({ err: error, modelName }, 'Failed to record potential model hit')
  }
}

/**
 * 在路由热路径上查询潜在模型目标。
 * 仅返回 enabled=true 且 action=route_to_access_model 的命中。
 * 故意只 SELECT 必要字段以减少开销。
 */
export async function lookupActivePotentialTarget(
  modelName: string,
  db?: Database,
): Promise<{ targetAccessModelId: string; targetAccessModelName: string } | null> {
  if (!modelName) return null
  try {
    const database = db ?? getDatabase()
    const rows = await database
      .select({
        targetAccessModelId: potentialModels.targetAccessModelId,
        targetAccessModelName: accessModels.name,
      })
      .from(potentialModels)
      .innerJoin(accessModels, eq(accessModels.id, potentialModels.targetAccessModelId))
      .where(
        and(
          eq(potentialModels.modelName, modelName),
          eq(potentialModels.enabled, true),
          eq(potentialModels.action, 'route_to_access_model'),
          eq(accessModels.enabled, true),
        ),
      )
      .limit(1)
    const row = rows[0]
    if (!row?.targetAccessModelId || !row.targetAccessModelName) return null
    return {
      targetAccessModelId: row.targetAccessModelId,
      targetAccessModelName: row.targetAccessModelName,
    }
  } catch (error) {
    logger.warn({ err: error, modelName }, 'Failed to lookup potential model target')
    return null
  }
}

export interface ListPotentialModelsOptions {
  action?: PotentialModelAction
  enabled?: boolean
  minCount?: number
  limit?: number
  offset?: number
}

export async function listPotentialModels(
  options: ListPotentialModelsOptions = {},
  db?: Database,
): Promise<PotentialModel[]> {
  const database = db ?? getDatabase()
  const conditions = []
  if (options.action) conditions.push(eq(potentialModels.action, options.action))
  if (options.enabled !== undefined) conditions.push(eq(potentialModels.enabled, options.enabled))
  if (options.minCount !== undefined)
    conditions.push(sql`${potentialModels.requestCount} >= ${options.minCount}`)

  return database
    .select()
    .from(potentialModels)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(potentialModels.requestCount), desc(potentialModels.lastSeenAt))
    .limit(options.limit ?? 100)
    .offset(options.offset ?? 0)
}

export async function countPotentialModels(
  options: { action?: PotentialModelAction; enabled?: boolean; minCount?: number } = {},
  db?: Database,
): Promise<number> {
  const database = db ?? getDatabase()
  const conditions = []
  if (options.action) conditions.push(eq(potentialModels.action, options.action))
  if (options.enabled !== undefined) conditions.push(eq(potentialModels.enabled, options.enabled))
  if (options.minCount !== undefined)
    conditions.push(sql`${potentialModels.requestCount} >= ${options.minCount}`)

  const rows = await database
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(potentialModels)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
  return rows[0]?.total ?? 0
}

export async function getPotentialModel(id: string, db?: Database): Promise<PotentialModel | null> {
  const database = db ?? getDatabase()
  const rows = await database
    .select()
    .from(potentialModels)
    .where(eq(potentialModels.id, id))
    .limit(1)
  return rows[0] ?? null
}

export async function updatePotentialModel(
  id: string,
  data: {
    action?: PotentialModelAction
    targetAccessModelId?: string | null
    enabled?: boolean
    note?: string | null
  },
  db?: Database,
): Promise<PotentialModel | null> {
  const database = db ?? getDatabase()
  const current = await getPotentialModel(id, db)
  if (!current) return null

  // 业务规则：action=route_to_access_model 必须有 target
  if (data.action === 'route_to_access_model' && !data.targetAccessModelId) {
    throw new Error('targetAccessModelId is required when action=route_to_access_model')
  }
  if (data.action === 'observe') {
    data.targetAccessModelId = null
  }

  const setData: Record<string, unknown> = { updatedAt: new Date() }
  if (data.action !== undefined) setData.action = data.action
  if (data.targetAccessModelId !== undefined) setData.targetAccessModelId = data.targetAccessModelId
  if (data.enabled !== undefined) setData.enabled = data.enabled
  if (data.note !== undefined) setData.note = data.note

  const [updated] = await database
    .update(potentialModels)
    .set(setData)
    .where(eq(potentialModels.id, id))
    .returning()
  return updated ?? null
}

export async function deletePotentialModel(id: string, db?: Database): Promise<boolean> {
  const database = db ?? getDatabase()
  const result = await database
    .delete(potentialModels)
    .where(eq(potentialModels.id, id))
    .returning()
  return result.length > 0
}

export interface ConvertToAccessModelArgs {
  displayName?: string
  description?: string
  enabled?: boolean
  capabilities?: {
    streaming: boolean
    functionCalling: boolean
    vision: boolean
    jsonMode: boolean
    maxTokens: number
    contextWindow: number
  }
  deleteAfterConvert?: boolean
}

/**
 * 把潜在模型提升为 access_model。
 *  - 复用 createAccessModel 写入 access_models
 *  - 默认删除 potential_models 行（可关闭）
 *  整体走事务，失败回滚
 */
export async function convertToAccessModel(
  potentialId: string,
  args: ConvertToAccessModelArgs,
  db?: Database,
): Promise<{ accessModelId: string; potentialDeleted: boolean }> {
  const database = db ?? getDatabase()
  return database.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(potentialModels)
      .where(eq(potentialModels.id, potentialId))
      .limit(1)
    const pm = rows[0]
    if (!pm) throw new Error('Potential model not found')

    const am = await createAccessModel(
      {
        name: pm.modelName,
        displayName: args.displayName ?? pm.modelName,
        description:
          args.description ?? `Promoted from potential model (seen ${pm.requestCount} times)`,
        enabled: args.enabled ?? true,
        capabilities: args.capabilities ?? null,
      },
      tx as unknown as Database,
    )

    const deleteAfter = args.deleteAfterConvert ?? true
    if (deleteAfter) {
      await tx.delete(potentialModels).where(eq(potentialModels.id, potentialId))
    } else {
      // 标记为 route_to 自身（指向刚创建的 access_model），保留历史
      await tx
        .update(potentialModels)
        .set({
          action: 'route_to_access_model',
          targetAccessModelId: am.id,
          updatedAt: new Date(),
        })
        .where(eq(potentialModels.id, potentialId))
    }

    logger.info(
      { potentialId, accessModelId: am.id, modelName: pm.modelName },
      'Potential model converted to access model',
    )
    return { accessModelId: am.id, potentialDeleted: deleteAfter }
  })
}

/**
 * Daily cleanup: 删除 last_seen_at < cutoff AND action='observe' AND enabled=true 的行
 * 保留有路由配置的（action=route_to_*）以及被 admin 禁用的（enabled=false）
 *
 * 默认保留 30 天（90 天也合理，由调用方传入）
 */
export async function runCleanup(
  options: { olderThanDays?: number; now?: Date; batchSize?: number } = {},
  db?: Database,
): Promise<{ deleted: number; cutoff: Date }> {
  const days = options.olderThanDays ?? 30
  const now = options.now ?? new Date()
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const batchSize = options.batchSize ?? 1000

  const database = db ?? getDatabase()

  // 先取一批 id（避免一次性 DELETE 锁表）
  const candidates = await database
    .select({ id: potentialModels.id })
    .from(potentialModels)
    .where(
      and(
        eq(potentialModels.action, 'observe'),
        eq(potentialModels.enabled, true),
        lt(potentialModels.lastSeenAt, cutoff),
      ),
    )
    .limit(batchSize)

  if (candidates.length === 0) {
    return { deleted: 0, cutoff }
  }

  const ids = candidates.map((c) => c.id)
  const result = await database
    .delete(potentialModels)
    .where(inArray(potentialModels.id, ids))
    .returning({ id: potentialModels.id })

  logger.info(
    { deleted: result.length, cutoff: cutoff.toISOString(), olderThanDays: days },
    'Potential model cleanup completed',
  )
  return { deleted: result.length, cutoff }
}

// === Cleanup job lifecycle ===

let cleanupHandle: ReturnType<typeof setInterval> | null = null
let cleanupInstalled = false

const ONE_DAY_MS = 24 * 60 * 60 * 1000

export function installCleanupJob(intervalMs = ONE_DAY_MS): void {
  if (cleanupInstalled) return
  cleanupInstalled = true
  void runCleanup()
  cleanupHandle = setInterval(() => {
    void runCleanup()
  }, intervalMs)
}

export function stopCleanupJob(): void {
  if (cleanupHandle) clearInterval(cleanupHandle)
  cleanupHandle = null
  cleanupInstalled = false
}
