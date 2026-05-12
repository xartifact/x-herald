'use client'

import { FileText, Trash2, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/core/lib/utils'
import { CLIENT_REGISTRY } from '@/features/gateway/services/client-identifier'
import type { LogListItem } from '@/hooks/use-logs'

interface LogTableProps {
  logs: LogListItem[]
  onViewDetail: (logId: string) => void
  onDelete: (logId: string) => void
  formatDuration: (ms: number) => string
  formatTokens: (tokens: number) => string
}

export function LogTable({
  logs,
  onViewDetail,
  onDelete,
  formatDuration,
  formatTokens,
}: LogTableProps) {
  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[50px]">状态</TableHead>
            <TableHead className="min-w-[200px]">模型</TableHead>
            <TableHead className="w-[100px]">响应时间</TableHead>
            <TableHead className="w-[140px]">Token</TableHead>
            <TableHead className="min-w-[150px]">虚拟密钥</TableHead>
            <TableHead className="w-[120px]">客户端</TableHead>
            <TableHead className="w-[140px]">Endpoint</TableHead>
            <TableHead className="w-[160px]">时间</TableHead>
            <TableHead className="w-[120px] text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => {
            const isSuccess = log.status === 'success'
            const isPending = log.status === 'pending'

            return (
              <TableRow
                key={log.id}
                className={cn(
                  "cursor-pointer transition-colors",
                  "hover:bg-muted/50",
                  !isSuccess && !isPending && "bg-red-50/30 dark:bg-red-950/10"
                )}
                onClick={() => onViewDetail(log.id)}
              >
                <TableCell>
                  <div className="flex items-center justify-center">
                    {isPending ? (
                      <Loader2 className="h-4 w-4 text-amber-600 animate-spin" />
                    ) : isSuccess ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-600" />
                    )}
                  </div>
                </TableCell>

                {/* 模型 */}
                <TableCell>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-sm truncate" title={log.originalModelName ?? log.modelName}>
                        {log.originalModelName ?? log.modelName}
                      </span>
                      <Badge
                        variant={isPending ? 'outline' : isSuccess ? 'default' : 'destructive'}
                        className={cn(
                          "text-xs font-mono h-5 px-1.5 shrink-0",
                          isPending && "border-amber-500 text-amber-600"
                        )}
                      >
                        {isPending ? "请求中" : log.statusCode || log.status}
                      </Badge>
                      {log.retryCount > 0 && (
                        <Badge variant="outline" className="text-xs h-5 px-1.5 text-orange-600 border-orange-300 shrink-0">
                          重试×{log.retryCount}
                        </Badge>
                      )}
                    </div>
                    {/* 实际模型 + Provider — 单行紧凑显示 */}
                    {(log.responseModelName || log.providerName) && (
                      <div className="text-xs text-muted-foreground truncate max-w-[240px]">
                        {log.providerName && <span>{log.providerName}</span>}
                        {log.responseModelName && log.responseModelName !== (log.originalModelName ?? log.modelName) && (
                          <span>
                            {log.providerName ? ' · ' : ''}
                            <span className="text-muted-foreground/60">实际</span> {log.responseModelName}
                          </span>
                        )}
                      </div>
                    )}
                    {log.errorMessage && (
                      <div className="text-xs text-red-600 truncate max-w-[280px]" title={log.errorMessage}>
                        {log.errorMessage}
                      </div>
                    )}
                  </div>
                </TableCell>

                {/* 响应时间 */}
                <TableCell>
                  <span className={cn(
                    "font-mono text-sm font-semibold",
                    log.responseTimeMs < 1000 ? "text-green-600" :
                    log.responseTimeMs < 3000 ? "text-amber-600" :
                    "text-red-600"
                  )}>
                    {formatDuration(log.responseTimeMs)}
                  </span>
                </TableCell>

                {/* Token — 单行紧凑 */}
                <TableCell>
                  <div className="font-mono text-xs whitespace-nowrap">
                    <span className="text-muted-foreground">↑</span>{formatTokens(log.inputTokens)}
                    {' '}<span className="text-muted-foreground">↓</span>{formatTokens(log.outputTokens)}
                    {' '}<span className="font-semibold text-foreground">Σ{formatTokens(log.totalTokens)}</span>
                  </div>
                </TableCell>

                {/* 虚拟密钥 */}
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono truncate" title={log.virtualKeyName || '-'}>
                      {log.virtualKeyName || '-'}
                    </span>
                    {log.streaming && (
                      <Badge variant="outline" className="text-xs h-5 px-1.5">
                        流式
                      </Badge>
                    )}
                    {log.thinkingMode && (
                      <Badge variant="outline" className="text-xs h-5 px-1.5 text-violet-600 border-violet-300">
                        思考
                      </Badge>
                    )}
                  </div>
                </TableCell>

                {/* 客户端 */}
                <TableCell>
                  {log.clientType && log.clientType !== 'unknown' ? (
                    <Badge variant="secondary" className="text-xs font-normal whitespace-nowrap">
                      {CLIENT_REGISTRY[log.clientType] ?? log.clientType}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>

                {/* Endpoint */}
                <TableCell>
                  {log.requestPath ? (
                    <span className="text-xs font-mono text-muted-foreground truncate max-w-[120px] block" title={log.requestPath}>
                      {log.requestPath.length > 20 ? log.requestPath.slice(0, 20) + '...' : log.requestPath}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>

                {/* 时间 */}
                <TableCell>
                  <div className="text-xs font-mono text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </div>
                </TableCell>

                {/* 操作 */}
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={(e) => {
                        e.stopPropagation()
                        onViewDetail(log.id)
                      }}
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(log.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
