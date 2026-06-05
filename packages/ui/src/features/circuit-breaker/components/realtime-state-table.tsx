'use client'

import { Activity, RotateCcw, Octagon } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/card'
import { Button } from '../../../shared/components/ui/button'
import { Badge } from '../../../shared/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/components/ui/table'
import type { CircuitBreakerRealtimeState } from '@x-llm-gateway/shared'
import { stateBadgeColor, stateLabel, tripCountBadge, formatDuration } from './utils'

interface Props {
  instances: CircuitBreakerRealtimeState[]
  loading: boolean
  error: Error | null
  onReset: (instanceId: string) => void
  onTrip: (instanceId: string) => void
  actionPending: boolean
  onRetry: () => void
}

export function RealtimeStateTable({
  instances,
  loading,
  error,
  onReset,
  onTrip,
  actionPending,
  onRetry,
}: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Activity className="h-4 w-4" />
        <CardTitle className="text-base">实时状态</CardTitle>
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

        {!loading && !error && instances.length === 0 && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            暂无活跃实例
          </div>
        )}

        {!loading && !error && instances.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>实例</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">失败次数</TableHead>
                <TableHead className="text-right">跳闸次数</TableHead>
                <TableHead className="text-right">剩余时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instances.map((inst) => {
                const badge = tripCountBadge(inst.tripCount)
                return (
                  <TableRow key={inst.instanceId}>
                    <TableCell className="font-mono text-xs">
                      {inst.instanceId.slice(0, 12)}
                    </TableCell>
                    <TableCell className={stateBadgeColor(inst.state)}>
                      {stateLabel(inst.state)}
                    </TableCell>
                    <TableCell className="text-right">{inst.failures}</TableCell>
                    <TableCell className="text-right">
                      <Badge className={badge.color}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatDuration(inst.remainingMs)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onReset(inst.instanceId)}
                          disabled={actionPending}
                          title="重置熔断"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onTrip(inst.instanceId)}
                          disabled={actionPending}
                          title="强制熔断"
                        >
                          <Octagon className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
