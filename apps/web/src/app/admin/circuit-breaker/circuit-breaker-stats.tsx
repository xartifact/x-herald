import { ShieldAlert, ShieldCheck, Zap } from 'lucide-react'

import { Badge } from '@/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/table'

import type { Stats } from './circuit-breaker-types'
import { relativeTime, tripCountBadge } from './circuit-breaker-utils'

interface CircuitBreakerStatsProps {
  stats: Stats | undefined
  isLoading: boolean
}

export function CircuitBreakerStats({ stats, isLoading }: CircuitBreakerStatsProps) {
  return (
    <>
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Zap className="h-4 w-4" />今日熔断次数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '—' : stats?.todayOpened ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />7 天熔断次数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '—' : stats?.weekOpened ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />触发过熔断的实例
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '—' : stats?.trippedInstanceCount ?? stats?.topInstances.length ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {stats && stats.topInstances.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">高频熔断实例</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>实例</TableHead>
                  <TableHead>模型组</TableHead>
                  <TableHead>供应商</TableHead>
                  <TableHead className="text-right">熔断次数</TableHead>
                  <TableHead className="text-right">熔断等级</TableHead>
                  <TableHead className="text-right">最近一次</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.topInstances.map((inst) => (
                  <TableRow key={inst.instanceId}>
                    <TableCell className="font-medium">{inst.instanceName || inst.instanceId.slice(0, 8)}</TableCell>
                    <TableCell className="text-muted-foreground">{inst.groupName}</TableCell>
                    <TableCell className="text-muted-foreground">{inst.providerName}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{inst.openCount}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge className={tripCountBadge(inst.tripCount).color}>{inst.tripCount}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {relativeTime(inst.lastOpenedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  )
}
