'use client'

import { Suspense } from 'react'

import { Skeleton } from '@x-llm-gateway/ui'

import {
  LogSearchFilter, LogTable, LogPagination, LogDetailSheet,
  LogCleanupDialog, LiveLogsPanel, LogTableSkeleton,
} from './components'
import { LogsEmptyState } from './components/LogsEmptyState'
import { LogsPageHeader } from './components/LogsPageHeader'
import { useLogPage } from './useLogPage'

export default function LogsPage() {
  return <Suspense fallback={<Skeleton className="h-96 w-full" />}><LogsPageContent /></Suspense>
}

function LogsPageContent() {
  const {
    loading, logs, hasMore, hasPrev, storage, searchQuery, statusFilter, clientTypeFilter,
    timeRange, pageSize, pageSizeOptions, selectedLog, detailDialogOpen,
    cleanupDialogOpen, retentionDays, isCleanupPending, isRefreshing, autoRefresh,
    autoRefreshInterval, setAutoRefresh, setAutoRefreshInterval, setDetailDialogOpen,
    setCleanupDialogOpen, setRetentionDays, handleSearchChange, handleStatusChange,
    handleClientTypeChange, handleTimeRangeChange, handleRefresh, handleNext, handlePrev,
    handlePageSizeChange, handleDelete, handleCleanup, handleViewDetail, formatDuration, formatTokens,
  } = useLogPage()

  const hasFilters = !!(searchQuery || statusFilter !== 'all' || clientTypeFilter !== 'all')

  return (
    <div className="space-y-4">
      <LogsPageHeader onCleanup={() => setCleanupDialogOpen(true)} />

      <LogSearchFilter
        searchQuery={searchQuery} onSearchChange={handleSearchChange}
        statusFilter={statusFilter} onStatusChange={handleStatusChange}
        clientTypeFilter={clientTypeFilter} onClientTypeChange={handleClientTypeChange}
        timeRange={timeRange} onTimeRangeChange={handleTimeRangeChange}
        onRefresh={handleRefresh} isRefreshing={isRefreshing}
        autoRefresh={autoRefresh} autoRefreshInterval={autoRefreshInterval}
        onAutoRefreshChange={setAutoRefresh} onAutoRefreshIntervalChange={setAutoRefreshInterval}
      />

      <LiveLogsPanel />

      <div className="flex items-center justify-between pt-2 border-t">
        <h3 className="text-sm font-medium tracking-wide uppercase text-muted-foreground">历史记录</h3>
      </div>

      <div className="min-h-[400px]">
        {loading ? <LogTableSkeleton /> : logs.length === 0 ? <LogsEmptyState hasFilters={hasFilters} /> : (
          <LogTable logs={logs} onViewDetail={handleViewDetail} onDelete={handleDelete} formatDuration={formatDuration} formatTokens={formatTokens} />
        )}
      </div>

      {!loading && logs.length > 0 && (
        <div className="flex justify-center">
          <LogPagination hasMore={hasMore} hasPrev={hasPrev} pageSize={pageSize} pageSizeOptions={pageSizeOptions} onNext={handleNext} onPrev={handlePrev} onPageSizeChange={handlePageSizeChange} />
        </div>
      )}

      <LogDetailSheet log={selectedLog} open={detailDialogOpen} onOpenChange={setDetailDialogOpen} formatDuration={formatDuration} formatTokens={formatTokens} />
      <LogCleanupDialog open={cleanupDialogOpen} onOpenChange={setCleanupDialogOpen} retentionDays={retentionDays} onRetentionChange={setRetentionDays} storage={storage} isPending={isCleanupPending} onConfirm={handleCleanup} />
    </div>
  )
}
