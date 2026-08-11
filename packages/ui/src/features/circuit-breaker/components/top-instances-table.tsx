import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/card'
import { Badge } from '../../../shared/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/components/ui/table'
import type { CircuitBreakerTopInstance } from '@xartifact/x-llm-gateway-shared'
import { tripCountBadge, relativeTime } from './utils'

interface Props {
  instances: CircuitBreakerTopInstance[]
}

export function TopInstancesTable({ instances }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">高频熔断实例</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {instances.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            暂无高频熔断实例
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>实例</TableHead>
                <TableHead>模型组</TableHead>
                <TableHead>供应商</TableHead>
                <TableHead className="text-right">熔断次数</TableHead>
                <TableHead className="text-right">跳闸次数</TableHead>
                <TableHead className="text-right">最近一次</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instances.map((inst) => {
                const badge = tripCountBadge(inst.tripCount)
                return (
                  <TableRow key={inst.instanceId}>
                    <TableCell>{inst.instanceName || inst.instanceId.slice(0, 12)}</TableCell>
                    <TableCell>{inst.groupName}</TableCell>
                    <TableCell>{inst.providerName}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{inst.openCount}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge className={badge.color}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {relativeTime(inst.lastOpenedAt)}
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
