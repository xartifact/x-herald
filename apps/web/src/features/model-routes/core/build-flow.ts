import type { Node, Edge } from '@xyflow/react'

import type { ModelRoute } from '../types'

export interface VirtualModelFlowData {
  id: string
  name: string
  displayName: string | null
}

export interface ModelGroupFlowData {
  id: string
  name: string
  displayName: string | null
}

export interface ModelInstanceFlowData {
  id: string
  name: string
}

const ACTION_LABELS: Record<string, string> = {
  route_to_virtual_model: '虚拟模型',
  route_to_group: '模型组',
  route_to_instance: '实例',
  reject: '拒绝',
  fallback: '降级',
}

function getTargetName(
  actionType: string,
  targetId: string | undefined,
  vmMap: Map<string, string>,
  groupMap: Map<string, string>,
  instanceMap: Map<string, string>,
): string {
  if (!targetId) return '未指定'
  switch (actionType) {
    case 'route_to_virtual_model': return vmMap.get(targetId) || '未指定'
    case 'route_to_group': return groupMap.get(targetId) || '未指定'
    case 'route_to_instance': return instanceMap.get(targetId) || '未指定'
    default: return '未指定'
  }
}

/**
 * 将 DB 路由规则重建为 React Flow 节点/边（条件链范式）。
 * 每条路由的 N 个条件会生成 N 个条件节点，通过 true 边串联。
 */
export function buildFlowFromData(
  routes: ModelRoute[],
  vms: VirtualModelFlowData[],
  groups: ModelGroupFlowData[],
  instances: ModelInstanceFlowData[],
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const vmMap = new Map(vms.map(vm => [vm.id, vm.displayName || vm.name]))
  const groupMap = new Map(groups.map(g => [g.id, g.displayName || g.name]))
  const instanceMap = new Map(instances.map(i => [i.id, i.name]))

  // VM 入口节点（顶部行）
  vms.forEach((vm, index) => {
    nodes.push({
      id: `vm-${vm.id}`,
      type: 'modelTrigger',
      position: { x: index * 260, y: 0 },
      data: {
        label: vm.displayName || vm.name,
        modelName: vm.name,
        vmId: vm.id,
      },
    })
  })

  // 按优先级排序路由
  const sortedRoutes = [...routes].sort((a, b) => a.priority - b.priority)

  sortedRoutes.forEach((route, colIndex) => {
    const baseX = colIndex * 320
    const opacityStyle = route.enabled ? undefined : { opacity: 0.4 }
    const conditions = route.conditions || []
    const condCount = conditions.length

    // 生成条件节点（串联）
    for (let i = 0; i < condCount; i++) {
      const cond = conditions[i]
      const condNodeId = `cond-${route.id}-${i}`
      const y = 200 + i * 160

      nodes.push({
        id: condNodeId,
        type: 'condition',
        position: { x: baseX, y },
        data: {
          label: i === 0 ? (route.name || '条件') : `条件 ${i + 1}`,
          field: cond.field,
          operator: cond.operator,
          value: String(cond.value ?? ''),
          routeId: route.id,
          condIndex: i,
        },
        style: opacityStyle,
      })

      if (i === 0) {
        route.virtualModelIds?.forEach(vmId => {
          edges.push({
            id: `e-vm-${vmId}-${condNodeId}`,
            source: `vm-${vmId}`,
            target: condNodeId,
            label: vmMap.get(vmId),
          })
        })
      } else {
        const prevId = `cond-${route.id}-${i - 1}`
        edges.push({
          id: `e-${prevId}-true-${condNodeId}`,
          source: prevId,
          sourceHandle: 'true',
          target: condNodeId,
        })
      }
    }

    // 叶节点（目标 / 拒绝 / 降级）
    const leafY = 200 + condCount * 160
    const action = route.action

    const connectLeaf = (leafId: string) => {
      if (condCount > 0) {
        const lastCondId = `cond-${route.id}-${condCount - 1}`
        edges.push({
          id: `e-${lastCondId}-true-${leafId}`,
          source: lastCondId,
          sourceHandle: 'true',
          target: leafId,
        })
      } else {
        route.virtualModelIds?.forEach(vmId => {
          edges.push({
            id: `e-vm-${vmId}-${leafId}`,
            source: `vm-${vmId}`,
            target: leafId,
            label: vmMap.get(vmId),
          })
        })
      }
    }

    if (action.type === 'reject') {
      const leafId = `reject-${route.id}`
      nodes.push({
        id: leafId,
        type: 'reject',
        position: { x: baseX, y: leafY },
        data: { label: '拒绝', strategyType: 'reject', reason: action.reason || '', routeId: route.id },
        style: opacityStyle,
      })
      connectLeaf(leafId)
    } else if (action.type === 'fallback') {
      const leafId = `fallback-${route.id}`
      nodes.push({
        id: leafId,
        type: 'fallback',
        position: { x: baseX, y: leafY },
        data: { label: '降级', strategyType: 'fallback', routeId: route.id },
        style: opacityStyle,
      })
      connectLeaf(leafId)
    } else {
      const leafId = `target-${route.id}`
      const targetName = getTargetName(action.type, action.targetId, vmMap, groupMap, instanceMap)
      const typeLabel = ACTION_LABELS[action.type] || action.type
      nodes.push({
        id: leafId,
        type: 'target',
        position: { x: baseX, y: leafY },
        data: {
          label: typeLabel,
          actionType: action.type,
          targetType: action.type === 'route_to_group' ? 'model_group' :
                      action.type === 'route_to_instance' ? 'model_instance' : 'virtual_model',
          targetName,
          targetId: action.targetId,
          ruleName: route.name || '未命名规则',
          routeId: route.id,
        },
        style: opacityStyle,
      })
      connectLeaf(leafId)
    }
  })

  return { nodes, edges }
}
