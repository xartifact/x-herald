'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  type Connection,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Redo2, Save, Undo } from 'lucide-react'

import { Button } from '@/ui/button'

import { buildFlowFromData } from '../core/build-flow'
import { syncFlowToDB } from '../core/sync-flow'
import type { ModelRoute } from '../types'
import { NodePalette } from './node-palette'
import { ConditionNode } from './nodes/condition-node'
import { ModelTriggerNode } from './nodes/model-trigger-node'
import { StrategyNode } from './nodes/strategy-node'
import { TargetNode } from './nodes/target-node'

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
  onNodeDoubleClick?: (node: Node, routeId: string | null) => void
  onAddNode?: (nodeType: string, extraData?: Record<string, unknown>) => void
}

const nodeTypes = {
  modelTrigger: ModelTriggerNode,
  condition: ConditionNode,
  target: TargetNode,
  reject: StrategyNode,
  fallback: StrategyNode,
}

/** 默认节点数据，按类型提供合理的初始值 */
function getDefaultNodeData(nodeType: string): Record<string, unknown> {
  switch (nodeType) {
    case 'modelTrigger':
      return { label: '虚拟模型', modelName: '' }
    case 'condition':
      return { label: '条件判断', field: '', operator: 'eq', value: '' }
    case 'target':
      return { label: '路由目标', targetType: 'model_group', targetName: '' }
    case 'reject':
      return { label: '拒绝策略', strategyType: 'reject', reason: '' }
    case 'fallback':
      return { label: '降级策略', strategyType: 'fallback', reason: '' }
    default:
      return { label: '节点' }
  }
}

/** 最大历史步数 */
const MAX_HISTORY_STEPS = 50

interface FlowCanvasProps {
  initialNodes: Node[]
  initialEdges: Edge[]
  routes: ModelRoute[]
  vms: VirtualModel[]
  onNodeClick?: (nodeId: string, nodeType: string) => void
  onNodeDoubleClick?: (node: Node, routeId: string | null) => void
  onAddNode?: (nodeType: string, extraData?: Record<string, unknown>) => void
  refreshKey: number | string
}

