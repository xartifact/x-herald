'use client'

import { forwardRef, useImperativeHandle } from 'react'

import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  Background,
  Panel,
  BackgroundVariant,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { AddNodeDialog } from './add-node-dialog'
import { nodeTypes } from './flow-editor-constants'
import { PropertyPanel } from './property-panel'
import { useFlowCanvas } from './use-flow-canvas'

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

const FlowCanvas = forwardRef<FlowEditorHandle, FlowEditorProps>(function FlowCanvas(props, ref) {
  const { selectedNode, onUpdateNodeData, ...canvasProps } = props
  const canvas = useFlowCanvas(canvasProps)

  useImperativeHandle(
    ref,
    () => ({
      updateNodeData: (nodeId, data) => {
        canvas.setNodes((nds) =>
          nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n)),
        )
      },
      getState: () => ({ nodes: canvas.nodes, edges: canvas.edges }),
    }),
    [canvas.nodes, canvas.edges, canvas.setNodes],
  )

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
      <div className="flex-1 min-h-0" onDoubleClick={canvas.handleDoubleClick}>
        <ReactFlow
          nodes={canvas.nodes}
          edges={canvas.edges}
          onNodesChange={canvas.handleNodesChange}
          onEdgesChange={canvas.handleEdgesChange}
          onConnect={canvas.onConnect}
          onNodeClick={canvas.handleNodeClick}
          onPaneClick={canvas.handlePaneClick}
          onNodeDoubleClick={(_: React.MouseEvent, node: Node) => props.onNodeSelect(node)}
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
            nodeColor={(node) => {
              if (node.type === 'reject') return '#ef4444'
              if (node.type === 'fallback') return '#f97316'
              if (node.type === 'condition') return '#f59e0b'
              if (node.type === 'target') return '#22c55e'
              return '#3b82f6'
            }}
          />
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Panel position="top-right" className="pointer-events-none">
            <div className="pointer-events-auto w-[300px] max-h-[calc(100vh-160px)] bg-background border rounded-lg shadow-lg overflow-hidden transition-all">
              <PropertyPanel selectedNode={selectedNode} onUpdate={onUpdateNodeData} />
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
})

export const FlowEditor = forwardRef<FlowEditorHandle, FlowEditorProps>(
  function FlowEditor(props, ref) {
    return (
      <ReactFlowProvider>
        <FlowCanvas ref={ref} {...props} />
      </ReactFlowProvider>
    )
  },
)
