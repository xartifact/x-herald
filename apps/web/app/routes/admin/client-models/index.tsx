import { useMemo, useState } from 'react'

import { Brain } from 'lucide-react'

import { useClientModelStats } from '../../../hooks/logs'
import {
  ClientModelFilter,
  ClientModelList,
  ClientModelSummary,
  PageHeader,
} from '@xartifact/x-llm-gateway-ui'
import type { FilterConfig } from '@xartifact/x-llm-gateway-ui'

function buildQueryParams(timeRange: string): Record<string, string> {
  if (timeRange === 'all') return {}
  const startDate = new Date()
  switch (timeRange) {
    case '1h':
      startDate.setHours(startDate.getHours() - 1)
      break
    case '24h':
      startDate.setHours(startDate.getHours() - 24)
      break
    case '7d':
      startDate.setDate(startDate.getDate() - 7)
      break
    case '30d':
      startDate.setDate(startDate.getDate() - 30)
      break
  }
  return { startDate: startDate.toISOString() }
}

export function ClientModelsPage() {
  const [filter, setFilter] = useState<FilterConfig>({
    timeRange: '7d',
    search: '',
    sortField: 'requestCount',
    sortOrder: 'desc',
  })

  const queryParams = useMemo(() => buildQueryParams(filter.timeRange), [filter.timeRange])
  const { data: statsData, isLoading, refetch } = useClientModelStats(queryParams)
  const stats = useMemo(() => (statsData as any)?.data ?? [], [statsData])

  const filteredStats = useMemo(() => {
    const filtered = filter.search
      ? stats.filter((s: any) =>
          s.originalModelName.toLowerCase().includes(filter.search.toLowerCase()),
        )
      : stats

    return [...filtered].toSorted((a: any, b: any) => {
      let cmp = 0
      switch (filter.sortField) {
        case 'requestCount':
          cmp = a.requestCount - b.requestCount
          break
        case 'totalTokens':
          cmp = a.totalTokens - b.totalTokens
          break
        case 'avgResponseTime':
          cmp = a.avgResponseTime - b.avgResponseTime
          break
        case 'lastRequestAt':
          cmp = new Date(a.lastRequestAt).getTime() - new Date(b.lastRequestAt).getTime()
          break
        case 'successRate': {
          const ra = a.requestCount > 0 ? a.successCount / a.requestCount : 0
          const rb = b.requestCount > 0 ? b.successCount / b.requestCount : 0
          cmp = ra - rb
          break
        }
      }
      return filter.sortOrder === 'desc' ? -cmp : cmp
    })
  }, [stats, filter])

  const summary = useMemo(() => {
    if (!stats.length) return null
    return {
      totalModels: stats.length,
      totalRequests: stats.reduce((s: number, x: any) => s + x.requestCount, 0),
      totalSuccess: stats.reduce((s: number, x: any) => s + x.successCount, 0),
      totalFailure: stats.reduce((s: number, x: any) => s + x.failureCount, 0),
      totalTokens: stats.reduce((s: number, x: any) => s + x.totalTokens, 0),
      avgResponseTime: stats.reduce((s: number, x: any) => s + x.avgResponseTime, 0) / stats.length,
    }
  }, [stats])

  return (
    <div className="space-y-6">
      <PageHeader
        title="模型统计"
        description="查看和分析客户端请求的所有模型使用情况"
        icon={<Brain className="h-5 w-5 text-muted-foreground" />}
      />

      <ClientModelSummary summary={summary} />

      <ClientModelFilter
        config={filter}
        isLoading={isLoading}
        onConfigChange={setFilter}
        onRefresh={() => refetch()}
      />

      <ClientModelList
        stats={filteredStats}
        total={stats.length}
        isLoading={isLoading}
        searchQuery={filter.search}
      />
    </div>
  )
}
