'use client'

import { useState } from 'react'
import { useLogs, useDeleteLog, useLogStats, useLogStorage, useCleanupLogs } from '@/hooks/use-logs'
import { useQueryClient } from '@tanstack/react-query'

const PAGE_SIZE = 20

/**
 * 计算时间范围
 */
function getTimeRange(range: string): { startDate?: string; endDate?: string } {
  if (range === 'all') return {}

  const now = new Date()
  const startDate = new Date()

  switch (range) {
    case '1h':
      startDate.setHours(now.getHours() - 1)
      break
    case '24h':
      startDate.setHours(now.getHours() - 24)
      break
    case '7d':
      startDate.setDate(now.getDate() - 7)
      break
    case '30d':
      startDate.setDate(now.getDate() - 30)
      break
    default:
      return {}
  }

  return { startDate: startDate.toISOString() }
}

export function useLogPage() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [timeRange, setTimeRange] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false)
  const [retentionDays, setRetentionDays] = useState('30')

  // 计算时间范围参数
  const timeParams = getTimeRange(timeRange)

  // 构建查询参数
  const queryParams: Record<string, string> = {
    page: String(currentPage),
    pageSize: String(PAGE_SIZE),
    ...timeParams,
  }

  if (statusFilter !== 'all') {
    queryParams.status = statusFilter
  }

  const { data: logsData, isLoading: loading, isFetching } = useLogs(queryParams)
  const { data: statsData } = useLogStats(timeParams)
  const { data: storageData } = useLogStorage()
  const deleteLog = useDeleteLog()
  const cleanupLogs = useCleanupLogs()

  const logs = logsData?.data || []
  const pagination = logsData?.pagination
  const stats = statsData?.data?.overview
  const storage = storageData?.data

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这条日志吗？')) return
    await deleteLog.mutateAsync(id)
  }

  const handleCleanup = async () => {
    await cleanupLogs.mutateAsync(Number(retentionDays))
    setCleanupDialogOpen(false)
  }

  const handleViewDetail = (logId: string) => {
    setSelectedLogId(logId)
    setDetailDialogOpen(true)
  }

  const selectedLog = logs.find((log) => log.id === selectedLogId)

  // 前端搜索过滤（仅针对当前页的数据）
  const filteredLogs = logs.filter((log) => {
    if (searchQuery === '') return true

    const matchesSearch =
      log.modelName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.virtualKeyName?.toLowerCase().includes(searchQuery.toLowerCase())

    return matchesSearch
  })

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
  }

  const handleStatusChange = (value: string) => {
    setStatusFilter(value)
    setCurrentPage(1)
  }

  const handleTimeRangeChange = (value: string) => {
    setTimeRange(value)
    setCurrentPage(1)
  }

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['logs'] })
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`
    return tokens.toLocaleString()
  }

  return {
    loading,
    logs: filteredLogs,
    pagination,
    stats,
    storage,
    searchQuery,
    statusFilter,
    timeRange,
    currentPage,
    selectedLog,
    detailDialogOpen,
    cleanupDialogOpen,
    retentionDays,
    isCleanupPending: cleanupLogs.isPending,
    isRefreshing: isFetching,
    setDetailDialogOpen,
    setCleanupDialogOpen,
    setRetentionDays,
    handleSearchChange,
    handleStatusChange,
    handleTimeRangeChange,
    handleRefresh,
    setCurrentPage,
    handleDelete,
    handleCleanup,
    handleViewDetail,
    formatDuration,
    formatTokens,
  }
}
