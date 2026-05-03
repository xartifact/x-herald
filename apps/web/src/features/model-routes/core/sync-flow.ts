import type { Node, Edge } from '@xyflow/react'

import { put } from '@/core/lib/api-client'

import type { ModelRoute, SyncResult, RouteCondition, RouteAction } from '../types'

/**
 * 从节点 ID 提取路由 ID。
 *
 * 节点 ID 格式：
 *   cond-{routeId}  → 条件节点
 *   target-{routeId} → 目标节点
 */
function extractRouteIdFromNodeId(nodeId: string): string | null {
  if (nodeId.startsWith('cond-')) {
    return nodeId.slice(5)
  }
  if (nodeId.startsWith('target-')) {
    return nodeId.slice(7)
  }
  return null
}

/**
 * 从边中提取虚拟模型 ID。
 *
 * 源节点格式：vm-{vmId}
 */
function extractVmIdFromSource(sourceId: string): string | null {
  if (sourceId.startsWith('vm-')) {
    return sourceId.slice(3)
  }
  return null
}

/**
 * 从画布连线中构建 routeId → virtualModelIds[] 映射。
 *
 * 遍历所有 source 为 vm- 前缀的边，将 VM ID 汇总到对应目标节点的路由下。
 */
function buildRouteVmMapFromEdges(edges: Edge[]): Map<string, string[]> {
  const routeVmMap = new Map<string, Set<string>>()

  for (const edge of edges) {
    const vmId = extractVmIdFromSource(edge.source)
    if (!vmId) continue

    const routeId = extractRouteIdFromNodeId(edge.target)
    if (!routeId) continue

    if (!routeVmMap.has(routeId)) {
      routeVmMap.set(routeId, new Set())
    }
    routeVmMap.get(routeId)!.add(vmId)
  }

  const result = new Map<string, string[]>()
  for (const [routeId, vmSet] of routeVmMap) {
    result.set(routeId, Array.from(vmSet))
  }
  return result
}

/**
 * 比较两个数组是否内容相同（忽略顺序）。
 */
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((val, idx) => val === sortedB[idx])
}

/**
 * 从条件节点数据构造 RouteCondition[]。
 */
function buildConditionsFromNode(node: Node): RouteCondition[] {
  const data = node.data as Record<string, unknown>
  return [
    {
      field: String(data.field ?? ''),
      operator: (data.operator as RouteCondition['operator']) ?? 'eq',
      value: data.value,
    },
  ]
}

/**
 * 从目标/拒绝节点数据构造 RouteAction。
 *
 * 注意：画布节点不直接存储完整的 action 信息，
 * 此函数尽量还原 action 结构；如果数据不足则保留原值。
 */
function buildActionFromNode(node: Node, originalAction: RouteAction): RouteAction {
  const data = node.data as Record<string, unknown>

  if (node.type === 'reject') {
    return {
      type: 'reject',
      reason: (data.reason as string | undefined) ?? originalAction.reason,
    }
  }

  // target 节点：还原 action 类型
  // 优先使用 actionType（原始 action type），否则从 targetType 反推
  const actionType = (data.actionType as RouteAction['type']) ?? (() => {
    const targetType = String(data.targetType ?? '')
    if (targetType === 'model_group') return 'route_to_group' as const
    if (targetType === 'model_instance') return 'route_to_instance' as const
    if (targetType === 'virtual_model') return 'route_to_virtual_model' as const
    return originalAction.type
  })()

  return {
    type: actionType,
    targetId: (data.targetId as string | undefined) ?? originalAction.targetId,
    reason: originalAction.reason,
  }
}

/**
 * 将画布状态同步回数据库路由表。
 *
 * 策略：last-write-wins，无并发控制。
 * 遍历画布连线 → 更新 virtualModelIds；
 * 遍历规则节点 → 更新 conditions / action / name。
 * 如果某条路由更新失败，记录错误但继续处理其他路由。
 *
 * @param nodes  当前画布节点
 * @param edges  当前画布连线
 * @param routes 当前 DB 中的路由数据
 * @param vms    虚拟模型列表（用于验证 VM ID 有效性）
 * @returns 同步结果，包含更新/新建/删除的路由 ID
 */
