'use client'

import { useState } from 'react'
import { FileText, Trash2, Clock, Zap, Server, ChevronRight, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/core/lib/utils'
import type { Log } from '@/hooks/use-logs'

interface LogTableProps {
  logs: Log[]
  onViewDetail: (logId: string) => void
  onDelete: (logId: string) => void
  formatDuration: (ms: number) => string
  formatTokens: (tokens: number) => string
}

interface LogCardProps {
  log: Log
  onViewDetail: (logId: string) => void
  onDelete: (logId: string) => void
  formatDuration: (ms: number) => string
  formatTokens: (tokens: number) => string
}

function LogCard({ log, onViewDetail, onDelete, formatDuration, formatTokens }: LogCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const isSuccess = log.status === 'success'

  return (
    <div
      className={cn(
        "group relative border rounded-lg transition-all duration-200",
        "hover:shadow-md hover:border-primary/50",
        "bg-background"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 左侧状态指示条 */}
      <div className={cn(
        "absolute left-0 top-0 bottom-0 w-1 rounded-l-lg transition-opacity",
        isSuccess ? "bg-green-500" : "bg-red-500",
        isHovered ? "opacity-100" : "opacity-0"
      )} />

      <div
        className="p-4 cursor-pointer"
        onClick={() => onViewDetail(log.id)}
      >
        {/* 头部：状态 + 模型 + 时间 */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* 状态图标 */}
            <div className={cn(
              "flex-shrink-0 rounded-full p-1",
              isSuccess ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
            )}>
              {isSuccess ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
            </div>

            {/* 模型信息 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-sm truncate">
                  {log.modelName}
                </h4>
                <Badge
                  variant={isSuccess ? 'default' : 'destructive'}
                  className="text-xs font-mono flex-shrink-0"
                >
                  {log.statusCode || log.status}
                </Badge>
              </div>
              {log.providerName && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {log.providerName}
                </p>
              )}
            </div>
          </div>

          {/* 时间戳 */}
          <div className="text-xs text-muted-foreground font-mono flex-shrink-0">
            {new Date(log.createdAt).toLocaleString('zh-CN', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </div>
        </div>

        {/* 元数据网格 */}
        <div className="grid grid-cols-4 gap-3 mb-3">
          {/* 延迟 */}
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">延迟</div>
              <div className={cn(
                "text-sm font-semibold font-mono",
                log.latencyMs < 1000 ? "text-green-600" :
                log.latencyMs < 3000 ? "text-amber-600" :
                "text-red-600"
              )}>
                {formatDuration(log.latencyMs)}
              </div>
            </div>
          </div>

          {/* Token */}
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Token</div>
              <div className="text-sm font-semibold font-mono">
                {formatTokens(log.totalTokens)}
              </div>
            </div>
          </div>

          {/* 虚拟密钥 */}
          <div className="flex items-center gap-2 col-span-2">
            <Server className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-foreground">虚拟密钥</div>
              <div className="text-sm font-mono truncate" title={log.virtualKeyName || '-'}>
                {log.virtualKeyName || '-'}
              </div>
            </div>
          </div>
        </div>

        {/* Token 详情条 */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono">
          <span>↑ {formatTokens(log.inputTokens)} 输入</span>
          <span>↓ {formatTokens(log.outputTokens)} 输出</span>
          {log.streaming && (
            <Badge variant="outline" className="text-xs">
              流式
            </Badge>
          )}
        </div>

        {/* 错误消息 */}
        {log.errorMessage && (
          <div className="mt-3 pt-3 border-t">
            <div className="flex items-start gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-medium">错误</div>
                <div className="text-xs mt-0.5 line-clamp-2">
                  {log.errorMessage}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部操作栏 */}
      <div className={cn(
        "flex items-center justify-between px-4 py-2 border-t bg-muted/20",
        "transition-opacity",
        isHovered ? "opacity-100" : "opacity-0"
      )}>
        <div className="text-xs text-muted-foreground">
          ID: <span className="font-mono">{log.id.slice(0, 8)}...</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={(e) => {
              e.stopPropagation()
              onViewDetail(log.id)
            }}
          >
            <FileText className="h-3.5 w-3.5 mr-1" />
            详情
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-3 text-xs text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(log.id)
            }}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            删除
          </Button>
        </div>
      </div>

      {/* 查看详情箭头 */}
      <div className={cn(
        "absolute right-4 top-1/2 -translate-y-1/2 transition-all",
        isHovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2"
      )}>
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </div>
    </div>
  )
}

export function LogTable({
  logs,
  onViewDetail,
  onDelete,
  formatDuration,
  formatTokens,
}: LogTableProps) {
  return (
    <div className="space-y-3">
      {logs.map((log) => (
        <LogCard
          key={log.id}
          log={log}
          onViewDetail={onViewDetail}
          onDelete={onDelete}
          formatDuration={formatDuration}
          formatTokens={formatTokens}
        />
      ))}
    </div>
  )
}
