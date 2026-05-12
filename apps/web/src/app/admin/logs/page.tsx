'use client'

import { Suspense } from 'react'

import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import {
  LogSearchFilter,
  LogTable,
  LogPagination,
  LogDetailSheet,
  LogCleanupDialog,
  LiveLogsPanel,
  LogTableSkeleton,
} from './components'
import { useLogPage } from './useLogPage'

export default function LogsPage() {
  return (
    <Suspense>
      <LogsPageContent />
    </Suspense>
  )
}

function LogsPageContent() {
  const {
    loading,
    logs,
    pagination,
    storage,
    searchQuery,
    statusFilter,
    clientTypeFilter,
    timeRange,
    currentPage,
    pageSize,
    pageSizeOptions,
    selectedLog,
    detailDialogOpen,
    cleanupDialogOpen,
    retentionDays,
    isCleanupPending,
    isRefreshing,
    autoRefresh,
    autoRefreshInterval,
    setAutoRefresh,
    setAutoRefreshInterval,
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
  } = useLogPage()

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">请求日志</h2>
          <p className="text-sm text-muted-foreground mt-1">查看和分析所有 API 请求记录</p>
        </div>
        <Button variant="outline" onClick={() => setCleanupDialogOpen(true)}>
          <Trash2 className="mr-2 h-4 w-4" />
          清理过期日志
        </Button>
      </div>

      {/* 筛选区 — 紧凑 */}
      <LogSearchFilter
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        statusFilter={statusFilter}
        onStatusChange={handleStatusChange}
        clientTypeFilter={clientTypeFilter}
        onClientTypeChange={handleClientTypeChange}
        timeRange={timeRange}
        onTimeRangeChange={handleTimeRangeChange}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        autoRefresh={autoRefresh}
        autoRefreshInterval={autoRefreshInterval}
        onAutoRefreshChange={setAutoRefresh}
        onAutoRefreshIntervalChange={setAutoRefreshInterval}
      />

      {/* 实时请求面板 */}
      <LiveLogsPanel />

      {/* 分隔线 + 历史记录标题 */}
      <div className="flex items-center justify-between pt-2 border-t">
        <h3 className="text-sm font-medium tracking-wide uppercase text-muted-foreground">历史记录</h3>
        {!loading && pagination && pagination.total > 0 && (
          <span className="text-xs text-muted-foreground">
            第 {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, pagination.total)} 条 / 共 {pagination.total} 条
          </span>
        )}
      </div>

      {/* 表格区域 — 自然流式高度 + 最小高度保障 */}
      <div className="min-h-[400px]">
        {loading ? (
          <LogTableSkeleton />
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <svg className="h-12 w-12 mb-3 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">
              {searchQuery || statusFilter !== 'all' || clientTypeFilter !== 'all' ? '没有找到匹配的日志记录' : '还没有请求日志'}
            </p>
            <p className="text-xs mt-1 text-muted-foreground/60">
              {searchQuery || statusFilter !== 'all' || clientTypeFilter !== 'all' ? '尝试调整筛选条件' : '发起 API 请求后，日志会出现在这里'}
            </p>
          </div>
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

      {/* 分页 — 自然流式，不固定 */}
      {!loading && logs.length > 0 && (
        <div className="flex justify-center">
          <LogPagination
            currentPage={currentPage}
            totalPages={pagination?.totalPages || 1}
            pageSize={pageSize}
            pageSizeOptions={pageSizeOptions}
            onPageChange={setCurrentPage}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
      )}

      <LogDetailSheet
        log={selectedLog}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        formatDuration={formatDuration}
        formatTokens={formatTokens}
      />

      <LogCleanupDialog
        open={cleanupDialogOpen}
        onOpenChange={setCleanupDialogOpen}
        retentionDays={retentionDays}
        onRetentionChange={setRetentionDays}
        storage={storage}
        isPending={isCleanupPending}
        onConfirm={handleCleanup}
      />
    </div>
  )
}
