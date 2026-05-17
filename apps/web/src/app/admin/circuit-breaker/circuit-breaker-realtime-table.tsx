import { Octagon, RotateCcw } from 'lucide-react'

import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/table'

import type { RealtimeState } from './circuit-breaker-types'
import { formatDuration, stateBadgeColor, stateLabel, tripCountBadge } from './circuit-breaker-utils'

interface CircuitBreakerRealtimeTableProps {
  instances: RealtimeState[]
  onAction: (instanceId: string, action: 'reset' | 'trip') => void
  isPending: boolean
}

export function CircuitBreakerRealtimeTable({ instances, onAction, isPending }: CircuitBreakerRealtimeTableProps) {
  if (instances.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">实时状态</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>实例</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">熔断次数</TableHead>
              <TableHead className="text-right">剩余时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {instances.map((inst) => (
              <TableRow key={inst.instanceId}>
                <TableCell className="font-medium">{inst.instanceId.slice(0, 12)}</TableCell>
                <TableCell>
                  <span className={`font-medium ${stateBadgeColor(inst.state)}`}>
                    {stateLabel(inst.state)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  {inst.tripCount > 0 ? (
                    <Badge className={tripCountBadge(inst.tripCount).color}>{inst.tripCount}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {inst.state === 'open' || inst.state === 'cooldown' ? formatDuration(inst.remainingMs) : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="ghost" size="sm"
                      disabled={isPending}
                      onClick={() => onAction(inst.instanceId, 'reset')}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      disabled={isPending}
                      onClick={() => onAction(inst.instanceId, 'trip')}
                    >
                      <Octagon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