/** 内部画布组件 — 必须在 ReactFlowProvider 内部使用 useReactFlow */
function FlowCanvas({
  initialNodes,
  initialEdges,
  routes,
  vms,
  onNodeClick,
  onNodeDoubleClick,
  onAddNode,
  refreshKey,
}: FlowCanvasProps) {
  const { deleteElements } = useReactFlow()

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // --- 撤销/重做历史栈 ---
  const [history, setHistory] = useState<Array<{ nodes: Node[]; edges: Edge[] }>>([
    { nodes: initialNodes, edges: initialEdges },
  ])
  const [historyIndex, setHistoryIndex] = useState(0)
  // 跳过历史记录标记：当变更来自 undo/redo 或外部 sync 时不推入历史
  const skipHistoryRef = useRef(false)

  // 保存中状态
  const [saving, setSaving] = useState(false)

  // 深拷贝当前节点/边（用于历史快照）
  const snapshot = useCallback((ns: Node[], es: Edge[]) => ({
    nodes: JSON.parse(JSON.stringify(ns)) as Node[],
    edges: JSON.parse(JSON.stringify(es)) as Edge[],
  }), [])

  const pushToHistory = useCallback(
    (newNodes: Node[], newEdges: Edge[]) => {
      if (skipHistoryRef.current) {
        skipHistoryRef.current = false
        return
      }
      setHistory((prev) => {
        const truncated = prev.slice(0, historyIndex + 1)
        truncated.push(snapshot(newNodes, newEdges))
        return truncated.length > MAX_HISTORY_STEPS
          ? truncated.slice(-MAX_HISTORY_STEPS)
          : truncated
      })
      setHistoryIndex((prev) => Math.min(prev + 1, MAX_HISTORY_STEPS - 1))
    },
    [historyIndex, snapshot],
  )

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return
    const newIndex = historyIndex - 1
    setHistoryIndex(newIndex)
    setNodes(JSON.parse(JSON.stringify(history[newIndex].nodes)) as Node[])
    setEdges(JSON.parse(JSON.stringify(history[newIndex].edges)) as Edge[])
  }, [historyIndex, history, setNodes, setEdges])

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1) return
    const newIndex = historyIndex + 1
    setHistoryIndex(newIndex)
    setNodes(JSON.parse(JSON.stringify(history[newIndex].nodes)) as Node[])
    setEdges(JSON.parse(JSON.stringify(history[newIndex].edges)) as Edge[])
  }, [historyIndex, history, setNodes, setEdges])

  const canUndo = historyIndex > 0
  const canRedo = historyIndex < history.length - 1

  // --- 保存 ---
  const handleSave = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      const result = await syncFlowToDB(nodes, edges, routes, vms)
      if (result.updatedRoutes.length > 0) {
        console.log(`syncFlowToDB: synced ${result.updatedRoutes.length} routes`)
      }
      // 保存成功后将当前状态推入历史
      pushToHistory(nodes, edges)
    } catch (err) {
      console.error('syncFlowToDB failed:', err)
    } finally {
      setSaving(false)
    }
  }, [nodes, edges, routes, vms, pushToHistory])

  // Sync canvas state when routes change (new route created, etc.)
  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
    // 重置历史
    setHistory([{ nodes: JSON.parse(JSON.stringify(initialNodes)) as Node[], edges: JSON.parse(JSON.stringify(initialEdges)) as Edge[] }])
    setHistoryIndex(0)
  }, [refreshKey, initialNodes, initialEdges, setNodes, setEdges])

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const next = addEdge(params, eds)
        // 在下一帧推历史（此时 nodes 还没变）
        requestAnimationFrame(() => pushToHistory(nodes, next))
        return next
      })
    },
    [setEdges, nodes, pushToHistory],
  )

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeClick?.(node.id, node.type || '')
    },
    [onNodeClick],
  )

  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === 'modelTrigger') {
        return // No action for virtual model entry nodes
      }
      const nodeId = node.id
      if (nodeId.startsWith('cond-')) {
        const routeId = nodeId.slice(5)
        onNodeDoubleClick?.(node, routeId)
      } else if (nodeId.startsWith('target-')) {
        const routeId = nodeId.slice(7)
        onNodeDoubleClick?.(node, routeId)
      } else {
        // 从节点面板添加的新节点 — 打开创建对话框
        onNodeDoubleClick?.(node, null)
      }
    },
    [onNodeDoubleClick],
  )

  const handleAddNode = useCallback(
    (nodeType: string, extraData?: Record<string, unknown>) => {
      const newNode: Node = {
        id: `node-${crypto.randomUUID()}`,
        type: nodeType,
        position: {
          x: 300 + Math.random() * 200,
          y: 150 + Math.random() * 100,
        },
        data: {
          ...getDefaultNodeData(nodeType),
          ...extraData,
        },
      }
      setNodes((nds) => {
        const next = [...nds, newNode]
        requestAnimationFrame(() => pushToHistory(next, edges))
        return next
      })
      onAddNode?.(nodeType, extraData)
    },
    [setNodes, edges, onAddNode, pushToHistory],
  )

  /** 包装 onNodesChange：拖拽结束后推入历史 */
  const wrappedOnNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes)
      // 只在拖拽结束（位置变化完成）时推历史
      const hasDragEnd = changes.some(
        (c) => c.type === 'position' && c.dragging === false,
      )
      if (hasDragEnd) {
        requestAnimationFrame(() => pushToHistory(nodes, edges))
      }
      // 删除节点也推历史
      const hasRemove = changes.some((c) => c.type === 'remove')
      if (hasRemove) {
        requestAnimationFrame(() => pushToHistory(nodes, edges))
      }
    },
    [onNodesChange, nodes, edges, pushToHistory],
  )

  /** 包装 onEdgesChange：删除边时推入历史 */
  const wrappedOnEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes)
      const hasRemove = changes.some((c) => c.type === 'remove')
      if (hasRemove) {
        requestAnimationFrame(() => pushToHistory(nodes, edges))
      }
    },
    [onEdgesChange, nodes, edges, pushToHistory],
  )

  /** Delete/Backspace 键删除选中的节点和连线（文档级监听）+ Undo/Redo/Save 快捷键 */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 撤销: Ctrl/Cmd + Z (无 Shift)
      if ((event.metaKey || event.ctrlKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault()
        handleUndo()
        return
      }
      // 重做: Ctrl/Cmd + Shift + Z
      if ((event.metaKey || event.ctrlKey) && event.key === 'z' && event.shiftKey) {
        event.preventDefault()
        handleRedo()
        return
      }
      // 重做: Ctrl/Cmd + Y (备选快捷键)
      if ((event.metaKey || event.ctrlKey) && event.key === 'y') {
        event.preventDefault()
        handleRedo()
        return
      }
      // 保存: Ctrl/Cmd + S
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault()
        handleSave()
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        // 避免在输入框中误触发
        const target = event.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return
        }
        // 收集选中节点和连线的 id
        const selectedNodeIds = nodes.filter((n) => n.selected).map((n) => ({ id: n.id }))
        const selectedEdgeIds = edges.filter((e) => e.selected).map((e) => ({ id: e.id }))
        if (selectedNodeIds.length > 0 || selectedEdgeIds.length > 0) {
          deleteElements({ nodes: selectedNodeIds, edges: selectedEdgeIds })
          requestAnimationFrame(() => pushToHistory(nodes, edges))
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [deleteElements, nodes, edges, handleUndo, handleRedo, handleSave, pushToHistory])

  /** 双击连线删除该连线 */
  const handleEdgeDoubleClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setEdges((eds) => {
        const next = eds.filter((e) => e.id !== edge.id)
        requestAnimationFrame(() => pushToHistory(nodes, next))
        return next
      })
    },
    [setEdges, nodes, pushToHistory],
  )

  /** 点击空白区域取消所有选中 */
  const handlePaneClick = useCallback(() => {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: false })))
    setEdges((eds) => eds.map((e) => ({ ...e, selected: false })))
  }, [setNodes, setEdges])

  return (
    <div className="h-full w-full flex flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-1 border-b px-3 py-1.5 bg-background shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleUndo}
          disabled={!canUndo}
          title="撤销 (Ctrl+Z)"
        >
          <Undo className="h-4 w-4" />
          <span className="text-xs">撤销</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRedo}
          disabled={!canRedo}
          title="重做 (Ctrl+Shift+Z)"
        >
          <Redo2 className="h-4 w-4" />
          <span className="text-xs">重做</span>
        </Button>
        <div className="mx-2 h-4 w-px bg-border" />
        <Button
          variant="outline"
          size="sm"
          onClick={handleSave}
          disabled={saving}
          title="保存 (Ctrl+S)"
        >
          <Save className="h-4 w-4" />
          <span className="text-xs">{saving ? '保存中...' : '保存'}</span>
        </Button>
      </div>

      {/* 画布区域：左侧面板 + ReactFlow */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧节点模板面板 */}
        <div className="w-[240px] shrink-0 border-r">
          <NodePalette onAddNode={handleAddNode} />
        </div>

        {/* 画布 */}
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={wrappedOnNodesChange}
            onEdgesChange={wrappedOnEdgesChange}
            onConnect={onConnect}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            onEdgeDoubleClick={handleEdgeDoubleClick}
            onPaneClick={handlePaneClick}
            nodeTypes={nodeTypes}
            nodesDraggable
            nodesConnectable
            fitView
            className="bg-gray-50"
          >
            <Controls />
            <MiniMap
              pannable
              zoomable
              className="rounded-lg border shadow-sm"
              nodeColor={(node) => {
                if (node.type === 'reject') return '#ef4444'
                if (node.type === 'fallback') return '#f97316'
                if (node.type === 'condition') return '#3b82f6'
                if (node.type === 'target') return '#22c55e'
                return '#6366f1'
              }}
            />
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          </ReactFlow>
        </div>
      </div>
    </div>
  )
}

/** Flow 编辑器主组件 — 包裹 ReactFlowProvider 以支持交互模式 */
export function FlowEditor({ routes, vms, groups, instances, selectedRouteId, onNodeClick, onNodeDoubleClick, onAddNode }: FlowEditorProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildFlowFromData(routes, vms, groups, instances, selectedRouteId),
    [routes, vms, groups, instances, selectedRouteId],
  )

  const refreshKey = `${selectedRouteId ?? 'all'}-${routes.length}-${vms.length}`

  return (
    <ReactFlowProvider>
      <FlowCanvas
        key={selectedRouteId ?? 'all'}
        initialNodes={initialNodes}
        initialEdges={initialEdges}
        routes={routes}
        vms={vms}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onAddNode={onAddNode}
        refreshKey={refreshKey}
      />
    </ReactFlowProvider>
  )
}
