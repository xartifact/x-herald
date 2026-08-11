import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'

import type { Node } from '@xyflow/react'
import { toast } from 'sonner'

import type { CanvasGraph } from '@xartifact/x-llm-gateway-shared'
import {
  toFlowGraph,
  validateFlow,
  type FlowEditorApi,
  type ValidationError,
} from '@xartifact/x-llm-gateway-ui'

import { useRouteRuleGraphPersistence } from './use-route-rule-graph-persistence'
import type { RouteRuleVersion } from './use-route-rule-versions'

export interface UseRouteRuleEditorOptions {
  accessModelId: string
  /** 当前编辑中的版本；首次 mount 时常为 null，异步加载后变为具体 version。 */
  activeVersion: RouteRuleVersion | null
  /** 尚无任何版本时的初始图（通常是仅含 modelTrigger 的默认图）。 */
  fallbackGraph: CanvasGraph
}

/**
 * 单个接入模型 + 单个 route_rules 版本的画布编辑器状态机。
 *
 * 状态归属：本 hook 是文档状态的**唯一**所有者，所有图、dirty、已水合版本、
 * 已 seed 到画布的快照都在 DocumentState 里——不再有 useRef 手写同步源
 * （pendingRef / editedRef / lastVersionIdRef / seededGraphRef 全部消失）。
 * useRouteRuleGraphPersistence 退化为纯命令层，不持有任何状态。
 *
 * 状态字段语义：
 *  - graph              ：画布当前展示的图（领域类型 CanvasGraph）
 *  - pendingGraph       ：异步保存闭包要用的"最新未保存图"
 *  - hydratedVersionId  ：上次水合的服务器版本 id（用于检测新版本到达）
 *  - hydratedGraph      ：上次水合的服务器 graph（discard 时回滚到这里）
 *  - dirtySinceHydrate  ：用户自上次水合后是否编辑过（决定是否接受新水合）
 *  - seededGraph        ：上次成功 seed 到 ReactFlow 画布的 graph（避免重复 seed）
 *
 * 派生量（不存于 reducer）：
 *  - isDirty            = dirtySinceHydrate
 *  - validationErrors   = validateFlow(toFlowGraph(graph))  // useMemo 派生
 *
 * 持久化是手动的：编辑只改内存并标脏；落库仅通过显式 persistDraft / flush
 * 触发，命令层返回的 server graph 派发 PERSISTED 写回 reducer。
 */

interface DocumentState {
  graph: CanvasGraph
  pendingGraph: CanvasGraph
  hydratedVersionId: string | null
  hydratedGraph: CanvasGraph | null
  dirtySinceHydrate: boolean
  seededGraph: CanvasGraph | null
}

type DocumentAction =
  | { type: 'HYDRATE'; graph: CanvasGraph; versionId: string }
  | { type: 'EDIT'; graph: CanvasGraph }
  | { type: 'SEED_ACK'; graph: CanvasGraph }
  | { type: 'PERSISTED'; graph: CanvasGraph }
  | { type: 'DISCARD' }

function documentReducer(state: DocumentState, action: DocumentAction): DocumentState {
  switch (action.type) {
    case 'HYDRATE': {
      // 服务器版本到达：仅在用户未编辑时覆盖；版本 id 未变则忽略
      if (state.hydratedVersionId === action.versionId) return state
      if (state.dirtySinceHydrate) return { ...state, hydratedVersionId: action.versionId }
      return {
        ...state,
        graph: action.graph,
        pendingGraph: action.graph,
        hydratedVersionId: action.versionId,
        hydratedGraph: action.graph,
        dirtySinceHydrate: false,
        // 强制重新 seed：seededGraph 留旧（与新 graph 不等）会触发 seed effect
        seededGraph: null,
      }
    }
    case 'EDIT':
      return {
        ...state,
        graph: action.graph,
        pendingGraph: action.graph,
        dirtySinceHydrate: true,
      }
    case 'SEED_ACK':
      // 画布报告已接受这张图；记录用于避免重复 seed
      return state.seededGraph === action.graph ? state : { ...state, seededGraph: action.graph }
    case 'PERSISTED':
      return {
        ...state,
        graph: action.graph,
        pendingGraph: action.graph,
        hydratedGraph: action.graph,
        dirtySinceHydrate: false,
      }
    case 'DISCARD':
      return {
        ...state,
        graph: state.hydratedGraph ?? state.graph,
        pendingGraph: state.hydratedGraph ?? state.pendingGraph,
        dirtySinceHydrate: false,
        // 强制重新 seed：hydratedGraph 变化后画布需重新接受
        seededGraph: null,
      }
  }
}

function initDocumentState(
  activeVersion: RouteRuleVersion | null,
  fallbackGraph: CanvasGraph,
): DocumentState {
  if (activeVersion) {
    return {
      graph: activeVersion.graph,
      pendingGraph: activeVersion.graph,
      hydratedVersionId: activeVersion.id,
      hydratedGraph: activeVersion.graph,
      dirtySinceHydrate: false,
      seededGraph: null,
    }
  }
  return {
    graph: fallbackGraph,
    pendingGraph: fallbackGraph,
    hydratedVersionId: null,
    hydratedGraph: null,
    dirtySinceHydrate: false,
    seededGraph: null,
  }
}

