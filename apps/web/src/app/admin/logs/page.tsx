'use client'

import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Suspense } from 'react'
import {
  LogSearchFilter,
  LogTable,
  LogPagination,
  LogDetailSheet,
  LogCleanupDialog,
} from './components'
import { ClientModelStats } from '@/features/logs/components/client-model-stats'
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
    clientModelStats,
    clientModelStatsLoading,
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
    // AdminNav h-16 (64px) + main py-6 top+bottom (48px) = 112px
    <div className="flex flex-col h-[calc(100vh-112px)]">

      {/* 固定顶部区域 */}
      <div className="flex-none space-y-4 pb-4">
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
        />

        {/* 客户端模型统计 */}
        <ClientModelStats 
          stats={clientModelStats} 
          isLoading={clientModelStatsLoading} 
        />

        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium">日志列表</h3>
          {pagination && pagination.total > 0 && (
            <span className="text-sm text-muted-foreground">共 {pagination.total} 条记录</span>
          )}
        </div>
      </div>

      {/* 可滚动的表格区域 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="py-12 text-center text-muted-foreground border rounded-lg">加载中...</div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground border rounded-lg">
            {searchQuery || statusFilter !== 'all' || clientTypeFilter !== 'all' ? '没有找到匹配的日志' : '还没有请求日志'}
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

      {/* 固定底部分页 */}
      {!loading && logs.length > 0 && (
        <div className="flex-none border-t pt-3">
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
