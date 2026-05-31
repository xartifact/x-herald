import { useState, useMemo, useCallback } from 'react'

import {
  Card,
  Button,
  LogTable,
  LogSearchFilter,
  LogDetailSheet,
  LogCleanupDialog,
  LogTableSkeleton,
  ListPagination,
  useLogs,
  useLog,
  useDeleteLog,
  useCleanupLogs,
  useLogStorage,
} from '@x-llm-gateway/ui'
import type { LogListItem } from '@x-llm-gateway/shared'
import { Trash2 } from 'lucide-react'

const PAGE_SIZE_OPTIONS = [20, 50, 100]

function getTimeRange(range: string): Record<string, string> {
  if (range === 'all') return {}
  const now = new Date()
  const start = new Date()
  switch (range) {
    case '1h': start.setHours(now.getHours() - 1); break
    case '24h': start.setHours(now.getHours() - 24); break
    case '7d': start.setDate(now.getDate() - 7); break
    case '30d': start.setDate(now.getDate() - 30); break
    default: return {}
  }
  return { startDate: start.toISOString() }
}

const formatDuration = (ms: number) => ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
const formatTokens = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

export function LogsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [clientTypeFilter, setClientTypeFilter] = useState('all')
  const [timeRange, setTimeRange] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
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
  const { data: selectedLogData } = useLog(selectedLogId ?? '')
  const { data: storageData } = useLogStorage()
  const deleteMutation = useDeleteLog()
  const cleanupMutation = useCleanupLogs()

  const logsRes = logsData as { data?: LogListItem[]; pagination?: { total: number; totalPages: number } } | undefined
  const logs = logsRes?.data ?? []
  const pagination = logsRes?.pagination
  const selectedLog = (selectedLogData as { data?: unknown } | undefined)?.data ?? null
  const storage = (storageData as { data?: unknown } | undefined)?.data ?? undefined

  const handleViewDetail = useCallback((logId: string) => {
    setSelectedLogId(logId)
    setDetailOpen(true)
  }, [])

  const handleDelete = useCallback((id: string) => {
    deleteMutation.mutate(id)
  }, [deleteMutation])

  const handleCleanup = useCallback(() => {
    cleanupMutation.mutate(parseInt(retentionDays) || 30)
    setCleanupOpen(false)
  }, [cleanupMutation, retentionDays])

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size)
    setCurrentPage(1)
  }, [])

  const handleSearchChange = useCallback((v: string) => { setSearchQuery(v); setCurrentPage(1) }, [])
  const handleStatusChange = useCallback((v: string) => { setStatusFilter(v); setCurrentPage(1) }, [])
  const handleClientTypeChange = useCallback((v: string) => { setClientTypeFilter(v); setCurrentPage(1) }, [])
  const handleTimeRangeChange = useCallback((v: string) => { setTimeRange(v); setCurrentPage(1) }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">请求日志</h1>
          <p className="text-sm text-muted-foreground">查看和管理 Gateway API 请求记录</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCleanupOpen(true)}>
          <Trash2 className="h-4 w-4 mr-1" /> 清理
        </Button>
      </div>

      <LogSearchFilter
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        statusFilter={statusFilter}
        onStatusChange={handleStatusChange}
        clientTypeFilter={clientTypeFilter}
        onClientTypeChange={handleClientTypeChange}
        timeRange={timeRange}
        onTimeRangeChange={handleTimeRangeChange}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
        autoRefresh={autoRefresh}
        autoRefreshInterval={autoRefreshInterval}
        onAutoRefreshChange={setAutoRefresh}
        onAutoRefreshIntervalChange={setAutoRefreshInterval}
      />

      <div className="flex items-center justify-between pt-2 border-t">
        <h3 className="text-sm font-medium tracking-wide uppercase text-muted-foreground">历史记录</h3>
        {!isLoading && pagination && pagination.total > 0 && (
          <span className="text-xs text-muted-foreground">
            第 {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, pagination.total)} 条 / 共 {pagination.total} 条
          </span>
        )}
      </div>

      <div className="min-h-[400px]">
        {isLoading ? (
          <LogTableSkeleton />
        ) : logs.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            {searchQuery || statusFilter !== 'all' || clientTypeFilter !== 'all' || timeRange !== 'all'
              ? '没有匹配的日志记录，请调整筛选条件'
              : '暂无日志记录'}
          </Card>
        ) : (
          <LogTable
            logs={logs}
            onViewDetail={handleViewDetail}
            onDelete={handleDelete}
            formatDuration={formatDuration}
            formatTokens={formatTokens}
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

      <LogDetailSheet
        log={selectedLog as any}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        formatDuration={formatDuration}
        formatTokens={formatTokens}
      />

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