export function useRouteRuleEditor(options: UseRouteRuleEditorOptions) {
  const { accessModelId, activeVersion, fallbackGraph } = options
  const persistence = useRouteRuleGraphPersistence({ accessModelId })

  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [canvasApi, setCanvasApi] = useState<FlowEditorApi | null>(null)
  const [isDeploying, setIsDeploying] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)

  const [doc, dispatch] = useReducer(documentReducer, activeVersion, (initActive) =>
    initDocumentState(initActive, fallbackGraph),
  )

  // 服务器版本到达 → 派发 HYDRATE
  useEffect(() => {
    if (!activeVersion) return
    dispatch({ type: 'HYDRATE', graph: activeVersion.graph, versionId: activeVersion.id })
  }, [activeVersion])

  // 把 doc.graph 同步到 ReactFlow 画布：graph 变化或 canvasApi 就绪时
  useEffect(() => {
    if (!canvasApi) return
    if (doc.seededGraph === doc.graph) return
    canvasApi.replaceState(doc.graph)
    dispatch({ type: 'SEED_ACK', graph: doc.graph })
  }, [canvasApi, doc.graph, doc.seededGraph])

  // 校验错误完全由 graph 派生——单一真相，删掉旧 useState validationErrors
  const validationErrors = useMemo<ValidationError[]>(
    () => validateFlow(toFlowGraph(doc.graph).nodes, toFlowGraph(doc.graph).edges),
    [doc.graph],
  )

  const handleNodesEdgesChange = useCallback((graph: CanvasGraph) => {
    dispatch({ type: 'EDIT', graph })
  }, [])

  const handleNodeSelect = useCallback((node: Node | null) => {
    setSelectedNode(node)
  }, [])

  const handleUpdateNodeData = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      canvasApi?.updateNodeData(nodeId, data)
      setSelectedNode((prev) =>
        prev?.id === nodeId ? { ...prev, data: { ...prev.data, ...data } } : prev,
      )
      // 画布状态更新由 useFlowCanvas 的 pending effect 统一回推（dispatchWithFlag →
      // onNodesEdgesChange(fresh graph) → EDIT），保证 dirty 与 validationErrors 派生
      // 自同一份最新 doc.graph。这里不再手动 queueMicrotask 回读 —— canvasApi.getState()
      // 闭包捕获的是 dispatch 前的旧 state，回读会得到过期图，触发 seed effect 的
      // replaceState 把画布整体回滚（表现为：属性面板改动不落到画布节点上）。
    },
    [canvasApi],
  )

  const runValidation = useCallback(() => {
    const errors = validationErrors
    return { errors, empty: doc.graph.nodes.length === 0 }
  }, [validationErrors, doc.graph])

  const handleSaveDraft = useCallback(async () => {
    const { errors, empty } = runValidation()
    if (empty) {
      toast.error('画布为空，无法保存草稿')
      return
    }
    if (errors.length > 0) {
      const head = errors[0]!.message
      const more = errors.length > 1 ? `（另有 ${errors.length - 1} 项）` : ''
      toast.error(`配置错误：${head}${more}`)
      return
    }

    setIsSavingDraft(true)
    try {
      const created = await persistence.persistDraft(doc.pendingGraph)
      dispatch({ type: 'PERSISTED', graph: created.graph })
      toast.success('草稿已保存')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存草稿失败，请重试')
    } finally {
      setIsSavingDraft(false)
    }
  }, [runValidation, persistence, doc.pendingGraph])

  const handleDeploy = useCallback(async () => {
    const { errors, empty } = runValidation()
    if (empty) {
      toast.error('画布为空，无法部署')
      return
    }
    if (errors.length > 0) {
      const head = errors[0]!.message
      const more = errors.length > 1 ? `（另有 ${errors.length - 1} 项）` : ''
      toast.error(`配置错误：${head}${more}`)
      return
    }

    setIsDeploying(true)
    try {
      const created = await persistence.flush(doc.pendingGraph)
      dispatch({ type: 'PERSISTED', graph: created.graph })
      toast.success('部署成功')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '部署失败，请重试')
    } finally {
      setIsDeploying(false)
    }
  }, [runValidation, persistence, doc.pendingGraph])

  const handleDiscardDraft = useCallback(() => {
    if (!canvasApi) return
    dispatch({ type: 'DISCARD' })
    toast.info('已放弃未保存的改动')
  }, [canvasApi])

  return {
    selectedNode,
    isDirty: doc.dirtySinceHydrate,
    isDeploying,
    isSavingDraft,
    validationErrors,
    handleNodesEdgesChange,
    handleNodeSelect,
    handleUpdateNodeData,
    handleDeploy,
    handleSaveDraft,
    handleDiscardDraft,
    onReady: setCanvasApi,
  }
}
