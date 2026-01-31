'use client'

import { FileText, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { Log } from '@/hooks/use-logs'

interface LogTableProps {
  logs: Log[]
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
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[160px]">时间</TableHead>
            <TableHead className="w-[140px]">模型</TableHead>
            <TableHead className="w-[120px]">虚拟密钥</TableHead>
            <TableHead className="w-[80px]">状态</TableHead>
            <TableHead className="w-[80px]">延迟</TableHead>
            <TableHead className="w-[100px]">Tokens</TableHead>
            <TableHead className="w-[80px] text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id} className="cursor-pointer" onClick={() => onViewDetail(log.id)}>
              <TableCell className="text-xs tabular-nums">
                {new Date(log.createdAt).toLocaleString('zh-CN', {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </TableCell>
              <TableCell>
                <div className="font-medium text-sm truncate max-w-[140px]" title={log.modelName}>
                  {log.modelName}
                </div>
                {log.providerName && (
                  <div className="text-xs text-muted-foreground truncate max-w-[140px]">
                    {log.providerName}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <div className="text-sm text-muted-foreground truncate max-w-[120px]">
                  {log.virtualKeyName || '-'}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={log.status === 'success' ? 'default' : 'destructive'} className="text-xs">
                  {log.status === 'success' ? '成功' : '失败'}
                </Badge>
                {log.statusCode && (
                  <div className="text-xs text-muted-foreground mt-0.5">{log.statusCode}</div>
                )}
              </TableCell>
              <TableCell className="text-sm tabular-nums">{formatDuration(log.latencyMs)}</TableCell>
              <TableCell>
                <div className="text-sm tabular-nums">{formatTokens(log.totalTokens)}</div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  ↑{log.inputTokens} ↓{log.outputTokens}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
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
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
