import { useCallback, useEffect, useMemo, useRef } from 'react'

import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  Background,
  Panel,
  BackgroundVariant,
  useNodesInitialized,
  useUpdateNodeInternals,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { AlertTriangle, Maximize2, Wand2 } from 'lucide-react'
import { NodeTypeRegistry, type CanvasGraph, type NodeType } from '@xartifact/x-llm-gateway-shared'

import { decorateNodesWithValidation } from '../lib/validation-display'
import type { ValidationError } from '../lib/compile-flow'
import { AddNodeDialog } from './add-node-dialog'
import { nodeTypes } from './flow-editor-constants'
import { getNodeColorHex } from './node-type-ui-registry'
import { PropertyPanel } from './property-panel'
import { useFlowCanvas } from './use-flow-canvas'

function isNodeType(type: string | undefined): type is NodeType {
  return type !== undefined && type in NodeTypeRegistry
}

export interface FlowEditorApi {
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void
  /** 当前画布的领域类型快照（不暴露 xyflow 形状）。 */
  getState: () => CanvasGraph
  /** 替换画布状态——接收 CanvasGraph（领域类型）；xyflow 转换在内部完成。 */
  replaceState: (graph: CanvasGraph) => void
  autoLayout: () => void
  fitToView: () => void
}

export interface FlowEditorProps {
  initialGraph: CanvasGraph
  refreshKey: string
  onNodesEdgesChange: (graph: CanvasGraph) => void
  onNodeSelect: (node: Node | null) => void
  selectedNode: Node | null
  onUpdateNodeData: (nodeId: string, data: Record<string, unknown>) => void
  onReady?: (api: FlowEditorApi) => void
  validationErrors?: ValidationError[]
}

function injectHandleConnectionInfo(nodes: Node[], edges: Edge[]): Node[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  return nodes.map((node) => {
    if (!isNodeType(node.type) || NodeTypeRegistry[node.type].handles.kind !== 'dynamic') {
      return node
    }
    const nodeEdges = edges.filter((e) => e.source === node.id)
    const connectedHandles = nodeEdges.flatMap((e) => (e.sourceHandle ? [e.sourceHandle] : []))
    const handleTargets: Record<string, string> = {}
    for (const e of nodeEdges) {
      if (!e.sourceHandle) continue
      const target = nodeMap.get(e.target)
      if (target) {
        const td = target.data as { targetName?: string; label?: string } | undefined
        handleTargets[e.sourceHandle] = td?.targetName ?? td?.label ?? 'target'
      }
    }
    return {
      ...node,
      data: { ...node.data, _connectedHandles: connectedHandles, _handleTargets: handleTargets },
    }
  })
}

