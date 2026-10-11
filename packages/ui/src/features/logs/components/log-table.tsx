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
    <div className="overflow-hidden rounded-lg border">
      <div className="max-w-full overflow-x-auto">
        <Table className="min-w-[1100px] table-auto">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[52px]">状态</TableHead>
              <TableHead className="min-w-[220px]">模型</TableHead>
              <TableHead className="w-[88px]">响应时间</TableHead>
              <TableHead className="min-w-[144px]">Token</TableHead>
              <TableHead className="w-[80px]">虚拟密钥</TableHead>
              <TableHead className="w-[96px]">客户端</TableHead>
              <TableHead className="w-[120px]">Endpoint</TableHead>
              <TableHead className="w-[148px]">时间</TableHead>
              <TableHead className="w-[64px] text-right">操作</TableHead>
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
    </div>
  )
}
