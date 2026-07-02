import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'

import { useLogs, useDeleteLog, useCleanupLogs, useLogStorage } from '../../../hooks/logs'
import {
  LogTable,
  LogSearchFilter,
  LogCleanupDialog,
  LogTableSkeleton,
  ListPagination,
  LiveLogsPanel,
  LogsEmptyState,
  LogsPageHeader,
} from '@xartifact/x-llm-gateway-ui'
import type { LogListItem } from '@xartifact/x-llm-gateway-shared'

const CLIENT_REGISTRY: Record<string, string> = {
  'claude-code': 'Claude Code',
  'cherry-studio': 'CherryStudio',
  opencode: 'OpenCode',
  openclaw: 'OpenClaw',
  cursor: 'Cursor',
  cline: 'Cline',
  aider: 'Aider',
  continue: 'Continue.dev',
  litellm: 'LiteLLM',
  langchain: 'LangChain',
  'openai-python': 'OpenAI Python SDK',
  'openai-node': 'OpenAI Node.js SDK',
  'anthropic-python': 'Anthropic Python SDK',
  curl: 'cURL',
  'python-httpx': 'Python (httpx)',
  'python-requests': 'Python (requests)',
  unknown: '未知客户端',
}

const PAGE_SIZE_OPTIONS = [20, 50, 100]

function getTimeRange(range: string): Record<string, string> {
  if (range === 'all') return {}
  const now = new Date()
  const start = new Date()
  switch (range) {
    case '1h':
      start.setHours(now.getHours() - 1)
      break
    case '24h':
      start.setHours(now.getHours() - 24)
      break
    case '7d':
      start.setDate(now.getDate() - 7)
      break
    case '30d':
      start.setDate(now.getDate() - 30)
      break
    default:
      return {}
  }
  return { startDate: start.toISOString() }
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

export function LogsPage() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [clientTypeFilter, setClientTypeFilter] = useState('all')
  const [timeRange, setTimeRange] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [cleanupOpen, setCleanupOpen] = useState(false)
  const [retentionDays, setRetentionDays] = useState('30')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(10)

  const filters = useMemo(() => {
    const f: Record<string, string> = { page: String(currentPage), pageSize: String(pageSize) }
    if (searchQuery) f.modelName = searchQuery
    if (statusFilter !== 'all') f.status = statusFilter
    if (clientTypeFilter !== 'all') f.clientType = clientTypeFilter
    Object.assign(f, getTimeRange(timeRange))
    return f
  }, [searchQuery, statusFilter, clientTypeFilter, timeRange, currentPage, pageSize])

  const { data: logsData, isLoading, refetch, isFetching } = useLogs(filters)
  const { data: storageData } = useLogStorage()
  const deleteMutation = useDeleteLog()
  const cleanupMutation = useCleanupLogs()

  const logsRes = logsData as
    | { data?: LogListItem[]; pagination?: { total: number; totalPages: number } }
    | undefined
  const logs = logsRes?.data ?? []
  const pagination = logsRes?.pagination
  const storage = (storageData as { data?: unknown } | undefined)?.data ?? undefined

  const handleViewDetail = useCallback(
    (logId: string) => {
      navigate({ to: '/admin/logs/$logId', params: { logId } })
    },
    [navigate],
  )

  const handleDelete = useCallback(
    (id: string) => {
      deleteMutation.mutate(id)
    },
    [deleteMutation],
  )

  const handleCleanup = useCallback(() => {
    cleanupMutation.mutate(parseInt(retentionDays) || 30)
    setCleanupOpen(false)
  }, [cleanupMutation, retentionDays])

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size)
    setCurrentPage(1)
  }, [])

  const handleSearchChange = useCallback((v: string) => {
    setSearchQuery(v)
    setCurrentPage(1)
  }, [])
  const handleStatusChange = useCallback((v: string) => {
    setStatusFilter(v)
    setCurrentPage(1)
  }, [])
  const handleClientTypeChange = useCallback((v: string) => {
    setClientTypeFilter(v)
    setCurrentPage(1)
  }, [])
  const handleTimeRangeChange = useCallback((v: string) => {
    setTimeRange(v)
    setCurrentPage(1)
  }, [])

  return (
    <div className="space-y-4">
      <LogsPageHeader onCleanup={() => setCleanupOpen(true)} />

      <LogSearchFilter
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        statusFilter={statusFilter}
        onStatusChange={handleStatusChange}
        clientTypeFilter={clientTypeFilter}
        onClientTypeChange={handleClientTypeChange}
        clientTypeOptions={CLIENT_REGISTRY}
        timeRange={timeRange}
        onTimeRangeChange={handleTimeRangeChange}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
        autoRefresh={autoRefresh}
        autoRefreshInterval={autoRefreshInterval}
        onAutoRefreshChange={setAutoRefresh}
        onAutoRefreshIntervalChange={setAutoRefreshInterval}
      />

      <LiveLogsPanel onViewDetail={handleViewDetail} />

      <div className="flex items-center justify-between pt-2 border-t">
        <h3 className="text-sm font-medium tracking-wide uppercase text-muted-foreground">
          历史记录
        </h3>
        {!isLoading && pagination && pagination.total > 0 && (
          <span className="text-xs text-muted-foreground">
            第 {(currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, pagination.total)} 条 / 共 {pagination.total} 条
          </span>
        )}
      </div>

      <div className="min-h-[400px]">
        {isLoading ? (
          <LogTableSkeleton />
        ) : logs.length === 0 ? (
          <LogsEmptyState
            hasFilters={
              !!searchQuery ||
              statusFilter !== 'all' ||
              clientTypeFilter !== 'all' ||
              timeRange !== 'all'
            }
          />
        ) : (
          <LogTable
            logs={logs}
            onViewDetail={handleViewDetail}
            onDelete={handleDelete}
            formatDuration={formatDuration}
            formatTokens={formatTokens}
            clientTypeLabels={CLIENT_REGISTRY}
          />
        )}
      </div>

      {!isLoading && pagination && pagination.totalPages > 1 && (
        <div className="flex justify-center">
          <ListPagination
            currentPage={currentPage}
            totalPages={pagination.totalPages}
            pageSize={pageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageChange={setCurrentPage}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
      )}

      <LogCleanupDialog
        open={cleanupOpen}
        onOpenChange={setCleanupOpen}
        retentionDays={retentionDays}
        onRetentionChange={setRetentionDays}
        storage={storage as any}
        isPending={cleanupMutation.isPending}
        onConfirm={handleCleanup}
      />
    </div>
  )
}