function FlowCanvas(props: FlowEditorProps) {
  const { selectedNode, onUpdateNodeData, onReady, validationErrors = [], ...canvasProps } = props
  const canvas = useFlowCanvas(canvasProps)
  const apiRef = useRef<FlowEditorApi | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    apiRef.current = {
      updateNodeData: canvas.updateNodeData,
      getState: canvas.getState,
      replaceState: canvas.replaceState,
      autoLayout: canvas.autoLayout,
      fitToView: canvas.fitToView,
    }
    onReady?.(apiRef.current)
  }, [
    canvas.updateNodeData,
    canvas.getState,
    canvas.replaceState,
    canvas.autoLayout,
    canvas.fitToView,
    onReady,
  ])

  const displayNodes = useMemo(
    () =>
      injectHandleConnectionInfo(
        decorateNodesWithValidation(canvas.nodes, validationErrors),
        canvas.edges,
      ),
    [canvas.nodes, canvas.edges, validationErrors],
  )

  const nodesInitialized = useNodesInitialized()
  const updateNodeInternals = useUpdateNodeInternals()
  // 竞态修复：动态 handle 节点（intent/capability）的 handle 深嵌在自定义
  // wrapper 里，首次测量（useResizeObserver/useNodeObserver）可能发生在其
  // handle 子组件渲染完成之前，导致 source/target handle 未注册进
  // node.internals.handleBounds，对应的 edge 路径绘制不出来（图上表现为
  // "某些节点的连线消失"）。图就绪后强制对这些节点重新测量一次即可补全。
  const reMeasureDynHandles = useCallback(() => {
    const dynamicNodeIds = displayNodes
      .filter((n) => isNodeType(n.type) && NodeTypeRegistry[n.type].handles.kind === 'dynamic')
      .map((n) => n.id)
    if (dynamicNodeIds.length > 0) updateNodeInternals(dynamicNodeIds)
  }, [displayNodes, updateNodeInternals])
  useEffect(() => {
    if (!nodesInitialized || displayNodes.length === 0) return
    // 等一帧，确保 handle 子组件已渲染、DOM 可被测量
    const raf = requestAnimationFrame(reMeasureDynHandles)
    return () => cancelAnimationFrame(raf)
  }, [nodesInitialized, displayNodes, reMeasureDynHandles, updateNodeInternals])
  const errorPreview = validationErrors.slice(0, 5)

  const { fitToView } = canvas
  useEffect(() => {
    const node = wrapperRef.current
    if (!node) return
    let debounceId: ReturnType<typeof setTimeout> | null = null
    const observer = new ResizeObserver(() => {
      if (debounceId) clearTimeout(debounceId)
      debounceId = setTimeout(fitToView, 150)
    })
    observer.observe(node)
    return () => {
      observer.disconnect()
      if (debounceId) clearTimeout(debounceId)
    }
  }, [fitToView])

  return (
    <div className="h-full w-full flex flex-col">
      <style>{`
        .react-flow__node.flow-node-invalid {
          filter: drop-shadow(0 0 0 2px #ef4444);
        }
        .react-flow__node.flow-node-invalid > div {
          outline: 2px solid #ef4444;
          outline-offset: 2px;
          border-radius: 0.5rem;
        }
      `}</style>
      <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b bg-background text-xs text-muted-foreground">
        <span>双击画布空白处添加节点</span>
        <span className="text-border">·</span>
        <span>拖动节点手柄创建连线</span>
        <span className="text-border">·</span>
        <span>Delete 键删除选中元素</span>
      </div>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div ref={wrapperRef} className="flex-1 min-h-0" onDoubleClick={canvas.handleDoubleClick}>
        <ReactFlow
          nodes={displayNodes}
          edges={canvas.edges}
          onNodesChange={canvas.handleNodesChange}
          onEdgesChange={canvas.handleEdgesChange}
          onConnect={canvas.onConnect}
          isValidConnection={canvas.isValidConnection}
          onNodeClick={canvas.handleNodeClick}
          onPaneClick={canvas.handlePaneClick}
          onNodeDoubleClick={(_: React.MouseEvent, node: Node) => props.onNodeSelect(node)}
          nodeTypes={nodeTypes}
          nodesDraggable
          nodesConnectable
          deleteKeyCode={['Backspace', 'Delete']}
          zoomOnDoubleClick={false}
          className="bg-muted"
        >
          <Controls />
          <MiniMap
            pannable
            zoomable
            className="rounded-lg border shadow-sm"
            nodeColor={(node) => {
              if (node.className?.includes('flow-node-invalid')) return '#ef4444'
              return getNodeColorHex(node.type ?? '')
            }}
          />
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          {errorPreview.length > 0 && (
            <Panel position="top-left" className="pointer-events-none max-w-[320px]">
              <div className="pointer-events-auto rounded-lg border border-destructive/20 bg-destructive/10 text-destructive shadow-sm px-3 py-2 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>{validationErrors.length} 项配置错误（红框节点）</span>
                </div>
                <ul className="list-disc pl-4 space-y-0.5 max-h-28 overflow-y-auto">
                  {errorPreview.map((err) => (
                    <li key={err.nodeId}>
                      <span className="font-mono text-[10px] opacity-70">{err.nodeId}</span>
                      {': '}
                      {err.message}
                    </li>
                  ))}
                </ul>
                {validationErrors.length > 5 && (
                  <p className="opacity-70">…还有 {validationErrors.length - 5} 项</p>
                )}
              </div>
            </Panel>
          )}
          <Panel position="top-center">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => apiRef.current?.fitToView()}
                disabled={!canvas.nodes.length}
                title="把当前节点缩放到恰好填满视口"
                className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span>Fit to screen</span>
              </button>
              <button
                type="button"
                onClick={() => apiRef.current?.autoLayout()}
                disabled={!canvas.nodes.length}
                title="用 Dagre 拓扑排序自动重排所有节点（覆盖当前所有位置）"
                className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Wand2 className="h-3.5 w-3.5" />
                <span>Auto-Layout</span>
              </button>
            </div>
          </Panel>
          <Panel position="top-right" className="pointer-events-none">
            <div className="pointer-events-auto w-[320px] bg-background border rounded-lg shadow-lg overflow-hidden transition-all max-h-[calc(100vh-160px)] flex flex-col">
              <PropertyPanel
                selectedNode={selectedNode}
                onUpdate={onUpdateNodeData}
                edges={canvas.edges}
                nodes={canvas.nodes}
              />
            </div>
          </Panel>
        </ReactFlow>
      </div>

      <AddNodeDialog
        open={canvas.addDialogOpen}
        onOpenChange={canvas.setAddDialogOpen}
        onAddNode={canvas.handleAddNode}
      />
    </div>
  )
}

export function FlowEditor(props: FlowEditorProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvas {...props} />
    </ReactFlowProvider>
  )
}
