import { FileText, Trash2, AlertCircle, CheckCircle2, CircleSlash, Loader2 } from 'lucide-react'

import { Badge } from '../../../shared/components/ui/badge'
import { Button } from '../../../shared/components/ui/button'
import { TableCell, TableRow } from '../../../shared/components/ui/table'
import { cn } from '../../../shared/lib/utils'
import type { LogListItem } from '@xartifact/x-herald-shared'

function thinkingLabel(log: LogListItem): string {
  const t = log.thinking
  if (t?.effort) {
    const e = t.effort.charAt(0).toUpperCase() + t.effort.slice(1)
    return `思考 · ${e}`
  }
  if (t?.type) return `思考 · ${t.type}`
  return '思考'
}

const CATEGORY_LABELS: Record<string, { label: string; className: string }> = {
  embedding: { label: 'Embedding', className: 'bg-indigo-500/15 text-indigo-400' },
  chat_text: { label: 'Text', className: 'bg-sky-500/15 text-sky-400' },
  chat_image: { label: 'Image', className: 'bg-emerald-500/15 text-emerald-400' },
  chat_video: { label: 'Video', className: 'bg-amber-500/15 text-amber-400' },
  chat_audio: { label: 'Audio', className: 'bg-rose-500/15 text-rose-400' },
  other: { label: 'Other', className: 'bg-muted text-muted-foreground' },
}
interface ModelCellProps {
  log: LogListItem
  isPending: boolean
  isSuccess: boolean
  isCancelled: boolean
}

function ModelCell({ log, isPending, isSuccess, isCancelled }: ModelCellProps) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className="font-medium text-sm truncate"
          title={log.originalModelName ?? log.modelName}
        >
          {log.originalModelName ?? log.modelName}
        </span>
        <Badge
          variant={
            isPending
              ? 'outline'
              : isSuccess
                ? 'default'
                : isCancelled
                  ? 'secondary'
                  : 'destructive'
          }
          className={cn(
            'text-xs font-mono h-5 px-1.5 shrink-0',
            isPending && 'border-warning text-warning',
          )}
        >
          {isPending ? '请求中' : isCancelled ? '客户端取消' : log.statusCode || log.status}
        </Badge>
        {log.requestCategory &&
          log.requestCategory !== 'other' &&
          CATEGORY_LABELS[log.requestCategory] && (
            <Badge
              variant="outline"
              className={cn(
                'text-xs h-5 px-1.5 shrink-0',
                CATEGORY_LABELS[log.requestCategory].className,
              )}
            >
              {CATEGORY_LABELS[log.requestCategory].label}
            </Badge>
          )}
        {log.streaming && (
          <Badge variant="outline" className="text-xs h-5 px-1.5 shrink-0">
            流式
          </Badge>
        )}
        {log.thinkingMode && (
          <Badge variant="outline" className="text-xs h-5 px-1.5 shrink-0 text-info border-info/40">
            {thinkingLabel(log)}
          </Badge>
        )}
        {log.retryCount > 0 && (
          <Badge
            variant="outline"
            className="text-xs h-5 px-1.5 text-warning border-warning/40 shrink-0"
          >
            重试×{log.retryCount}
          </Badge>
        )}
      </div>
      {(log.responseModelName || log.providerName) && (
        <div className="text-xs text-muted-foreground truncate max-w-[240px]">
          {log.providerName && <span>{log.providerName}</span>}
          {log.responseModelName &&
            log.responseModelName !== (log.originalModelName ?? log.modelName) && (
              <span>
                {log.providerName ? ' · ' : ''}
                <span className="text-muted-foreground/60">实际</span> {log.responseModelName}
              </span>
            )}
        </div>
      )}
      {log.errorMessage && (
        <div
          className={cn(
            'text-xs truncate max-w-[280px]',
            isCancelled ? 'text-muted-foreground' : 'text-destructive',
          )}
          title={log.errorMessage}
        >
          {log.errorMessage}
        </div>
      )}
    </div>
  )
}

interface LogTableRowProps {
  log: LogListItem
  onViewDetail: (logId: string) => void
  onDelete: (logId: string) => void
  formatDuration: (ms: number) => string
  formatTokens: (tokens: number) => string
  clientTypeLabels?: Record<string, string>
}

export function LogTableRow({
  log,
  onViewDetail,
  onDelete,
  formatDuration,
  formatTokens,
  clientTypeLabels,
}: LogTableRowProps) {
  const isSuccess = log.status === 'success'
  const isPending = log.status === 'pending'
  const isCancelled = log.status === 'cancelled'
  const isFailure = log.status === 'failure'

  return (
    <TableRow
      className={cn(
        'cursor-pointer transition-colors hover:bg-muted/50',
        isFailure && 'bg-destructive/10',
      )}
      onClick={() => onViewDetail(log.id)}
    >
      <TableCell>
        <div className="flex items-center justify-center">
          {isPending ? (
            <Loader2 className="h-4 w-4 text-warning animate-spin" />
          ) : isSuccess ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : isCancelled ? (
            <CircleSlash className="h-4 w-4 text-muted-foreground" />
          ) : (
            <AlertCircle className="h-4 w-4 text-destructive" />
          )}
        </div>
      </TableCell>
      <TableCell>
        <ModelCell
          log={log}
          isPending={isPending}
          isSuccess={isSuccess}
          isCancelled={isCancelled}
        />
      </TableCell>
      <TableCell>
        <span
          className={cn(
            'font-mono text-sm font-semibold',
            log.responseTimeMs < 1000
              ? 'text-success'
              : log.responseTimeMs < 3000
                ? 'text-warning'
                : 'text-destructive',
          )}
        >
          {formatDuration(log.responseTimeMs)}
        </span>
      </TableCell>
      <TableCell>
        <div className="font-mono text-xs whitespace-nowrap">
          <span className="text-muted-foreground">↑</span>
          {formatTokens(log.inputTokens)} <span className="text-muted-foreground">↓</span>
          {formatTokens(log.outputTokens)}{' '}
          <span className="font-semibold text-foreground">Σ{formatTokens(log.totalTokens)}</span>
        </div>
      </TableCell>
      <TableCell>
        <span className="text-sm font-mono truncate" title={log.virtualKeyName || '-'}>
          {log.virtualKeyName || '-'}
        </span>
      </TableCell>
      <TableCell>
        {log.clientType && log.clientType !== 'unknown' ? (
          <Badge variant="secondary" className="text-xs font-normal whitespace-nowrap">
            {clientTypeLabels?.[log.clientType] ?? log.clientType}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell>
        {log.requestPath ? (
          <span
            className="text-xs font-mono text-muted-foreground truncate max-w-[120px] block"
            title={log.requestPath}
          >
            {log.requestPath.length > 20 ? log.requestPath.slice(0, 20) + '...' : log.requestPath}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </TableCell>
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
}
