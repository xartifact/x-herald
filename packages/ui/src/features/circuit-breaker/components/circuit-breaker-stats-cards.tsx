import { Zap, ShieldAlert, ShieldCheck } from 'lucide-react'

import { Card, CardContent } from '../../../shared/components/ui/card'
import { Button } from '../../../shared/components/ui/button'
import { StatCard } from '../../../shared/components/stat-card'
import type { CircuitBreakerStats } from '@xartifact/x-herald-shared'

interface Props {
  stats: CircuitBreakerStats | null | undefined
  loading: boolean
  error: Error | null
  onRetry: () => void
}

export function CircuitBreakerStatsCards({ stats, loading, error, onRetry }: Props) {
  if (error) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="col-span-full">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center gap-2 text-destructive">
              <p>加载统计信息失败</p>
              <Button variant="outline" size="sm" onClick={onRetry}>
                重试
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <StatCard
        title="今日熔断次数"
        icon={<Zap className="h-4 w-4" />}
        value={stats?.todayOpened ?? 0}
        loading={loading}
      />
      <StatCard
        title="7 天熔断次数"
        icon={<ShieldAlert className="h-4 w-4" />}
        value={stats?.weekOpened ?? 0}
        loading={loading}
      />
      <StatCard
        title="触发过熔断的实例"
        icon={<ShieldCheck className="h-4 w-4" />}
        value={stats?.trippedInstanceCount ?? 0}
        loading={loading}
      />
    </div>
  )
}
