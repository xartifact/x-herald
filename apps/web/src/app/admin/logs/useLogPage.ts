'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLogs, useLog, useDeleteLog, useLogStorage, useCleanupLogs, type LogListItem } from '@/hooks/use-logs'
import { useQueryClient } from '@tanstack/react-query'

const PAGE_SIZE_OPTIONS = [20, 50, 100]
const DEFAULT_PAGE_SIZE = 50

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
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [clientTypeFilter, setClientTypeFilter] = useState<string>('all')
  const [timeRange, setTimeRange] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false)
  const [retentionDays, setRetentionDays] = useState('30')

  // 从 URL search param 读取详情状态
  const selectedLogId = searchParams.get('detail')
  const detailDialogOpen = !!selectedLogId

  // 计算时间范围参数（使用 useMemo 避免每次渲染都创建新对象）
  const timeParams = useMemo(() => getTimeRange(timeRange), [timeRange])

  // 构建查询参数（使用 useMemo 避免每次渲染都创建新对象）
  const queryParams = useMemo(() => {
    const params: Record<string, string> = {
      page: String(currentPage),
      pageSize: String(pageSize),
      ...timeParams,
    }

    if (statusFilter !== 'all') {
      params.status = statusFilter
    }

    if (clientTypeFilter !== 'all') {
      params.clientType = clientTypeFilter
    }

    return params
  }, [currentPage, pageSize, timeParams, statusFilter, clientTypeFilter])

  const { data: logsData, isLoading: loading, isFetching } = useLogs(queryParams)
  const { data: logDetailData } = useLog(selectedLogId || '')
  const { data: storageData } = useLogStorage()
  const deleteLog = useDeleteLog()
  const cleanupLogs = useCleanupLogs()

  const logs: LogListItem[] = logsData?.data || []
  const pagination = logsData?.pagination
  const storage = storageData?.data
  const selectedLog = logDetailData?.data

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这条日志吗？')) return
    await deleteLog.mutateAsync(id)
  }

  const handleCleanup = async () => {
    await cleanupLogs.mutateAsync(Number(retentionDays))
    setCleanupDialogOpen(false)
  }

  const handleViewDetail = useCallback((logId: string) => {
    router.push(`/admin/logs?detail=${logId}`, { scroll: false })
  }, [router])

  const setDetailDialogOpen = useCallback((open: boolean) => {
    if (!open) {
      router.push('/admin/logs', { scroll: false })
    }
  }, [router])

  // 前端搜索过滤（仅针对当前页的数据）
  const filteredLogs = logs.filter((log: LogListItem) => {
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

  const handleClientTypeChange = (value: string) => {
    setClientTypeFilter(value)
    setCurrentPage(1)
  }

  const handleTimeRangeChange = (value: string) => {
    setTimeRange(value)
    setCurrentPage(1)
  }

  const handlePageSizeChange = (size: number) => {
    setPageSize(size)
    setCurrentPage(1)
  }

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['logs'] })
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(2).replace(/\.00$/, '')}ms`
    return `${(ms / 1000).toFixed(2).replace(/\.00$/, '')}s`
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
    storage,
    searchQuery,
    statusFilter,
    clientTypeFilter,
    timeRange,
    currentPage,
    pageSize,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
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
    handleClientTypeChange,
    handleTimeRangeChange,
    handleRefresh,
    setCurrentPage,
    handlePageSizeChange,
    handleDelete,
    handleCleanup,
    handleViewDetail,
    formatDuration,
    formatTokens,
  }
}
