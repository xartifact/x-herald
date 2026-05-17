'use client'

import { useMemo, useState } from 'react'

import { Brain } from 'lucide-react'

import { useClientModelStats } from '@/hooks/use-logs'

import { ClientModelFilter, type FilterConfig } from './client-model-filter'
import { ClientModelList } from './client-model-list'
import { ClientModelSummary } from './client-model-summary'

function buildQueryParams(timeRange: string): Record<string, string> {
  if (timeRange === 'all') return {}
  const startDate = new Date()
  switch (timeRange) {
    case '1h': startDate.setHours(startDate.getHours() - 1); break
    case '24h': startDate.setHours(startDate.getHours() - 24); break
    case '7d': startDate.setDate(startDate.getDate() - 7); break
    case '30d': startDate.setDate(startDate.getDate() - 30); break
  }
  return { startDate: startDate.toISOString() }
}

export default function ClientModelsPage() {
  const [filter, setFilter] = useState<FilterConfig>({
    timeRange: '7d', search: '', sortField: 'requestCount', sortOrder: 'desc',
  })

  const queryParams = useMemo(() => buildQueryParams(filter.timeRange), [filter.timeRange])
  const { data: statsData, isLoading, refetch } = useClientModelStats(queryParams)
  const stats = statsData?.data || []

  const filteredStats = useMemo(() => {
    const filtered = filter.search
      ? stats.filter(s => s.originalModelName.toLowerCase().includes(filter.search.toLowerCase()))
      : stats

    return [...filtered].sort((a, b) => {
      let cmp = 0
      switch (filter.sortField) {
        case 'requestCount': cmp = a.requestCount - b.requestCount; break
        case 'totalTokens': cmp = a.totalTokens - b.totalTokens; break
        case 'avgResponseTime': cmp = a.avgResponseTime - b.avgResponseTime; break
        case 'lastRequestAt': cmp = new Date(a.lastRequestAt).getTime() - new Date(b.lastRequestAt).getTime(); break
        case 'successRate': {
          const ra = a.requestCount > 0 ? a.successCount / a.requestCount : 0
          const rb = b.requestCount > 0 ? b.successCount / b.requestCount : 0
          cmp = ra - rb; break
        }
      }
      return filter.sortOrder === 'desc' ? -cmp : cmp
    })
  }, [stats, filter])

  const summary = useMemo(() => {
    if (!stats.length) return null
    return {
      totalModels: stats.length,
      totalRequests: stats.reduce((s, x) => s + x.requestCount, 0),
      totalSuccess: stats.reduce((s, x) => s + x.successCount, 0),
      totalFailure: stats.reduce((s, x) => s + x.failureCount, 0),
      totalTokens: stats.reduce((s, x) => s + x.totalTokens, 0),
      avgResponseTime: stats.reduce((s, x) => s + x.avgResponseTime, 0) / stats.length,
    }
  }, [stats])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Brain className="h-6 w-6" />模型统计
        </h2>
        <p className="text-sm text-muted-foreground mt-1">查看和分析客户端请求的所有模型使用情况</p>
      </div>

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
