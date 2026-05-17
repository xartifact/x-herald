'use client'

interface LogsEmptyStateProps {
  hasFilters: boolean
}

export function LogsEmptyState({ hasFilters }: LogsEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
      <svg className="h-12 w-12 mb-3 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p className="text-sm">{hasFilters ? '没有找到匹配的日志记录' : '还没有请求日志'}</p>
      <p className="text-xs mt-1 text-muted-foreground/60">
        {hasFilters ? '尝试调整筛选条件' : '发起 API 请求后，日志会出现在这里'}
      </p>
    </div>
  )
}
