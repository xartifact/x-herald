'use client'

import { CheckCircle2, Loader2, AlertCircle, FileText, Trash2 } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { TableCell, TableRow } from '../ui/table'
import type { LogListItem } from '@x-llm-gateway/shared'

interface LogTableRowProps {
  log: LogListItem
  onViewDetail: (logId: string) => void
  onDelete: (logId: string) => void
  formatDuration: (ms: number) => string
  formatTokens: (count: number) => string
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
  const isFailure = log.status === 'failure'

  return (
    <TableRow
      className={`cursor-pointer ${isFailure ? 'bg-red-50/30' : ''}`}
      onClick={() => onViewDetail(log.id)}
    >
      <TableCell>
        {log.status === 'success' && (
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        )}
        {log.status === 'pending' && (
          <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />
        )}
        {log.status === 'failure' && (
          <AlertCircle className="h-5 w-5 text-red-600" />
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <span className="font-medium text-sm">{log.modelName}</span>
          {log.responseModelName && log.responseModelName !== log.modelName && (
            <Badge variant="outline" className="text-xs">
              {log.responseModelName}
            </Badge>
          )}
          {log.streaming === 'true' && (
            <Badge variant="secondary" className="text-xs">stream</Badge>
          )}
          {log.thinkingMode && (
            <Badge variant="secondary" className="text-xs">think</Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        {log.responseTimeMs !== null && (
          <span
            className={`text-sm font-medium ${
              log.responseTimeMs < 1000
                ? 'text-green-600'
                : log.responseTimeMs < 5000
                  ? 'text-amber-600'
                  : 'text-red-600'
            }`}
          >
            {formatDuration(log.responseTimeMs)}
          </span>
        )}
      </TableCell>
      <TableCell>
        <div className="text-sm">
          <div className="flex items-center gap-1">
            <span>↑{formatTokens(log.inputTokens)}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <span>↓{formatTokens(log.outputTokens)}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Σ {formatTokens(log.totalTokens)}
          </div>
        </div>
      </TableCell>
      <TableCell>
        {log.virtualKeyName ? (
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className="text-xs">
              {log.virtualKeyName}
            </Badge>
            {log.retryCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                重试 {log.retryCount}
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">-</span>
        )}
      </TableCell>
      <TableCell>
        {log.clientType ? (
          <Badge variant="secondary" className="text-xs">
            {clientTypeLabels?.[log.clientType] ?? log.clientType}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-sm">-</span>
        )}
      </TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground truncate max-w-[180px] block">
          {log.requestPath || '-'}
        </span>
      </TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground">
          {new Date(log.createdAt).toLocaleString()}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation()
              onViewDetail(log.id)
            }}
          >
            <FileText className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(log.id)
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
