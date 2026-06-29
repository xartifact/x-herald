'use client'

import { Zap, ShieldAlert, ShieldCheck } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/card'
import { Button } from '../../../shared/components/ui/button'
import type { CircuitBreakerStats } from '@xartifact/x-llm-gateway-shared'

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

  const items = [
    { title: '今日熔断次数', icon: Zap, value: stats?.todayOpened },
    { title: '7 天熔断次数', icon: ShieldAlert, value: stats?.weekOpened },
    { title: '触发过熔断的实例', icon: ShieldCheck, value: stats?.trippedInstanceCount },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {items.map((item) => (
        <Card key={item.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{item.title}</CardTitle>
            <item.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '—' : (item.value ?? 0)}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