export async function syncFlowToDB(
  nodes: Node[],
  edges: Edge[],
  routes: ModelRoute[],
  vms: { id: string; name: string }[]
): Promise<SyncResult> {
  const result: SyncResult = {
    updatedRoutes: [],
  }

  const vmIdSet = new Set(vms.map((vm) => vm.id))
  const routeMap = new Map(routes.map((r) => [r.id, r]))

  // 从边构建 routeId → virtualModelIds 映射
  const routeVmMap = buildRouteVmMapFromEdges(edges)

  // 构建节点查找表：routeId → 相关节点（cond / target）
  const condNodesByRoute = new Map<string, Node>()
  const targetNodesByRoute = new Map<string, Node>()

  for (const node of nodes) {
    const routeId = extractRouteIdFromNodeId(node.id)
    if (!routeId) continue

    if (node.type === 'condition') {
      condNodesByRoute.set(routeId, node)
    } else if (node.type === 'target' || node.type === 'reject') {
      targetNodesByRoute.set(routeId, node)
    }
  }

  // 逐路由比对并更新
  for (const [routeId, route] of routeMap) {
    const pendingUpdate: Record<string, unknown> = {}
    let needsUpdate = false

    // 1. 比对 virtualModelIds
    const newVmIds = (routeVmMap.get(routeId) ?? [])
      .filter((vmId) => vmIdSet.has(vmId))

    const originalVmIds = route.virtualModelIds ?? []
    if (!arraysEqual(newVmIds, originalVmIds)) {
      pendingUpdate.virtualModelIds = newVmIds
      needsUpdate = true
    }

    // 2. 比对条件节点数据
    const condNode = condNodesByRoute.get(routeId)
    if (condNode) {
      const condData = condNode.data as Record<string, unknown>
      const currentName = String(condData.label ?? '')
      const originalName = route.name || '未命名规则'

      if (currentName !== originalName && currentName !== '未命名规则') {
        pendingUpdate.name = currentName
        needsUpdate = true
      }

      if (route.conditions && route.conditions.length > 0) {
        const newConditions = buildConditionsFromNode(condNode)
        const origCond = route.conditions[0]
        if (
          newConditions[0].field !== origCond.field ||
          newConditions[0].operator !== origCond.operator ||
          String(newConditions[0].value ?? '') !== String(origCond.value ?? '')
        ) {
          pendingUpdate.conditions = newConditions
          needsUpdate = true
        }
      }
    }

    // 3. 比对目标/拒绝节点数据
    const targetNode = targetNodesByRoute.get(routeId)
    if (targetNode && route.action) {
      const newAction = buildActionFromNode(targetNode, route.action)
      if (
        newAction.type !== route.action.type ||
        newAction.targetId !== route.action.targetId ||
        newAction.reason !== route.action.reason
      ) {
        pendingUpdate.action = newAction
        needsUpdate = true
      }
    }

    // 4. 对于没有条件节点的路由，目标节点可能持有 name
    if (!condNode && targetNode) {
      const targetData = targetNode.data as Record<string, unknown>
      const ruleName = String(targetData.ruleName ?? '')
      if (ruleName && ruleName !== route.name && ruleName !== '未命名规则') {
        pendingUpdate.name = ruleName
        needsUpdate = true
      }
    }

    // 5. 执行更新
    if (needsUpdate) {
      try {
        await put(`/api/model-routes/${routeId}`, pendingUpdate)
        result.updatedRoutes.push(routeId)
      } catch (error) {
        // 单条更新失败不阻断其他路由
        console.error(`syncFlowToDB: failed to update route ${routeId}`, error)
      }
    }
  }

  // 检测画布中存在但 DB 中不存在的路由 ID → 新建
  for (const [routeId] of routeVmMap) {
    if (!routeMap.has(routeId)) {
      // 画布上有连线但 DB 无对应路由，暂不自动创建（需用户显式操作）
      // 未来可扩展：根据节点数据构造 CreateModelRoutePayload 并 POST
    }
  }

  // 检测 DB 中存在但画布无连线的路由 → 不自动删除（需用户显式操作）

  return result
}
