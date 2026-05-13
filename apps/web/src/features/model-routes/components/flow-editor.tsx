'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  Background,
  Panel,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  type Connection,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { GitBranch, Layers, Ban, ArrowDownToLine } from 'lucide-react'

import { Button } from '@/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/ui/dialog'

import { ConditionNode } from './nodes/condition-node'
import { ModelTriggerNode } from './nodes/model-trigger-node'
import { StrategyNode } from './nodes/strategy-node'
import { TargetNode } from './nodes/target-node'
import { getLayoutedElements } from '../core/layout-flow'
import { generateId } from '@/lib/shared-utils'
import { PropertyPanel } from './property-panel'

const nodeTypes = {
  modelTrigger: ModelTriggerNode,
  condition: ConditionNode,
  target: TargetNode,
  reject: StrategyNode,
  fallback: StrategyNode,
}

const NODE_TEMPLATES = [
  {
    type: 'condition',
    label: '条件节点',
    desc: '按字段匹配请求',
    icon: GitBranch,
    color: 'text-amber-600',
    defaultData: { label: '条件', field: '', operator: 'eq', value: '' },
  },
  {
    type: 'target',
    label: '目标节点',
    desc: '路由到模型组/实例',
    icon: Layers,
    color: 'text-green-600',
    defaultData: { label: '目标', actionType: 'route_to_group', targetId: '', targetName: '' },
  },
  {
    type: 'reject',
    label: '拒绝节点',
    desc: '拒绝请求返回错误',
    icon: Ban,
    color: 'text-red-600',
    defaultData: { label: '拒绝', strategyType: 'reject', reason: '' },
  },
  {
    type: 'fallback',
    label: '降级节点',
    desc: '跳过此规则继续匹配',
    icon: ArrowDownToLine,
    color: 'text-orange-600',
    defaultData: { label: '降级', strategyType: 'fallback' },
  },
]

export interface FlowEditorHandle {
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void
  getState: () => { nodes: Node[]; edges: Edge[] }
}

export interface FlowEditorProps {
  initialNodes: Node[]
  initialEdges: Edge[]
  refreshKey: string
  onNodesEdgesChange: (nodes: Node[], edges: Edge[]) => void
  onNodeSelect: (node: Node | null) => void
  selectedNode: Node | null
  onUpdateNodeData: (nodeId: string, data: Record<string, unknown>) => void
}

type FlowCanvasProps = FlowEditorProps

