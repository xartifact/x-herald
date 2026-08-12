import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'

import { useLogs, useDeleteLog, useCleanupLogs, useLogStorage } from '../../../hooks/logs'
import {
  LogTable,
  LogSearchFilter,
  LogCleanupDialog,
  LogTableSkeleton,
  LiveLogsPanel,
  LogsEmptyState,
  PageHeader,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@xartifact/x-herald-ui'
import type { LogListItem } from '@xartifact/x-herald-shared'

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
  const [cursorStack, setCursorStack] = useState<string[]>([])
  const [pageSize, setPageSize] = useState(50)
  const [cleanupOpen, setCleanupOpen] = useState(false)
  const [retentionDays, setRetentionDays] = useState('30')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(10)

  const currentCursor = cursorStack.length > 0 ? cursorStack[cursorStack.length - 1] : undefined
  const currentPage = cursorStack.length + 1

  // 筛选条件或每页条数变化时回到第一页
  useEffect(() => {
    setCursorStack([])
  }, [searchQuery, statusFilter, clientTypeFilter, timeRange, pageSize])

  const filters = useMemo(() => {
    const f: Record<string, string> = { pageSize: String(pageSize) }
    if (searchQuery) f.modelName = searchQuery
    if (statusFilter !== 'all') f.status = statusFilter
    if (clientTypeFilter !== 'all') f.clientType = clientTypeFilter
    Object.assign(f, getTimeRange(timeRange))
    if (currentCursor) f.cursor = currentCursor
    return f
  }, [searchQuery, statusFilter, clientTypeFilter, timeRange, pageSize, currentCursor])

  const { data: logsData, isLoading, refetch, isFetching } = useLogs(filters)
  const { data: storageData } = useLogStorage()
  const deleteMutation = useDeleteLog()
  const cleanupMutation = useCleanupLogs()

  const logsRes = logsData as
    | { data?: LogListItem[]; nextCursor?: string | null; hasMore?: boolean }
    | undefined
  const logs = logsRes?.data ?? []
  const nextCursor = logsRes?.nextCursor ?? null
  const hasMore = logsRes?.hasMore ?? false
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

  const handlePageSizeChange = useCallback((size: number) => setPageSize(size), [])

  const handleSearchChange = useCallback((v: string) => setSearchQuery(v), [])
  const handleStatusChange = useCallback((v: string) => setStatusFilter(v), [])
  const handleClientTypeChange = useCallback((v: string) => setClientTypeFilter(v), [])
  const handleTimeRangeChange = useCallback((v: string) => setTimeRange(v), [])

  const handleNextPage = useCallback(() => {
    if (nextCursor) setCursorStack((prev) => [...prev, nextCursor])
  }, [nextCursor])
  const handlePrevPage = useCallback(() => {
    setCursorStack((prev) => prev.slice(0, -1))
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="请求日志"
        description="查看和分析所有 API 请求记录"
        actions={
          <Button variant="outline" onClick={() => setCleanupOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            清理过期日志
          </Button>
        }
      />

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
        {logs.length > 0 && (
          <span className="text-xs text-muted-foreground">第 {currentPage} 页</span>
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

      {logs.length > 0 && (
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>每页</span>
            <Select value={String(pageSize)} onValueChange={(v) => handlePageSizeChange(Number(v))}>
              <SelectTrigger className="h-7 w-16 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)} className="text-xs">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>条</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={cursorStack.length === 0}
            >
              <ChevronLeft className="h-4 w-4" />
              上一页
            </Button>
            <Button variant="outline" size="sm" onClick={handleNextPage} disabled={!hasMore}>
              下一页
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
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
