/**
 * Route Rules Service
 *
 * 按接入模型的多版本路由规则持久化 + 运行时缓存入口。
 * 替代原来单一全局 canvas_states：每个 access_model 可以有多个版本
 * （草稿/历史），但同一时刻最多一行 active=true（DB 部分唯一索引保证）。
 *
 * 设计要点（镜像原 canvas-state/service.ts 的缓存策略，按 accessModelId 拆分）：
 *   - 启动时一次性 loadAllActiveRouteRules() 加载所有 active 行到内存缓存
 *   - activateVersion() 写入 DB 后同步更新缓存并通知订阅者（RouteRuleEngine invalidate）
 *   - RouteRuleEngine 只读缓存，永不直接查 DB（避免请求路径里的重复 IO）
 */

import { accessModels, and, eq, isNull, ne, routeRules } from '@xartifact/x-herald-db'
import type { RouteRule } from '@xartifact/x-herald-db'
import type { AccessModelRouteOverview, CanvasGraph } from '@xartifact/x-herald-shared'

import type { Database } from '../../db/client'
import { getDatabase } from '../../db/client'
import rootLogger from '../../lib/logger'
import { AppError } from '../../middleware/error'

const logger = rootLogger.child({ module: 'route-rules-service' })

const activeCache = new Map<string, RouteRule>() // accessModelId -> active route_rule
const subscribers = new Set<(accessModelId: string) => void>()
let loaded = false

/** 清空内存缓存。供测试和重载使用。 */
export function clearRouteRuleCache(): void {
  activeCache.clear()
  loaded = false
}

/** 启动时调用：从 DB 加载所有 active route_rules 到内存缓存。 */
export async function loadAllActiveRouteRules(db?: Database): Promise<RouteRule[]> {
  const database = db ?? getDatabase()
  const rows = await database.select().from(routeRules).where(eq(routeRules.active, true))

  activeCache.clear()
  for (const row of rows) activeCache.set(row.accessModelId, row)
  loaded = true
  logger.info({ count: activeCache.size }, 'route rules (active) loaded into memory cache')
  return Array.from(activeCache.values())
}

/** 同步取某个接入模型当前缓存的 active 版本（仅在确保已加载后使用）。 */
export function peekActiveRouteRule(accessModelId: string): RouteRule | null {
  return activeCache.get(accessModelId) ?? null
}

/** 同步取全部当前缓存的 active 版本（RouteRuleEngine.rebuild() 用）。 */
export function peekAllActiveRouteRules(): RouteRule[] {
  return Array.from(activeCache.values())
}

/** 取某个接入模型的 active 版本；缓存未初始化时触发同步加载。 */
export async function getActiveRouteRule(
  accessModelId: string,
  db?: Database,
): Promise<RouteRule | null> {
  if (!loaded) await loadAllActiveRouteRules(db)
  return activeCache.get(accessModelId) ?? null
}

/** 列出某个接入模型的全部版本（草稿 + 历史 + active），按版本号倒序。 */
export async function listVersions(accessModelId: string, db?: Database): Promise<RouteRule[]> {
  const database = db ?? getDatabase()
  return database
    .select()
    .from(routeRules)
    .where(eq(routeRules.accessModelId, accessModelId))
    .orderBy(routeRules.version)
}

export async function getVersion(id: string, db?: Database): Promise<RouteRule | null> {
  const database = db ?? getDatabase()
  const rows = await database.select().from(routeRules).where(eq(routeRules.id, id)).limit(1)
  return rows[0] ?? null
}

/** 新建一个草稿版本（active=false，version = 该接入模型已有最大版本号 + 1）。 */
export async function saveDraft(
  accessModelId: string,
  graph: CanvasGraph,
  meta?: { name?: string; description?: string | null },
  db?: Database,
): Promise<RouteRule> {
  const database = db ?? getDatabase()
  const existing = await listVersions(accessModelId, database)
  const nextVersion = existing.reduce((max, v) => Math.max(max, v.version), 0) + 1

  const [created] = await database
    .insert(routeRules)
    .values({
      accessModelId,
      graph,
      name: meta?.name ?? '默认路由规则',
      description: meta?.description ?? null,
      active: false,
      version: nextVersion,
    })
    .returning()
  return created
}

