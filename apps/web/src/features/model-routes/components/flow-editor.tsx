'use client'

import { useCallback, useMemo } from 'react'
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { ModelTriggerNode } from './nodes/model-trigger-node'
import { ConditionNode } from './nodes/condition-node'
import { TargetNode } from './nodes/target-node'
import { RejectNode } from './nodes/reject-node'
import type { ModelRoute } from '../types'

// 虚拟模型类型
interface VirtualModel {
  id: string
  name: string
  displayName: string | null
}

// 模型组类型
interface ModelGroup {
  id: string
  name: string
  displayName: string | null
}

// 模型实例类型
interface ModelInstance {
  id: string
  name: string
}

interface FlowEditorProps {
  routes: ModelRoute[]
  vms: VirtualModel[]
  groups: ModelGroup[]
  instances: ModelInstance[]
  selectedRouteId?: string | null
  onNodeClick?: (nodeId: string, nodeType: string) => void
}

const nodeTypes = {
  modelTrigger: ModelTriggerNode,
  condition: ConditionNode,
  target: TargetNode,
  reject: RejectNode,
}

// 动作中文标签映射
const ACTION_LABELS: Record<string, string> = {
  'route_to_virtual_model': '虚拟模型',
  'route_to_group': '模型组',
  'route_to_instance': '实例',
  'reject': '拒绝',
  'fallback': '降级',
}

// 获取目标名称
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
    default:
      return '未指定'
  }
}

function buildFlowFromData(
  routes: ModelRoute[],
  vms: VirtualModel[],
  groups: ModelGroup[],
  instances: ModelInstance[],
  selectedRouteId?: string | null
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  // 构建查找表
  const vmMap = new Map(vms.map(vm => [vm.id, vm.displayName || vm.name]))
  const groupMap = new Map(groups.map(g => [g.id, g.displayName || g.name]))
  const instanceMap = new Map(instances.map(i => [i.id, i.name]))

  // 为每个虚拟模型创建起点节点（入口）
  vms.forEach((vm, index) => {
    nodes.push({
      id: `vm-${vm.id}`,
      type: 'modelTrigger',
      position: { x: index * 250, y: 0 },
      data: { 
        label: vm.displayName || vm.name, 
        modelName: vm.name 
      },
    })
  })

  // 为每条路由规则生成节点和连线
  routes.forEach((route, rIndex) => {
    const baseX = rIndex * 300
    const baseY = 150

    // 检查是否是被选中的规则
    const isSelected = selectedRouteId === route.id

    // 如果路由有条件，创建条件节点
    if (route.conditions && route.conditions.length > 0) {
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

      // 从虚拟模型连接到条件节点
      if (route.virtualModelId) {
        edges.push({
          id: `e-vm-${route.virtualModelId}-${condId}`,
          source: `vm-${route.virtualModelId}`,
          target: condId,
          animated: isSelected,
          style: isSelected ? { stroke: '#3b82f6', strokeWidth: 2 } : undefined,
        })
      }

      // 条件为真时的目标
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
        const targetName = getTargetName(
          action.type,
          action.targetId,
          vmMap,
          groupMap,
          instanceMap
        )
        
        nodes.push({
          id: targetId,
          type: 'target',
          position: { x: baseX - 60, y: baseY + 150 },
          data: {
            label: typeLabel,
            targetType: action.type.replace('route_to_', ''),
            targetName: targetName,
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
      // 没有条件，直接创建目标节点
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
        const targetName = getTargetName(
          action.type,
          action.targetId,
          vmMap,
          groupMap,
          instanceMap
        )
        
        nodes.push({
          id: targetId,
          type: 'target',
          position: { x: baseX, y: baseY },
          data: {
            label: typeLabel,
            targetType: action.type.replace('route_to_', ''),
            targetName: targetName,
          },
          style: isSelected ? { boxShadow: '0 0 0 3px #3b82f6' } : undefined,
        })
      }

      if (route.virtualModelId) {
        edges.push({
          id: `e-vm-${route.virtualModelId}-${targetId}`,
          source: `vm-${route.virtualModelId}`,
          target: targetId,
          animated: isSelected,
          style: isSelected ? { stroke: '#3b82f6', strokeWidth: 2 } : undefined,
        })
      }
    }
  })

  return { nodes, edges }
}

export function FlowEditor({ routes, vms, groups, instances, selectedRouteId, onNodeClick }: FlowEditorProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildFlowFromData(routes, vms, groups, instances, selectedRouteId),
    [routes, vms, groups, instances, selectedRouteId]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeClick?.(node.id, node.type || '')
    },
    [onNodeClick]
  )

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        className="bg-gray-50"
      >
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      </ReactFlow>
    </div>
  )
}
