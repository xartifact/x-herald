import { useMemo, useState } from 'react'

import { Wifi } from 'lucide-react'

import { useProviderStats } from '../../../hooks/logs'
import {
  ProviderStatsCard,
  ProviderStatsSummary,
  ProviderStatsToolbar,
  Card, CardContent, CardHeader, CardTitle, Badge,
} from '@x-llm-gateway/ui'

interface FilterState {
  sortField: 'avgResponseTime' | 'p95ResponseTime' | 'requestCount' | 'successRate'
  sortOrder: 'asc' | 'desc'
  timeRange: string
}

function buildQueryParams(timeRange: string): Record<string, string> {
  if (timeRange === 'all') return {}
  const start = new Date()
  if (timeRange === '1h') start.setHours(start.getHours() - 1)
  else if (timeRange === '24h') start.setHours(start.getHours() - 24)
  else if (timeRange === '7d') start.setDate(start.getDate() - 7)
  else if (timeRange === '30d') start.setDate(start.getDate() - 30)
  return { startDate: start.toISOString() }
}

export function ProviderStatsPage() {
  const [filter, setFilter] = useState<FilterState>({
    sortField: 'avgResponseTime', sortOrder: 'asc', timeRange: '7d',
  })

  const queryParams = useMemo(() => buildQueryParams(filter.timeRange), [filter.timeRange])
  const { data, isLoading, refetch } = useProviderStats(queryParams)
  const stats = (data as any)?.data ?? []

  const sorted = useMemo(() => {
    return [...stats].sort((a: any, b: any) => {
      let diff = 0
      switch (filter.sortField) {
        case 'avgResponseTime': diff = a.avgResponseTime - b.avgResponseTime; break
        case 'p95ResponseTime': diff = a.p95ResponseTime - b.p95ResponseTime; break
        case 'requestCount': diff = a.totalRequests - b.totalRequests; break
        case 'successRate': {
          const ra = a.totalRequests > 0 ? a.successCount / a.totalRequests : 0
          const rb = b.totalRequests > 0 ? b.successCount / b.totalRequests : 0
          diff = ra - rb; break
        }
      }
      return filter.sortOrder === 'asc' ? diff : -diff
    })
  }, [stats, filter.sortField, filter.sortOrder])

  const summary = useMemo(() => {
    if (!stats.length) return null
    return {
      totalProviders: stats.length,
      totalReq: stats.reduce((s: number, p: any) => s + p.totalRequests, 0),
      totalSuccess: stats.reduce((s: number, p: any) => s + p.successCount, 0),
      avgResponseTime: stats.reduce((s: number, p: any) => s + p.avgResponseTime, 0) / stats.length,
    }
  }, [stats])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Wifi className="h-6 w-6" />供应商统计
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          按网络质量（平均响应时间 + 成功率）对供应商进行排名分析
        </p>
      </div>

      <ProviderStatsSummary summary={summary} />

      <ProviderStatsToolbar
        filter={filter}
        isLoading={isLoading}
        onFilterChange={setFilter}
        onRefresh={() => refetch()}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>供应商排名</span>
            <Badge variant="secondary">{sorted.length} 个供应商</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-24 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">暂无供应商请求数据</div>
          ) : (
            <div className="space-y-3">
              {sorted.map((stat: any, index: number) => (
                <ProviderStatsCard
                  key={stat.providerId ?? stat.providerName ?? index}
                  stat={stat}
                  rank={index + 1}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
