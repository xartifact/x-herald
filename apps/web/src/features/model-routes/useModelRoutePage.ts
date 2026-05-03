'use client'

import { useState, useCallback, useMemo } from 'react'

import type { ModelRoute } from './types'
import { useDeleteModelRoute, useToggleModelRoute } from './useModelRoutes'

export function useModelRoutePage(routes: ModelRoute[]) {
  // 对话框状态
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [editingRoute, setEditingRoute] = useState<ModelRoute | null>(null)

  // 详情面板状态
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)

  // Mutations
  const deleteRoute = useDeleteModelRoute()
  const toggleRoute = useToggleModelRoute()

  // 当前选中的规则
  const selectedRoute = useMemo(() => {
    if (!selectedRouteId) return null
    return routes.find(r => r.id === selectedRouteId) || null
  }, [selectedRouteId, routes])

  // 处理创建新规则
  const handleCreate = useCallback(() => {
    setEditingRoute(null)
    setFormDialogOpen(true)
  }, [])

  // 处理编辑规则
  const handleEdit = useCallback((route: ModelRoute) => {
    setEditingRoute(route)
    setFormDialogOpen(true)
    // 关闭详情面板
    setSelectedRouteId(null)
  }, [])

  // 处理删除规则
  const handleDelete = useCallback((route: ModelRoute) => {
    if (confirm(`确定删除规则 "${route.name}" 吗？`)) {
      deleteRoute.mutate(route.id)
      // 如果删除的是当前选中的规则，清除选中状态
      if (selectedRouteId === route.id) {
        setSelectedRouteId(null)
      }
    }
  }, [deleteRoute, selectedRouteId])

  // 处理切换规则启用状态
  const handleToggle = useCallback((route: ModelRoute) => {
    toggleRoute.mutate(route.id)
  }, [toggleRoute])

  // 关闭详情面板
  const handleCloseDetail = useCallback(() => {
    setSelectedRouteId(null)
  }, [])

  // 从 Flow 节点 ID 获取规则
  const getRouteFromNodeId = useCallback((nodeId: string): ModelRoute | null => {
    // 节点 ID 格式：cond-{routeId} 或 target-{routeId}
    const routeId = nodeId.replace(/^cond-/, '').replace(/^target-/, '')
    return routes.find(r => r.id === routeId) || null
  }, [routes])

  // 处理 Flow 节点点击
  const handleNodeClick = useCallback((nodeId: string, nodeType: string) => {
    // 只处理条件节点和目标节点
    if (nodeType === 'condition' || nodeType === 'target' || nodeType === 'reject') {
      const route = getRouteFromNodeId(nodeId)
      if (route) {
        setSelectedRouteId(route.id)
      }
    }
  }, [getRouteFromNodeId])

  // 处理 Flow 节点双击 — 打开编辑/创建对话框
  const handleNodeDoubleClick = useCallback((_nodeData: unknown, routeId: string | null) => {
    if (routeId) {
      // 编辑已有规则
      const route = routes.find(r => r.id === routeId)
      if (route) {
        setEditingRoute(route)
        setFormDialogOpen(true)
      }
    } else {
      // 从节点面板添加的新节点 — 创建模式
      setEditingRoute(null)
      setFormDialogOpen(true)
    }
  }, [routes])

  return {
    // 状态
    selectedRoute,
    selectedRouteId,
    formDialogOpen,
    editingRoute,

    // Actions
    handleCreate,
    handleEdit,
    handleDelete,
    handleToggle,
    handleCloseDetail,
    handleNodeClick,
    handleNodeDoubleClick,
    setFormDialogOpen,
    setSelectedRouteId,
  }
}
