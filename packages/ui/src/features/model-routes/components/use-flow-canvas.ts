import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useNodesInitialized,
  useReactFlow,
  useStore,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import type { CanvasGraph } from '@xartifact/x-llm-gateway-shared'
import { toast } from 'sonner'

import { generateId } from '../../../shared/lib/utils'

import type { NodeTemplate } from './flow-editor-constants'
import { runAutoLayout } from '../lib'
import {
  computeFitViewOptions,
  computeGraphStats,
  shouldRefit,
  type GraphStats,
} from '../lib/fit-view-options'
import {
  annotateInvalidEdges,
  getValidSourceHandles,
  pruneOrphanedEdges,
} from '../lib/reconcile-handles'
import { fromFlowGraph, toFlowGraph } from '../lib/route-flow-projection'

interface UseFlowCanvasOptions {
  initialGraph: CanvasGraph
  refreshKey: string
  /** 内部状态变化（CanvasGraph 投影）时通知外部；外部是 xyflow-agnostic 领域层。 */
  onNodesEdgesChange: (graph: CanvasGraph) => void
  onNodeSelect: (node: Node | null) => void
}

interface CanvasState {
  nodes: Node[]
  edges: Edge[]
}

type CanvasAction =
  | { type: 'REFRESH'; nodes: Node[]; edges: Edge[] }
  | { type: 'NODE_CHANGES'; changes: NodeChange[] }
  | { type: 'EDGE_CHANGES'; changes: EdgeChange[] }
  | { type: 'ADD_NODE'; node: Node }
  | { type: 'ADD_EDGE'; edge: Edge }
  | { type: 'UPDATE_NODE_DATA'; nodeId: string; data: Record<string, unknown> }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'REPLACE_STATE'; nodes: Node[]; edges: Edge[] }

function relayout(nodes: Node[], edges: Edge[]): CanvasState {
  return { nodes, edges }
}

function filterValidEdges(edges: Edge[], nodes: Node[]): Edge[] {
  return edges.filter(
    (e) => nodes.some((n) => n.id === e.source) && nodes.some((n) => n.id === e.target),
  )
}

function reducer(state: CanvasState, action: CanvasAction): CanvasState {
  switch (action.type) {
    case 'REFRESH':
      return relayout(action.nodes, action.edges)

    case 'NODE_CHANGES': {
      const newNodes = applyNodeChanges(action.changes, state.nodes)
      const hasRemove = action.changes.some((c) => c.type === 'remove')
      if (hasRemove) {
        return relayout(newNodes, filterValidEdges(state.edges, newNodes))
      }
      return { ...state, nodes: newNodes }
    }

    case 'EDGE_CHANGES':
      return { ...state, edges: applyEdgeChanges(action.changes, state.edges) }

    case 'ADD_NODE': {
      const newNodes = [...state.nodes, action.node]
      const hasConnections = state.edges.some(
        (e) => e.source === action.node.id || e.target === action.node.id,
      )
      if (hasConnections) return relayout(newNodes, state.edges)
      return { ...state, nodes: newNodes }
    }

    case 'ADD_EDGE': {
      const newEdges = annotateInvalidEdges(state.nodes, addEdge(action.edge, state.edges))
      return relayout(state.nodes, newEdges)
    }

    case 'UPDATE_NODE_DATA': {
      const oldNode = state.nodes.find((n) => n.id === action.nodeId)
      const newNodes = state.nodes.map((n) =>
        n.id === action.nodeId ? { ...n, data: { ...n.data, ...action.data } } : n,
      )
      const prunedEdges = pruneOrphanedEdges(oldNode, action.data, state.edges)
      return {
        ...state,
        nodes: newNodes,
        edges: annotateInvalidEdges(newNodes, prunedEdges),
      }
    }

    case 'CLEAR_SELECTION':
      return {
        nodes: state.nodes.map((n) => ({ ...n, selected: false })),
        edges: state.edges.map((e) => ({ ...e, selected: false })),
      }

    case 'REPLACE_STATE':
      return { nodes: action.nodes, edges: action.edges }
  }
}

