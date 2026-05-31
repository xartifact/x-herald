'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react'

import { generateId } from '../../lib/utils'

import type { NodeTemplate } from './flow-editor-constants'
import { getLayoutedElements } from '@x-llm-gateway/engine'

interface UseFlowCanvasOptions {
  initialNodes: Node[]
  initialEdges: Edge[]
  refreshKey: string
  onNodesEdgesChange: (nodes: Node[], edges: Edge[]) => void
  onNodeSelect: (node: Node | null) => void
}

export function useFlowCanvas({ initialNodes, initialEdges, refreshKey, onNodesEdgesChange, onNodeSelect }: UseFlowCanvasOptions) {
  const { screenToFlowPosition, deleteElements, fitView } = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addPosition, setAddPosition] = useState({ x: 300, y: 300 })

  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const edgesRef = useRef(edges)
  edgesRef.current = edges

  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes)
    const isUserAction = changes.some(c => c.type === 'remove' || (c.type === 'position' && c.dragging))
    if (isUserAction) onNodesEdgesChange([], [])
    if (changes.some(c => c.type === 'remove')) {
      setTimeout(() => {
        const remaining = nodesRef.current
        const validEdges = edgesRef.current.filter(e =>
          remaining.some(n => n.id === e.source) && remaining.some(n => n.id === e.target)
        )
        const { nodes: ln, edges: le } = getLayoutedElements(remaining, validEdges)
        setNodes(ln)
        setEdges(le)
        fitView({ duration: 200 })
      }, 0)
    }
  }, [onNodesChange, onNodesEdgesChange, setEdges, fitView])

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChange(changes)
    if (changes.some(c => c.type === 'remove')) onNodesEdgesChange([], [])
  }, [onEdgesChange, onNodesEdgesChange])

  const onConnect = useCallback((params: Connection) => {
    setEdges(eds => addEdge(params, eds))
    onNodesEdgesChange([], [])
    setTimeout(() => {
      const newEdge = addEdge(params, edgesRef.current)
      const currentEdges = newEdge.length > edgesRef.current.length ? newEdge : edgesRef.current
      const { nodes: ln, edges: le } = getLayoutedElements(nodesRef.current, currentEdges)
      setNodes(ln)
      fitView({ duration: 200 })
      setEdges(le)
    }, 0)
  }, [setEdges, onNodesEdgesChange])

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => onNodeSelect(node), [onNodeSelect])
  const handlePaneClick = useCallback(() => onNodeSelect(null), [onNodeSelect])

  const handleDoubleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (!target.classList.contains('react-flow__pane')) return
    const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    setAddPosition(pos)
    setAddDialogOpen(true)
  }, [screenToFlowPosition])

  const handleAddNode = useCallback((template: NodeTemplate) => {
    const newNode: Node = {
      id: `${template.type}-new-${generateId()}`,
      type: template.type,
      position: addPosition,
      data: { ...template.defaultData },
    }
    setNodes(nds => [...nds, newNode])
    setAddDialogOpen(false)
    onNodesEdgesChange([], [])
    setTimeout(() => {
      const already = nodesRef.current.some(n => n.id === newNode.id)
      const currentNodes = already ? nodesRef.current : [...nodesRef.current, newNode]
      const { nodes: ln, edges: le } = getLayoutedElements(currentNodes, edgesRef.current)
      setNodes(ln)
      fitView({ duration: 200 })
      setEdges(le)
    }, 0)
  }, [addPosition, setNodes, onNodesEdgesChange])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
      const selNodes = nodes.filter(n => n.selected).map(n => ({ id: n.id }))
      const selEdges = edges.filter(e => e.selected).map(e => ({ id: e.id }))
      if (selNodes.length > 0 || selEdges.length > 0) deleteElements({ nodes: selNodes, edges: selEdges })
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [nodes, edges, deleteElements])

  return {
    nodes, edges, setNodes,
    handleNodesChange, handleEdgesChange, onConnect,
    handleNodeClick, handlePaneClick, handleDoubleClick,
    handleAddNode,
    addDialogOpen, setAddDialogOpen, addPosition,
  }
}
