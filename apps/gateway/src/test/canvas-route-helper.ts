/**
 * Route-rules test helper — 把 route-action spec 转成一个接入模型的
 * route_rules.graph 并持久化（active 版本）+ 触发 RouteRuleEngine invalidate。
 *
 * Tests should use this instead of inserting canvas nodes/edges by hand,
 * since the runtime engine reads from route_rules（the single source of truth）。
 */

import { sql } from '@xartifact/x-llm-gateway-db'
import type { RouteAction } from '@xartifact/x-llm-gateway-shared'

import { getDatabase } from '../db/client'
import {
  activateVersion,
  clearRouteRuleCache,
  loadAllActiveRouteRules,
  saveDraft,
} from '../features/route-rules/service'
import { getRouteRuleEngine } from '../gateway/services/route-rule-engine'

export interface SeedRouteSpec {
  /** Access model id (also used as canvas trigger vmId) */
  amId: string
  /** Access model name (canvas trigger label / modelName) */
  amName: string
  /** Route action to compile into a canvas leaf node */
  action: RouteAction
}

/**
 * Build a canvas graph (trigger + leaf + edge) from a model_routes-style spec.
 * Pure function — does not persist. Exposed for tests that need to compose graphs.
 */
export function buildCanvasGraphFromRoute(spec: SeedRouteSpec): {
  nodes: Array<{
    id: string
    type: string
    position: { x: number; y: number }
    data: Record<string, unknown>
  }>
  edges: Array<{ id: string; source: string; target: string; sourceHandle?: string }>
} {
  const triggerId = `vm-${spec.amId}`
  const leafId = `target-${crypto.randomUUID()}`

  const nodes: Array<{
    id: string
    type: string
    position: { x: number; y: number }
    data: Record<string, unknown>
  }> = [
    {
      id: triggerId,
      type: 'modelTrigger',
      position: { x: 0, y: 0 },
      data: { vmId: spec.amId, label: spec.amName, modelName: spec.amName },
    },
  ]
  const edges: Array<{ id: string; source: string; target: string; sourceHandle?: string }> = [
    { id: `e-${triggerId}-${leafId}`, source: triggerId, target: leafId },
  ]

  switch (spec.action.type) {
    case 'route_to_group':
    case 'route_to_instance':
    case 'route_to_virtual_model':
      nodes.push({
        id: leafId,
        type: 'target',
        position: { x: 200, y: 0 },
        data: { actionType: spec.action.type, targetId: spec.action.targetId },
      })
      break
    case 'intent': {
      // 运行时 (canvas-route-engine.ts) 从 handle-{category}/handle-default
      // 边推导 targetGroupIds/defaultGroupId，节点自身 data 只保留
      // categories/classifier —— 必须按这个真实契约来搭图，否则测试
      // 会绕过真正的编译路径（历史上这正是本 bug 被漏测的原因）。
      const intentConfig = spec.action.intentConfig
      const categories = intentConfig ? Object.keys(intentConfig.targetGroupIds) : []
      nodes.push({
        id: leafId,
        type: 'intent',
        position: { x: 200, y: 0 },
        data: {
          intentConfig: { categories, classifier: intentConfig?.classifier },
        },
      })
      for (const category of categories) {
        const targetId = `target-${leafId}-${category}`
        nodes.push({
          id: targetId,
          type: 'target',
          position: { x: 400, y: 0 },
          data: { actionType: 'route_to_group', targetId: intentConfig?.targetGroupIds[category] },
        })
        edges.push({
          id: `e-${leafId}-${category}`,
          source: leafId,
          sourceHandle: `handle-${category}`,
          target: targetId,
        })
      }
      if (intentConfig?.defaultGroupId) {
        const defaultTargetId = `target-${leafId}-default`
        nodes.push({
          id: defaultTargetId,
          type: 'target',
          position: { x: 400, y: 0 },
          data: { actionType: 'route_to_group', targetId: intentConfig.defaultGroupId },
        })
        edges.push({
          id: `e-${leafId}-default`,
          source: leafId,
          sourceHandle: 'handle-default',
          target: defaultTargetId,
        })
      }
      break
    }
    case 'capability': {
      const capabilityConfig = spec.action.capabilityConfig
      const capabilities = capabilityConfig ? Object.keys(capabilityConfig.capabilityMap) : []
      nodes.push({
        id: leafId,
        type: 'capability',
        position: { x: 200, y: 0 },
        data: { capabilityConfig: { capabilities } },
      })
      for (const capability of capabilities) {
        const targetId = `target-${leafId}-${capability}`
        nodes.push({
          id: targetId,
          type: 'target',
          position: { x: 400, y: 0 },
          data: {
            actionType: 'route_to_group',
            targetId: capabilityConfig?.capabilityMap[capability],
          },
        })
        edges.push({
          id: `e-${leafId}-${capability}`,
          source: leafId,
          sourceHandle: `handle-${capability}`,
          target: targetId,
        })
      }
      if (capabilityConfig?.defaultGroupId) {
        const defaultTargetId = `target-${leafId}-default`
        nodes.push({
          id: defaultTargetId,
          type: 'target',
          position: { x: 400, y: 0 },
          data: { actionType: 'route_to_group', targetId: capabilityConfig.defaultGroupId },
        })
        edges.push({
          id: `e-${leafId}-default`,
          source: leafId,
          sourceHandle: 'handle-default',
          target: defaultTargetId,
        })
      }
      break
    }
    case 'reject':
      nodes.push({
        id: leafId,
        type: 'reject',
        position: { x: 200, y: 0 },
        data: { reason: (spec.action as { reason?: string }).reason ?? '' },
      })
      break
    case 'fallback':
      nodes.push({
        id: leafId,
        type: 'fallback',
        position: { x: 200, y: 0 },
        data: { reason: (spec.action as { reason?: string }).reason ?? '' },
      })
      break
  }

  return { nodes, edges }
}

/**
 * Persist a route spec as the active route_rules version for spec.amId
 * and trigger a synchronous engine rebuild.
 */
export async function seedCanvasRoute(spec: SeedRouteSpec): Promise<void> {
  const graph = buildCanvasGraphFromRoute(spec)
  const draft = await saveDraft(spec.amId, graph, { name: 'test-route' })
  await activateVersion(draft.id)
  getRouteRuleEngine().rebuild()
}

/**
 * Clear all route_rules rows and reset the in-memory engine index.
 * Call this in beforeEach when you need a clean slate.
 */
export async function resetCanvasStateForTests(): Promise<void> {
  const db = getDatabase()
  await db.execute(sql`DELETE FROM route_rules`)
  clearRouteRuleCache()
  await loadAllActiveRouteRules()
  getRouteRuleEngine().rebuild()
}
