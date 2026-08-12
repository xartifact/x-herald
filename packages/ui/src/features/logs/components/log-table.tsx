import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/components/ui/table'
import type { LogListItem } from '@xartifact/x-herald-shared'
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