const FlowCanvas = forwardRef<FlowEditorHandle, FlowCanvasProps>(function FlowCanvas(
  { initialNodes, initialEdges, refreshKey, onNodesEdgesChange, onNodeSelect, selectedNode, onUpdateNodeData },
  ref,
) {
  const { screenToFlowPosition, deleteElements, fitView } = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addPosition, setAddPosition] = useState({ x: 300, y: 300 })

  // Refs to always point to latest state values, avoiding stale closures in setTimeout callbacks
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const edgesRef = useRef(edges)
  edgesRef.current = edges

  // 暴露命令式 API 给父组件
  useImperativeHandle(ref, () => ({
    updateNodeData: (nodeId, data) => {
      setNodes(nds => nds.map(n => (n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n)))
    },
    getState: () => ({ nodes, edges }),
  }), [nodes, edges, setNodes])

  // deploy 成功后 refreshKey 变化，重置画布为新的 DB 数据
  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // 只拦截用户真实操作（拖拽、删除）才触发 dirty，忽略 fitView/dimensions 等自动变化
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes)
    const isUserAction = changes.some(
      c => c.type === 'remove' || (c.type === 'position' && c.dragging),
    )
    if (isUserAction) onNodesEdgesChange([], [])
    // Only trigger layout on node removal, not on drag
    if (changes.some(c => c.type === 'remove')) {
      setTimeout(() => {
        const remainingNodes = nodesRef.current
        const currentEdges = edgesRef.current.filter(e =>
          remainingNodes.some(n => n.id === e.source) && remainingNodes.some(n => n.id === e.target)
        )
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(remainingNodes, currentEdges)
        setNodes(layoutedNodes)
        setEdges(layoutedEdges)
        fitView({ duration: 200 })
      }, 0)
    }
  }, [onNodesChange, onNodesEdgesChange, setEdges, fitView])

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChange(changes)
    const isUserAction = changes.some(c => c.type === 'remove')
    if (isUserAction) onNodesEdgesChange([], [])
  }, [onEdgesChange, onNodesEdgesChange])

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges(eds => addEdge(params, eds))
      onNodesEdgesChange([], [])
      // Trigger layout after connecting
      setTimeout(() => {
        const newEdge = addEdge(params, edgesRef.current)
        const currentEdges = newEdge.length > edgesRef.current.length ? newEdge : edgesRef.current
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodesRef.current, currentEdges)
        setNodes(layoutedNodes)
        fitView({ duration: 200 })
        setEdges(layoutedEdges)
      }, 0)
    },
    [setEdges, onNodesEdgesChange],
  )

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => onNodeSelect(node),
    [onNodeSelect],
  )

  const handlePaneClick = useCallback(() => onNodeSelect(null), [onNodeSelect])

  // 双击画布空白区域（排除节点和连线）
  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement
      // 只响应画布背景（.react-flow__pane），忽略节点和控件
      if (!target.classList.contains('react-flow__pane')) return
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      setAddPosition(pos)
      setAddDialogOpen(true)
    },
    [screenToFlowPosition],
  )

  const handleAddNode = useCallback(
    (template: (typeof NODE_TEMPLATES)[number]) => {
      const newNode: Node = {
        id: `${template.type}-new-${generateId()}`,
        type: template.type,
        position: addPosition,
        data: { ...template.defaultData },
      }
      setNodes(nds => [...nds, newNode])
      setAddDialogOpen(false)
      onNodesEdgesChange([], [])
      // Trigger layout after adding node
      setTimeout(() => {
        // nodesRef.current may already include newNode (if React re-rendered before setTimeout fires)
        // so check before appending to avoid duplication
        const alreadyHasNewNode = nodesRef.current.some(n => n.id === newNode.id)
        const currentNodes = alreadyHasNewNode ? nodesRef.current : [...nodesRef.current, newNode]
        const currentEdges = edgesRef.current
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(currentNodes, currentEdges)
        setNodes(layoutedNodes)
        fitView({ duration: 200 })
        setEdges(layoutedEdges)
      }, 0)
    },
    [addPosition, setNodes, onNodesEdgesChange],
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
      const selNodes = nodes.filter(n => n.selected).map(n => ({ id: n.id }))
      const selEdges = edges.filter(e => e.selected).map(e => ({ id: e.id }))
      if (selNodes.length > 0 || selEdges.length > 0) {
        deleteElements({ nodes: selNodes, edges: selEdges })
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [nodes, edges, deleteElements])

  return (
    <div className="h-full w-full flex flex-col">
      <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b bg-background text-xs text-muted-foreground">
        <span>双击画布空白处添加节点</span>
        <span className="text-border">·</span>
        <span>拖动节点手柄创建连线</span>
        <span className="text-border">·</span>
        <span>Delete 键删除选中元素</span>
      </div>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="flex-1 min-h-0" onDoubleClick={handleDoubleClick}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          onNodeDoubleClick={(_: React.MouseEvent, node: Node) => onNodeSelect(node)}
          nodeTypes={nodeTypes}
          nodesDraggable
          nodesConnectable
          fitView
          zoomOnDoubleClick={false}
          className="bg-gray-50"
        >
          <Controls />
          <MiniMap
            pannable
            zoomable
            className="rounded-lg border shadow-sm"
            nodeColor={node => {
              if (node.type === 'reject') return '#ef4444'
              if (node.type === 'fallback') return '#f97316'
              if (node.type === 'condition') return '#f59e0b'
              if (node.type === 'target') return '#22c55e'
              return '#3b82f6'
            }}
          />
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />

          {/* 属性面板 — 内置画布右上角，选中节点时显示 */}
          <Panel position="top-right" className="pointer-events-none">
            <div
              className="pointer-events-auto w-[300px] max-h-[calc(100vh-160px)] bg-background border rounded-lg shadow-lg overflow-hidden transition-all"
            >
              <PropertyPanel
                selectedNode={selectedNode}
                onUpdate={onUpdateNodeData}
              />
            </div>
          </Panel>
        </ReactFlow>
      </div>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">选择节点类型</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 pt-1">
            {NODE_TEMPLATES.map(t => {
              const Icon = t.icon
              return (
                <Button
                  key={t.type}
                  variant="outline"
                  className="h-auto flex-col items-start gap-1 p-3 text-left"
                  onClick={() => handleAddNode(t)}
                >
                  <div className={`flex items-center gap-1.5 ${t.color} font-medium text-xs`}>
                    <Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </div>
                  <span className="text-[11px] text-muted-foreground font-normal">{t.desc}</span>
                </Button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
})

/** Flow 编辑器主组件，包裹 ReactFlowProvider，通过 ref 暴露命令式 API */
export const FlowEditor = forwardRef<FlowEditorHandle, FlowEditorProps>(
  function FlowEditor(props, ref) {
    return (
      <ReactFlowProvider>
        <FlowCanvas ref={ref} {...props} />
      </ReactFlowProvider>
    )
  },
)
