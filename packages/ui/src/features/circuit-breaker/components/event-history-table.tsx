'use client'

import { History } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../shared/components/ui/select'
import type {
  CircuitBreakerEventResponse,
  CircuitBreakerEventType,
} from '@x-llm-gateway/shared'
import { EventBadge } from './event-badge'
import { ListPagination } from '../../../shared'
import { relativeTime } from './utils'

interface Props {
  events: CircuitBreakerEventResponse[]
  loading: boolean
  error: Error | null
  filter: CircuitBreakerEventType | 'all'
  onFilterChange: (filter: CircuitBreakerEventType | 'all') => void
  currentPage: number
  totalPages: number
  pageSize: number
  pageSizeOptions?: number[]
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onRetry: () => void
}

const filterOptions: { value: CircuitBreakerEventType | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'opened', label: '熔断' },
  { value: 'half_open', label: '半开' },
  { value: 'closed', label: '恢复' },
  { value: 'cooldown', label: '冷却' },
  { value: 'reset', label: '重置' },
  { value: 'manual_trip', label: '手动熔断' },
]

export function EventHistoryTable({
  events,
  loading,
  error,
  filter,
  onFilterChange,
  currentPage,
  totalPages,
  pageSize,
  pageSizeOptions = [10, 20, 50],
  onPageChange,
  onPageSizeChange,
  onRetry,
}: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4" />
          <CardTitle className="text-base">事件历史</CardTitle>
        </div>
        <Select
          value={filter}
          onValueChange={(v) => onFilterChange(v as CircuitBreakerEventType | 'all')}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {filterOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="p-0">
        {loading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            加载中...
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-destructive">
            <p>加载失败</p>
            <button
              onClick={onRetry}
              className="text-sm underline underline-offset-4 hover:text-destructive/80"
            >
              重试
            </button>
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            暂无事件
          </div>
        )}

        {!loading && !error && events.length > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>实例</TableHead>
                  <TableHead>模型组</TableHead>
                  <TableHead>供应商</TableHead>
                  <TableHead>事件</TableHead>
                  <TableHead className="text-right">失败次数</TableHead>
                  <TableHead className="text-right">跳闸次数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((evt) => (
                  <TableRow key={evt.id}>
                    <TableCell className="text-muted-foreground">
                      {relativeTime(evt.createdAt)}
                    </TableCell>
                    <TableCell>
                      {evt.instanceName || evt.instanceId.slice(0, 12)}
                    </TableCell>
                    <TableCell>{evt.groupName}</TableCell>
                    <TableCell>{evt.providerName}</TableCell>
                    <TableCell>
                      <EventBadge event={evt.event} />
                    </TableCell>
                    <TableCell className="text-right">{evt.failureCount}</TableCell>
                    <TableCell className="text-right">{evt.tripCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="px-6 py-4">
              <ListPagination
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                pageSizeOptions={pageSizeOptions}
                onPageChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
