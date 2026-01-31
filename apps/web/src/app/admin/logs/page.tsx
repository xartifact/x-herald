'use client'

import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  LogStatsCards,
  LogSearchFilter,
  LogTable,
  LogPagination,
  LogDetailSheet,
  LogCleanupDialog,
} from './components'
import { useLogPage } from './useLogPage'

export default function LogsPage() {
  const {
    loading,
    logs,
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
    isCleanupPending,
    isRefreshing,
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
  } = useLogPage()

  return (
    <div className="space-y-6">
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

      <LogStatsCards stats={stats} storage={storage} />

      <LogSearchFilter
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        statusFilter={statusFilter}
        onStatusChange={handleStatusChange}
        timeRange={timeRange}
        onTimeRangeChange={handleTimeRangeChange}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">日志列表</CardTitle>
            {pagination && pagination.total > 0 && (
              <span className="text-sm text-muted-foreground">共 {pagination.total} 条记录</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-muted-foreground">加载中...</div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              {searchQuery || statusFilter !== 'all' ? '没有找到匹配的日志' : '还没有请求日志'}
            </div>
          ) : (
            <>
              <LogTable
                logs={logs}
                onViewDetail={handleViewDetail}
                onDelete={handleDelete}
                formatDuration={formatDuration}
                formatTokens={formatTokens}
              />
              <LogPagination
                currentPage={currentPage}
                totalPages={pagination?.totalPages || 1}
                onPageChange={setCurrentPage}
              />
            </>
          )}
        </CardContent>
      </Card>

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
