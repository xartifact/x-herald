'use client'

import { Separator } from '../../../../shared/components/ui/separator'
import { cn } from '../../../../shared/lib/utils'
import type { Log } from '@xartifact/x-llm-gateway-shared'

interface LogSheetStatusBarProps {
  log: Log
  formatDuration: (ms: number) => string
  formatTokens: (tokens: number) => string
}

export function LogSheetStatusBar({ log, formatDuration, formatTokens }: LogSheetStatusBarProps) {
  const isPending = log.status === 'pending'
  const isSuccess = log.status === 'success'

  return (
    <div className="flex items-center justify-between px-3 md:px-6 py-2 border-t bg-muted/20 text-xs text-muted-foreground font-mono">
      <div className="flex items-center gap-2 md:gap-4">
        <span>响应时间: {formatDuration(log.responseTimeMs)}</span>
        <Separator orientation="vertical" className="h-4" />
        <span>Token: {formatTokens(log.totalTokens)}</span>
        <Separator orientation="vertical" className="h-4 hidden md:block" />
        <span
          className={cn(
            'hidden md:inline',
            isPending ? 'text-amber-600' : isSuccess ? 'text-green-600' : 'text-red-600',
          )}
        >
          {isPending ? '请求中' : isSuccess ? '成功' : '失败'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span>{new Date(log.createdAt).toLocaleTimeString('zh-CN')}</span>
      </div>
    </div>
  )
}