function isMeaningfulNodeChange(change: NodeChange): boolean {
  if (change.type === 'remove' || change.type === 'add' || change.type === 'replace') return true
  if (change.type === 'position') {
    return change.dragging === false || change.dragging === undefined
  }
  return false
}

function isMeaningfulEdgeChange(change: EdgeChange): boolean {
  return change.type === 'remove' || change.type === 'add' || change.type === 'replace'
}

export function useFlowCanvas({
  initialGraph,
  refreshKey: _refreshKey,
  onNodesEdgesChange,
  onNodeSelect,
}: UseFlowCanvasOptions) {
  const { screenToFlowPosition, fitView } = useReactFlow()
  const paneDragging = useStore((s) => s.paneDragging)
  const nodesInitialized = useNodesInitialized()

  // 内部状态用 xyflow Node[]/Edge[]（与 React Flow 内部算法对齐），
  // 与外部通信一律转 CanvasGraph。toFlowGraph 把 CanvasGraph 投影到 xyflow。
  const flowInit = useMemoOnce(() => toFlowGraph(initialGraph))
  const [state, dispatch] = useReducer(reducer, flowInit)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addPosition, setAddPosition] = useState({ x: 300, y: 300 })
  const userActionPending = useRef(false)

  useEffect(() => {
    if (userActionPending.current) {
      userActionPending.current = false
      onNodesEdgesChange(fromFlowGraph(state.nodes, state.edges))
    }
  }, [state, onNodesEdgesChange])

  const dispatchWithFlag = useCallback((action: CanvasAction) => {
    userActionPending.current = true
    dispatch(action)
  }, [])

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const vmRemoveIds = new Set(
        changes
          .filter(
            (c): c is Extract<NodeChange, { type: 'remove' }> =>
              c.type === 'remove' &&
              state.nodes.some((n) => n.id === c.id && n.type === 'modelTrigger'),
          )
          .map((c) => c.id),
      )
      if (vmRemoveIds.size > 0) {
        toast.warning('接入模型节点不可删除。如需解除关联，请删除从该节点出发的所有边。')
      }
      const filtered = changes.filter((c) => !(c.type === 'remove' && vmRemoveIds.has(c.id)))
      if (filtered.some(isMeaningfulNodeChange)) {
        dispatchWithFlag({ type: 'NODE_CHANGES', changes: filtered })
      } else {
        dispatch({ type: 'NODE_CHANGES', changes: filtered })
      }
    },
    [dispatchWithFlag, state.nodes],
  )

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (changes.some(isMeaningfulEdgeChange)) {
        dispatchWithFlag({ type: 'EDGE_CHANGES', changes })
      } else {
        dispatch({ type: 'EDGE_CHANGES', changes })
      }
    },
    [dispatchWithFlag],
  )

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const sourceId = connection.source
      const sourceHandle = connection.sourceHandle
      if (!sourceId) return false
      const sourceNode = state.nodes.find((n) => n.id === sourceId)
      if (!sourceNode) return false
      const valid = getValidSourceHandles(sourceNode)
      if (valid.size === 0) return true
      if (!sourceHandle) return false
      return valid.has(sourceHandle)
    },
    [state.nodes],
  )

  const onConnect = useCallback(
    (params: Connection) => {
      if (!isValidConnection(params)) return
      dispatchWithFlag({ type: 'ADD_EDGE', edge: params as Edge })
    },
    [dispatchWithFlag, isValidConnection],
  )

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => onNodeSelect(node),
    [onNodeSelect],
  )

  const handlePaneClick = useCallback(() => {
    dispatch({ type: 'CLEAR_SELECTION' })
    onNodeSelect(null)
  }, [onNodeSelect, dispatch])

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement
      if (!target.classList.contains('react-flow__pane')) return
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      setAddPosition(pos)
      setAddDialogOpen(true)
    },
    [screenToFlowPosition],
  )

  const handleAddNode = useCallback(
    (template: NodeTemplate) => {
      const newNode: Node = {
        id: `${template.type}-new-${generateId()}`,
        type: template.type,
        position: addPosition,
        data: { ...template.defaultData },
      }
      dispatchWithFlag({ type: 'ADD_NODE', node: newNode })
      setAddDialogOpen(false)
    },
    [addPosition, dispatchWithFlag],
  )

  const updateNodeData = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      dispatchWithFlag({ type: 'UPDATE_NODE_DATA', nodeId, data })
    },
    [dispatchWithFlag],
  )

  /**
   * 给外部消费的画布状态——返回 CanvasGraph（领域类型），不暴露 xyflow 形状。
   * xyflow 类型（Node[]/Edge[]）保留在 useReducer 内部用于 React Flow 算法。
   */
  const getState = useCallback(
    (): CanvasGraph => fromFlowGraph(state.nodes, state.edges),
    [state.nodes, state.edges],
  )

  /**
   * 替换画布状态——接收 CanvasGraph；内部 toFlowGraph 投影。
   */
  const replaceState = useCallback((graph: CanvasGraph) => {
    const flow = toFlowGraph(graph)
    dispatch({
      type: 'REPLACE_STATE',
      nodes: flow.nodes,
      edges: annotateInvalidEdges(flow.nodes, flow.edges),
    })
  }, [])

  const autoLayout = useCallback(() => {
    userActionPending.current = true
    const result = runAutoLayout(state.nodes, state.edges)
    dispatch({
      type: 'REPLACE_STATE',
      nodes: result.nodes,
      edges: result.edges,
    })
  }, [state.nodes, state.edges])

  const lastGraphStatsRef = useRef<GraphStats | null>(null)
  const inFlightFitRef = useRef<Promise<boolean> | null>(null)
  const hasInitialFitRef = useRef(false)

  const fitToView = useCallback(
    (opts?: { prevStats?: GraphStats | null; force?: boolean }) => {
      if (paneDragging) return
      const force = opts?.force ?? true
      const currentStats = computeGraphStats(state.nodes, state.edges)
      const prevStats = opts?.prevStats ?? lastGraphStatsRef.current
      if (!force && !shouldRefit(prevStats, currentStats)) return
      lastGraphStatsRef.current = currentStats

      const fitOpts = computeFitViewOptions(state.nodes, state.edges)
      const animated = (fitOpts.duration ?? 0) > 0
      if (animated && inFlightFitRef.current) return

      const promise = fitView(fitOpts).finally(() => {
        if (inFlightFitRef.current === promise) {
          inFlightFitRef.current = null
        }
      })
      if (animated) inFlightFitRef.current = promise
    },
    [fitView, paneDragging, state.nodes, state.edges],
  )

  useEffect(() => {
    if (!nodesInitialized || hasInitialFitRef.current) return
    if (state.nodes.length === 0) return
    hasInitialFitRef.current = true
    fitToView({ force: true })
  }, [nodesInitialized, state.nodes.length, fitToView])

  return {
    nodes: state.nodes,
    edges: state.edges,
    handleNodesChange,
    handleEdgesChange,
    onConnect,
    isValidConnection,
    handleNodeClick,
    handlePaneClick,
    handleDoubleClick,
    handleAddNode,
    updateNodeData,
    getState,
    replaceState,
    autoLayout,
    fitToView,
    addDialogOpen,
    setAddDialogOpen,
    addPosition,
  }
}

/**
 * useReducer 初始值只在 mount 时计算一次——把 toFlowGraph 调用包成单次执行，
 * 避免每次 re-render 都重新投影 CanvasGraph。初始图通过 props 在 mount 时
 * 一次性传入。
 */
function useMemoOnce<T>(factory: () => T): T {
  const ref = useRef<T | null>(null)
  if (ref.current === null) ref.current = factory()
  return ref.current
}
