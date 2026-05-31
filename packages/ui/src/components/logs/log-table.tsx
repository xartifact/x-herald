'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'
import type { LogListItem } from '@x-llm-gateway/shared'
import { LogTableRow } from './log-table-row'

interface LogTableProps {
  logs: LogListItem[]
  onViewDetail: (logId: string) => void
  onDelete: (logId: string) => void
  formatDuration: (ms: number) => string
  formatTokens: (count: number) => string
  clientTypeLabels?: Record<string, string>
}

export function LogTable({
  logs,
  onViewDetail,
  onDelete,
  formatDuration,
  formatTokens,
  clientTypeLabels,
}: LogTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px]">状态</TableHead>
            <TableHead>模型</TableHead>
            <TableHead className="w-[100px]">响应时间</TableHead>
            <TableHead className="w-[120px]">Token</TableHead>
            <TableHead className="w-[120px]">虚拟密钥</TableHead>
            <TableHead className="w-[100px]">客户端</TableHead>
            <TableHead className="w-[200px]">Endpoint</TableHead>
            <TableHead className="w-[160px]">时间</TableHead>
            <TableHead className="w-[100px]">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                暂无日志数据
              </TableCell>
            </TableRow>
          ) : (
            logs.map((log) => (
              <LogTableRow
                key={log.id}
                log={log}
                onViewDetail={onViewDetail}
                onDelete={onDelete}
                formatDuration={formatDuration}
                formatTokens={formatTokens}
                clientTypeLabels={clientTypeLabels}
              />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
