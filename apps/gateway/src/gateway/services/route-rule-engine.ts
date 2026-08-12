/**
 * RouteRuleEngine —— 运行时路由引擎（唯一数据源）
 *
 * 按接入模型（accessModelId）维护一份编译缓存：每个接入模型的 route_rules
 * active 版本 graph 被编译成 RouteMatcher[]，缓存在内存里，请求路径只读缓存，
 * 永不直接查 DB。取代原来全局单一 canvas_states 的 CanvasRouteEngine——
 * 那个版本对任意一次编辑都要重建全局索引，这里按接入模型粒度 invalidate。
 *
 * 条件求值复用本文件下方的纯函数（evaluateConditions / getField / evaluateOperator），
 * 图 → RouteMatcher[] 的编译逻辑在 route-rule-compiler.ts（NodeCompilerRegistry
 * 按 node.type 查表分发每种叶子节点）。
 */

import type { RouteCondition } from '@xartifact/x-herald-shared'
import { inArray, modelInstances } from '@xartifact/x-herald-db'
import {
  getActiveRouteRule,
  peekActiveRouteRule,
  peekAllActiveRouteRules,
  subscribeToRouteRuleChanges,
} from '../../features/route-rules/service'
import { getDatabase } from '../../db/client'
import {
  compileCanvasToMatchers,
  type ClassifierModelNameResolver,
  type RouteMatcher,
} from './route-rule-compiler'

// 性能上下文：聚合目标路由规则所有实例的最差健康状态
export interface PerfContext {
  worstAnomalyLevel: 'normal' | 'warning' | 'critical' | 'unknown'
  maxAnomalyScore: number | null
  minSuccessRate: number | null
  maxTtfbP95: number | null
  healthyRatio: number
}

// 规则匹配上下文
export interface RouteContext {
  model: string
  apiKeyName?: string
  streaming: boolean
  hour?: number
  clientType?: string
  perf?: PerfContext
}

export function evaluateConditions(conditions: RouteCondition[], ctx: RouteContext): boolean {
  if (conditions.length === 0) return true

  return conditions.every((cond) => {
    const fieldValue = getField(cond.field, ctx)
    return evaluateOperator(cond.operator, fieldValue, cond.value)
  })
}

export function getField(field: string, ctx: RouteContext): unknown {
  switch (field) {
    case 'request.model':
      return ctx.model
    case 'context.apiKeyName':
      return ctx.apiKeyName
    case 'context.streaming':
      return ctx.streaming
    case 'context.hour':
      return ctx.hour ?? new Date().getHours()
    case 'context.clientType':
      return ctx.clientType
    case 'perf.anomalyLevel':
      return ctx.perf?.worstAnomalyLevel ?? 'unknown'
    case 'perf.anomalyScore':
      return ctx.perf?.maxAnomalyScore ?? null
    case 'perf.successRate':
      return ctx.perf?.minSuccessRate ?? null
    case 'perf.ttfbP95':
      return ctx.perf?.maxTtfbP95 ?? null
    case 'perf.healthyRatio':
      return ctx.perf?.healthyRatio ?? 1
    default:
      return undefined
  }
}

export function coerceValue(fieldValue: unknown, condValue: unknown): unknown {
  if (typeof fieldValue === 'number' && typeof condValue === 'string') {
    const n = Number(condValue)
    return isNaN(n) ? condValue : n
  }
  if (typeof fieldValue === 'boolean' && typeof condValue === 'string') {
    if (condValue === 'true') return true
    if (condValue === 'false') return false
  }
  return condValue
}

export function evaluateOperator(
  operator: string,
  fieldValue: unknown,
  condValue: unknown,
): boolean {
  const coerced = coerceValue(fieldValue, condValue)
  switch (operator) {
    case 'eq':
      return fieldValue === coerced
    case 'ne':
      return fieldValue !== coerced
    case 'in': {
      const list = Array.isArray(condValue)
        ? condValue
        : typeof condValue === 'string'
          ? condValue.split(',').map((v) => v.trim())
          : []
      return list.some((v) => fieldValue === coerceValue(fieldValue, v))
    }
    case 'starts_with':
      return (
        typeof fieldValue === 'string' &&
        typeof condValue === 'string' &&
        fieldValue.startsWith(condValue)
      )
    case 'exists':
      return fieldValue !== undefined && fieldValue !== null
    case 'gt':
      return typeof fieldValue === 'number' && fieldValue > Number(coerced)
    case 'lt':
      return typeof fieldValue === 'number' && fieldValue < Number(coerced)
    case 'gte':
      return typeof fieldValue === 'number' && fieldValue >= Number(coerced)
    case 'lte':
      return typeof fieldValue === 'number' && fieldValue <= Number(coerced)
    default:
      return false
  }
}

/**
 * 异步版 compileActiveMatchers —— 注入 DB-backed resolver，把意图节点的
 * classifier.modelName 自动从 model_instance.id (UUID) 规范化为 actual_model_name。
 *
 * 历史背景：前端 RemoteSelectWidget 早期实现把 instance.id 作为 value 写进 graph，
 * 导致上游 LLM 收到 UUID → 400。此 resolver 在编译阶段做最后一道防线，
 * 即使数据库里仍有脏数据，运行时也能自动恢复。
 */
