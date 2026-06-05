'use client'

import { ChevronRight, GitBranch, X } from 'lucide-react'

import { Badge } from '../../../../shared/components/ui/badge'
import { Button } from '../../../../shared/components/ui/button'
import { cn } from '../../../../shared/lib/utils'
import type { Log } from '@x-llm-gateway/shared'

interface LogSheetToolbarProps {
  log: Log
  onClose: () => void
  onOpenTrace?: () => void
}

export function LogSheetToolbar({ log, onClose, onOpenTrace }: LogSheetToolbarProps) {
  const isPending = log.status === 'pending'
  const isSuccess = log.status === 'success'

  return (
    <div className="flex items-center justify-between px-3 md:px-6 py-3 md:py-3.5 border-b bg-background">
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
          {isPending ? (
            <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
          ) : isSuccess ? (
            <div className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
          ) : (
            <div className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0" />
          )}
          <span className="text-sm font-semibold hidden md:inline">{log.requestMethod || 'REQUEST'}</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground hidden md:inline flex-shrink-0" />
          <span className="text-sm font-medium truncate">{log.modelName}</span>
        </div>
        <Badge
          variant={isPending ? 'outline' : isSuccess ? 'default' : 'destructive'}
          className={cn('font-mono text-xs flex-shrink-0', isPending && 'border-amber-500 text-amber-600')}
        >
          {isPending ? '请求中' : log.statusCode != null ? String(log.statusCode) : log.status}
        </Badge>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xs text-muted-foreground font-mono hidden md:inline">
          {new Date(log.createdAt).toLocaleString('zh-CN')}
        </span>
        {onOpenTrace && (
          <Button variant="ghost" size="sm" onClick={onOpenTrace} className="h-7 px-2 text-xs gap-1">
            <GitBranch className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">链路追踪</span>
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
