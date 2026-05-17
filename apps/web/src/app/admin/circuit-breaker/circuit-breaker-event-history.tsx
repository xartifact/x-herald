import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/table'

import type { CBEvent } from './circuit-breaker-types'
import { EventBadge, relativeTime } from './circuit-breaker-utils'

interface CircuitBreakerEventHistoryProps {
  events: CBEvent[]
  isLoading: boolean
  filter: string
  onFilterChange: (value: string) => void
}

export function CircuitBreakerEventHistory({ events, isLoading, filter, onFilterChange }: CircuitBreakerEventHistoryProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">事件历史</CardTitle>
          <Select value={filter} onValueChange={onFilterChange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="opened">熔断</SelectItem>
              <SelectItem value="half_open">半开</SelectItem>
              <SelectItem value="closed">恢复</SelectItem>
              <SelectItem value="cooldown">冷却</SelectItem>
              <SelectItem value="reset">重置</SelectItem>
              <SelectItem value="manual_trip">手动熔断</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground text-center">加载中...</div>
        ) : !events.length ? (
          <div className="p-6 text-sm text-muted-foreground text-center">暂无熔断事件</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>实例</TableHead>
                <TableHead>模型组</TableHead>
                <TableHead>供应商</TableHead>
                <TableHead>事件</TableHead>
                <TableHead className="text-right">失败次数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {relativeTime(e.createdAt)}
                  </TableCell>
                  <TableCell className="font-medium">{e.instanceName || e.instanceId.slice(0, 8)}</TableCell>
                  <TableCell className="text-muted-foreground">{e.groupName}</TableCell>
                  <TableCell className="text-muted-foreground">{e.providerName}</TableCell>
                  <TableCell><EventBadge event={e.event} /></TableCell>
                  <TableCell className="text-right text-muted-foreground">{e.failureCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
