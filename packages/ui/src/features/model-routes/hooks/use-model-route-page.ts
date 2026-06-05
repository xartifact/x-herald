'use client'

import { useCallback, useRef, useState } from 'react'

import type { Node, Edge } from '@xyflow/react'
import { toast } from 'sonner'

import type { FlowEditorHandle } from '../components/flow-editor'
import { compileFlowToRoutes, validateFlow } from '../lib'
import type { ModelRoute } from '../components/types'
import {
  useCreateModelRoute,
  useDeleteModelRoute,
  useModelRoutes,
} from './use-model-routes'

export function useModelRoutePage() {
  const { refetch } = useModelRoutes()
  const createRoute = useCreateModelRoute()
  const deleteRoute = useDeleteModelRoute()

  // Flow 编辑器命令式 ref（读取最新状态、更新节点数据）
  const flowEditorRef = useRef<FlowEditorHandle>(null)

  // 当前选中节点（驱动右侧属性面板）
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)

  // 是否有未部署的变更
  const [isDirty, setIsDirty] = useState(false)
  const [isDeploying, setIsDeploying] = useState(false)

  // Flow 变化回调（跳过初次渲染，只在用户编辑后触发）
  const handleNodesEdgesChange = useCallback((_nodes: Node[], _edges: Edge[]) => {
    setIsDirty(true)
  }, [])

  const handleNodeSelect = useCallback((node: Node | null) => {
    setSelectedNode(node)
  }, [])

  // 属性面板更新节点数据
  const handleUpdateNodeData = useCallback((nodeId: string, data: Record<string, unknown>) => {
    flowEditorRef.current?.updateNodeData(nodeId, data)
    setSelectedNode(prev =>
      prev?.id === nodeId ? { ...prev, data: { ...prev.data, ...data } } : prev,
    )
    setIsDirty(true)
  }, [])

  // 部署：从 ref 读取最新状态 → 编译 → 全量替换 DB 路由
  const handleDeploy = useCallback(async () => {
    const state = flowEditorRef.current?.getState()
    if (!state || state.nodes.length === 0) {
      toast.error('画布为空，无法部署')
      return
    }

    const { nodes, edges } = state

    const errors = validateFlow(nodes, edges)
    if (errors.length > 0) {
      toast.error(`配置错误：${errors[0].message}`)
      return
    }

    const compiledRoutes = compileFlowToRoutes(nodes, edges)

    setIsDeploying(true)
    try {
      // 获取当前 DB 中的所有路由
      const result = await refetch()
      const existingRoutes: ModelRoute[] = result.data ?? []

      // 删除所有现有路由
      await Promise.all(existingRoutes.map(r => deleteRoute.mutateAsync(r.id)))

      // 创建编译出的新路由
      if (compiledRoutes.length > 0) {
        await Promise.all(compiledRoutes.map(r => createRoute.mutateAsync(r)))
      }

      setIsDirty(false)
      toast.success(`部署成功，共 ${compiledRoutes.length} 条规则`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '部署失败，请重试')
    } finally {
      setIsDeploying(false)
    }
  }, [refetch, deleteRoute, createRoute])

  return {
    flowEditorRef,
    selectedNode,
    isDirty,
    isDeploying,
    handleNodesEdgesChange,
    handleNodeSelect,
    handleUpdateNodeData,
    handleDeploy,
  }
}