async function compileActiveMatchersAsync(
  graph: Parameters<typeof compileCanvasToMatchers>[0],
  resolveClassifierModelName: ClassifierModelNameResolver,
): Promise<RouteMatcher[]> {
  const matchers = await compileCanvasToMatchers(graph, resolveClassifierModelName)
  return matchers.filter((m) => m.enabled).toSorted((a, b) => a.priority - b.priority)
}

/**
 * 构建意图分类器 modelName resolver：从 model_instances 表批量查 UUID → actual_model_name。
 *
 * 性能优化：先扫描 graph 收集所有候选 UUID，一次性 IN 查询，避免每个 intent 节点
 * 单独 round-trip。
 */
async function buildClassifierModelNameResolver(
  graph: Parameters<typeof compileCanvasToMatchers>[0],
): Promise<ClassifierModelNameResolver> {
  // 1. 扫描所有 intent 节点，收集看起来像 UUID 的 modelName
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const uuids = new Set<string>()
  for (const node of graph.nodes) {
    if (node.type !== 'intent') continue
    const data = node.data as Record<string, unknown> | undefined
    const ic = data?.intentConfig as { classifier?: { modelName?: string } } | undefined
    const modelName = ic?.classifier?.modelName
    if (modelName && uuidPattern.test(modelName)) {
      uuids.add(modelName)
    }
  }

  if (uuids.size === 0) {
    // 没有候选 UUID，直接返回 identity resolver（零开销）
    return (_providerId, modelName) => modelName
  }

  // 2. 一次性查 DB
  const db = getDatabase()
  const rows = await db
    .select({ id: modelInstances.id, actualModelName: modelInstances.actualModelName })
    .from(modelInstances)
    .where(inArray(modelInstances.id, Array.from(uuids)))

  const lookup = new Map(rows.map((r) => [r.id, r.actualModelName]))

  // 3. resolver：UUID 且在表里 → actual_model_name；否则原样返回
  return (_providerId, modelName) => lookup.get(modelName) ?? modelName
}

/**
 * RouteRuleEngine 类
 */
export class RouteRuleEngine {
  private cache = new Map<string, RouteMatcher[]>() // accessModelId -> matchers
  private unsubscribe: (() => void) | null = null

  /**
   * 从缓存中的 route_rules（所有接入模型的 active 版本）重新编译。
   * 异步：需要查 DB 把意图分类器的 UUID modelName 解析为 actual_model_name。
   */
  async rebuild(): Promise<void> {
    const records = peekAllActiveRouteRules()
    const compiled = await Promise.all(
      records.map(async (r) => {
        const resolver = await buildClassifierModelNameResolver(r.graph)
        return {
          accessModelId: r.accessModelId,
          matchers: await compileActiveMatchersAsync(r.graph, resolver),
        }
      }),
    )
    this.cache.clear()
    for (const { accessModelId, matchers } of compiled) {
      this.cache.set(accessModelId, matchers)
    }
  }

  /**
   * 重新编译单个接入模型（route-rules 变更订阅回调用 + 管理员手动触发）。
   * 公开：因为 admin API 端点需要直接重编译指定接入模型（不必刷新全部）。
   */
  async rebuildOne(accessModelId: string): Promise<void> {
    const record = peekActiveRouteRule(accessModelId)
    if (record) {
      const resolver = await buildClassifierModelNameResolver(record.graph)
      const matchers = await compileActiveMatchersAsync(record.graph, resolver)
      this.cache.set(accessModelId, matchers)
    } else {
      this.cache.delete(accessModelId)
    }
  }

  /**
   * 订阅 route-rules 变更，自动重建对应接入模型的索引。
   */
  startAutoRebuild(): void {
    if (this.unsubscribe) return
    void this.rebuild()
    this.unsubscribe = subscribeToRouteRuleChanges(
      (accessModelId) => void this.rebuildOne(accessModelId),
    )
  }

  stopAutoRebuild(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
  }

  /**
   * 按接入模型匹配路由（请求路径主入口）。缓存未命中时（例如接入模型在
   * startAutoRebuild() 之后才拿到 active 版本）惰性补一次编译，防御时序问题。
   */
  async match(accessModelId: string, ctx: RouteContext): Promise<RouteMatcher | null> {
    if (!this.cache.has(accessModelId)) {
      await getActiveRouteRule(accessModelId)
      this.rebuildOne(accessModelId)
    }
    const candidates = this.cache.get(accessModelId) ?? []
    for (const m of candidates) {
      if (evaluateConditions(m.conditions, ctx)) {
        return m
      }
    }
    return null
  }

  /**
   * 内部：返回当前所有接入模型的全部 matchers（供 model-list/metrics 等
   * 需要"全局视角"的消费方使用）。
   */
  getAllMatchers(): RouteMatcher[] {
    return Array.from(this.cache.values()).flat()
  }

  /**
   * 返回单个接入模型当前缓存的 matchers（性能上下文查询等只关心一个 AM 的场景）。
   */
  getMatchersForAccessModel(accessModelId: string): RouteMatcher[] {
    return this.cache.get(accessModelId) ?? []
  }
}

// 单例（lazy init）
let instance: RouteRuleEngine | null = null

export function getRouteRuleEngine(): RouteRuleEngine {
  if (!instance) {
    instance = new RouteRuleEngine()
  }
  return instance
}

export function resetRouteRuleEngine(): void {
  if (instance) {
    instance.stopAutoRebuild()
    instance = null
  }
}

// 类型导出
export type { RouteMatcher }
