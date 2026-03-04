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

interface FlowEditorProps {
  routes: ModelRoute[]
  virtualModels: Array<{ id: string; name: string; displayName: string | null }>
  onNodeClick?: (nodeId: string, nodeType: string) => void
}

const nodeTypes = {
  modelTrigger: ModelTriggerNode,
  condition: ConditionNode,
  target: TargetNode,
  reject: RejectNode,
}

function buildFlowFromData(
  routes: ModelRoute[],
  virtualModels: Array<{ id: string; name: string; displayName: string | null }>
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  // 为每个虚拟模型创建起点节点
  virtualModels.forEach((vm, index) => {
    nodes.push({
      id: `vm-${vm.id}`,
      type: 'modelTrigger',
      position: { x: index * 250, y: 0 },
      data: { label: vm.displayName || vm.name, modelName: vm.name },
    })
  })

  // 为每条路由规则生成节点和连线
  routes.forEach((route, rIndex) => {
    const baseX = rIndex * 300
    const baseY = 150

    // 如果路由有条件，创建条件节点
    if (route.conditions && route.conditions.length > 0) {
      const condId = `cond-${route.id}`
      const condLabel = route.conditions
        .map((c) => `${c.field} ${c.operator} ${c.value ?? ''}`)
        .join(' & ')

      nodes.push({
        id: condId,
        type: 'condition',
        position: { x: baseX, y: baseY },
        data: {
          label: route.name,
          field: route.conditions[0].field,
          operator: route.conditions[0].operator,
          value: String(route.conditions[0].value ?? ''),
        },
      })

      // 从虚拟模型连接到条件节点
      if (route.virtualModelId) {
        edges.push({
          id: `e-vm-${route.virtualModelId}-${condId}`,
          source: `vm-${route.virtualModelId}`,
          target: condId,
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
        })
      } else {
        nodes.push({
          id: targetId,
          type: 'target',
          position: { x: baseX - 60, y: baseY + 150 },
          data: {
            label: action.targetId || action.type,
            targetType: action.type.replace('route_to_', ''),
            targetName: action.targetId || action.type,
          },
        })
      }

      edges.push({
        id: `e-${condId}-true-${targetId}`,
        source: condId,
        sourceHandle: 'true',
        target: targetId,
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
        })
      } else {
        nodes.push({
          id: targetId,
          type: 'target',
          position: { x: baseX, y: baseY },
          data: {
            label: action.targetId || action.type,
            targetType: action.type.replace('route_to_', ''),
            targetName: action.targetId || action.type,
          },
        })
      }

      if (route.virtualModelId) {
        edges.push({
          id: `e-vm-${route.virtualModelId}-${targetId}`,
          source: `vm-${route.virtualModelId}`,
          target: targetId,
        })
      }
    }
  })

  return { nodes, edges }
}

export function FlowEditor({ routes, virtualModels, onNodeClick }: FlowEditorProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildFlowFromData(routes, virtualModels),
    [routes, virtualModels]
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
