import type { Node, Edge } from '@xyflow/react'

import type { ModelRoute } from '../types'

/** 虚拟模型数据，用于构建 flow */
export interface VirtualModelFlowData {
  id: string
  name: string
  displayName: string | null
}

/** 模型组数据，用于目标名称查找 */
export interface ModelGroupFlowData {
  id: string
  name: string
  displayName: string | null
}

/** 模型实例数据，用于目标名称查找 */
export interface ModelInstanceFlowData {
  id: string
  name: string
}

/** 动作中文标签映射 */
const ACTION_LABELS: Record<string, string> = {
  route_to_virtual_model: '虚拟模型',
  route_to_group: '模型组',
  route_to_instance: '实例',
  reject: '拒绝',
  fallback: '降级',
}

/** 根据 action 类型解析目标显示名称 */
function getTargetName(
  actionType: string,
  targetId: string | undefined,
  vmMap: Map<string, string>,
  groupMap: Map<string, string>,
  instanceMap: Map<string, string>
): string {
  if (!targetId) return '未指定'

  switch (actionType) {
    case 'route_to_virtual_model':
      return vmMap.get(targetId) || '未指定'
    case 'route_to_group':
      return groupMap.get(targetId) || '未指定'
    case 'route_to_instance':
      return instanceMap.get(targetId) || '未指定'
    case 'fallback':
      return vmMap.get(targetId) || '未指定'
    default:
      return '未指定'
  }
}

/**
 * 将 DB 数据转换为 ReactFlow 的 nodes 和 edges。
 *
 * - 为每个虚拟模型生成一个 modelTrigger 节点（顶部行）
 * - 为每条路由生成 condition / target 节点（下方行）
 * - 多 VM 支持：遍历 route.virtualModelIds 为每个 VM 生成一条 edge
 *
 * @param routes   路由规则列表
 * @param vms      虚拟模型列表
 * @param groups   模型组列表（用于目标名称显示）
 * @param instances 模型实例列表（用于目标名称显示）
 * @param selectedRouteId 可选，当前选中的路由 ID（用于高亮）
 */
export function buildFlowFromData(
  routes: ModelRoute[],
  vms: VirtualModelFlowData[],
  groups: ModelGroupFlowData[],
  instances: ModelInstanceFlowData[],
  selectedRouteId?: string | null
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const vmMap = new Map(vms.map((vm) => [vm.id, vm.displayName || vm.name]))
  const groupMap = new Map(groups.map((g) => [g.id, g.displayName || g.name]))
  const instanceMap = new Map(instances.map((i) => [i.id, i.name]))

  // 顶部行：为每个虚拟模型创建 modelTrigger 节点
  vms.forEach((vm, index) => {
    nodes.push({
      id: `vm-${vm.id}`,
      type: 'modelTrigger',
      position: { x: index * 250, y: 0 },
      data: {
        label: vm.displayName || vm.name,
        modelName: vm.name,
      },
    })
  })

  // 下方行：为每条路由生成节点和连线
  routes.forEach((route, rIndex) => {
    const baseX = rIndex * 300
    const baseY = 150
    const isSelected = selectedRouteId === route.id

    if (route.conditions && route.conditions.length > 0) {
      // ── 有条件：condition → target ──
      const condId = `cond-${route.id}`

      nodes.push({
        id: condId,
        type: 'condition',
        position: { x: baseX, y: baseY },
        data: {
          label: route.name || '未命名规则',
          field: route.conditions[0].field,
          operator: route.conditions[0].operator,
          value: String(route.conditions[0].value ?? ''),
        },
        style: isSelected ? { boxShadow: '0 0 0 3px #3b82f6' } : undefined,
      })

      // 从每个关联的虚拟模型连一条边到条件节点
      route.virtualModelIds?.forEach((vmId) => {
        edges.push({
          id: `e-vm-${vmId}-${condId}`,
          source: `vm-${vmId}`,
          target: condId,
          animated: isSelected,
          style: isSelected ? { stroke: '#3b82f6', strokeWidth: 2 } : undefined,
        })
      })

      // 条件为真 → 目标节点
      const targetId = `target-${route.id}`
      const action = route.action

      if (action.type === 'reject') {
        nodes.push({
          id: targetId,
          type: 'reject',
          position: { x: baseX - 60, y: baseY + 150 },
          data: { label: '拒绝', reason: action.reason || '' },
          style: isSelected ? { boxShadow: '0 0 0 3px #3b82f6' } : undefined,
        })
      } else {
        const typeLabel = ACTION_LABELS[action.type] || action.type.replace('route_to_', '')
        const targetName = getTargetName(action.type, action.targetId, vmMap, groupMap, instanceMap)

        nodes.push({
          id: targetId,
          type: 'target',
          position: { x: baseX - 60, y: baseY + 150 },
          data: {
            label: typeLabel,
            actionType: action.type,
            targetType:
              action.type === 'route_to_group'
                ? 'model_group'
                : action.type === 'route_to_instance'
                  ? 'model_instance'
                  : 'virtual_model',
            targetName,
            targetId: action.targetId,
            ruleName: route.name || '未命名规则',
          },
          style: isSelected ? { boxShadow: '0 0 0 3px #3b82f6' } : undefined,
        })
      }

      edges.push({
        id: `e-${condId}-true-${targetId}`,
        source: condId,
        sourceHandle: 'true',
        target: targetId,
        animated: isSelected,
        style: isSelected ? { stroke: '#3b82f6', strokeWidth: 2 } : undefined,
      })
    } else {
      // ── 无条件：直接创建目标节点 ──
      const targetId = `target-${route.id}`
      const action = route.action

      if (action.type === 'reject') {
        nodes.push({
          id: targetId,
          type: 'reject',
          position: { x: baseX, y: baseY },
          data: { label: '拒绝', reason: action.reason || '' },
          style: isSelected ? { boxShadow: '0 0 0 3px #3b82f6' } : undefined,
        })
      } else {
        const typeLabel = ACTION_LABELS[action.type] || action.type.replace('route_to_', '')
        const targetName = getTargetName(action.type, action.targetId, vmMap, groupMap, instanceMap)

        nodes.push({
          id: targetId,
          type: 'target',
          position: { x: baseX, y: baseY },
          data: {
            label: typeLabel,
            actionType: action.type,
            targetType:
              action.type === 'route_to_group'
                ? 'model_group'
                : action.type === 'route_to_instance'
                  ? 'model_instance'
                  : 'virtual_model',
            targetName,
            targetId: action.targetId,
            ruleName: route.name || '未命名规则',
          },
          style: isSelected ? { boxShadow: '0 0 0 3px #3b82f6' } : undefined,
        })
      }

      route.virtualModelIds?.forEach((vmId) => {
        edges.push({
          id: `e-vm-${vmId}-${targetId}`,
          source: `vm-${vmId}`,
          target: targetId,
          animated: isSelected,
          style: isSelected ? { stroke: '#3b82f6', strokeWidth: 2 } : undefined,
        })
      })
    }
  })

  return { nodes, edges }
}