/** 激活一个版本：先清空该接入模型下所有行的 active，再置目标行 active=true。 */
export async function activateVersion(id: string, db?: Database): Promise<RouteRule> {
  const database = db ?? getDatabase()
  const target = await getVersion(id, database)
  if (!target) {
    throw new AppError(404, `Route rule '${id}' not found`, 'ROUTE_RULE_NOT_FOUND')
  }

  await database
    .update(routeRules)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(routeRules.accessModelId, target.accessModelId), ne(routeRules.id, id)))
  const [activated] = await database
    .update(routeRules)
    .set({ active: true, updatedAt: new Date() })
    .where(eq(routeRules.id, id))
    .returning()

  activeCache.set(activated.accessModelId, activated)
  loaded = true
  notifySubscribers(activated.accessModelId)
  logger.info(
    { accessModelId: activated.accessModelId, routeRuleId: id, version: activated.version },
    'route rule version activated',
  )
  return activated
}

/** 删除一个版本；拒绝删除当前 active 的版本。 */
export async function deleteVersion(id: string, db?: Database): Promise<void> {
  const database = db ?? getDatabase()
  const target = await getVersion(id, database)
  if (!target) {
    throw new AppError(404, `Route rule '${id}' not found`, 'ROUTE_RULE_NOT_FOUND')
  }
  if (target.active) {
    throw new AppError(
      400,
      'Cannot delete the currently active route rule version',
      'ROUTE_RULE_ACTIVE_DELETE',
    )
  }
  await database.delete(routeRules).where(eq(routeRules.id, id))
}

/** 订阅路由规则变更通知（RouteRuleEngine 注册以接收按接入模型的 invalidate 信号）。 */
export function subscribeToRouteRuleChanges(cb: (accessModelId: string) => void): () => void {
  subscribers.add(cb)
  return () => {
    subscribers.delete(cb)
  }
}

function notifySubscribers(accessModelId: string): void {
  for (const cb of subscribers) {
    try {
      cb(accessModelId)
    } catch (error) {
      logger.error({ err: error }, 'route rule subscriber callback failed')
    }
  }
}

/**
 * 全局路由俯瞰图数据：汇总所有未删除的接入模型及其 active 路由规则图。
 * 直接查库（不依赖内存缓存），返回条目数组，供前端一次性总览所有路由配置。
 */
export async function getRouteOverview(db?: Database): Promise<AccessModelRouteOverview> {
  const database = db ?? getDatabase()

  const [ams, activeRows] = await Promise.all([
    database
      .select({
        id: accessModels.id,
        name: accessModels.name,
        displayName: accessModels.displayName,
        enabled: accessModels.enabled,
      })
      .from(accessModels)
      .where(isNull(accessModels.deletedAt))
      .orderBy(accessModels.name),
    database
      .select({
        accessModelId: routeRules.accessModelId,
        id: routeRules.id,
        version: routeRules.version,
        active: routeRules.active,
        graph: routeRules.graph,
      })
      .from(routeRules)
      .where(eq(routeRules.active, true)),
  ])

  const ruleByAm = new Map(activeRows.map((r) => [r.accessModelId, r]))

  return ams.map((am) => {
    const rule = ruleByAm.get(am.id) ?? null
    return {
      accessModel: {
        id: am.id,
        name: am.name,
        displayName: am.displayName,
        enabled: am.enabled,
      },
      rule: rule ? { id: rule.id, version: rule.version, active: rule.active } : null,
      graph: rule?.graph ?? ({ nodes: [], edges: [] } as CanvasGraph),
    }
  })
}
