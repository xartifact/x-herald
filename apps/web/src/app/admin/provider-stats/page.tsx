'use client'

import { useMemo, useState } from 'react'

import {
  Activity,
  ArrowUpDown,
  BarChart3,
  Clock,
  Hash,
  RefreshCw,
  Server,
  Wifi,
} from 'lucide-react'

import { cn } from '@/core/lib/utils'
import { useProviderStats } from '@/hooks/use-logs'
import type { ProviderStat } from '@/hooks/use-logs'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'

type SortField = 'avgResponseTime' | 'requestCount' | 'successRate' | 'p95ResponseTime'
type SortOrder = 'asc' | 'desc'

function responseTimeQuality(ms: number): { label: string; className: string } {
  if (ms < 1000) return { label: '优秀', className: 'bg-green-50 text-green-700 border-green-200' }
  if (ms < 3000) return { label: '良好', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' }
  return { label: '较差', className: 'bg-red-50 text-red-700 border-red-200' }
}

function responseTimeColor(ms: number) {
  if (ms < 1000) return 'text-green-600'
  if (ms < 3000) return 'text-yellow-600'
  return 'text-red-600'
}

function successRateColor(rate: number) {
  if (rate >= 0.95) return 'text-green-600'
  if (rate >= 0.80) return 'text-yellow-600'
  return 'text-red-600'
}

function formatMs(ms: number) {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}

export default function ProviderStatsPage() {
  const [timeRange, setTimeRange] = useState('7d')
  const [sortField, setSortField] = useState<SortField>('avgResponseTime')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

  const queryParams = useMemo((): Record<string, string> => {
    if (timeRange === 'all') return {}
    const now = new Date()
    const start = new Date(now)
    if (timeRange === '1h') start.setHours(now.getHours() - 1)
    else if (timeRange === '24h') start.setHours(now.getHours() - 24)
    else if (timeRange === '7d') start.setDate(now.getDate() - 7)
    else if (timeRange === '30d') start.setDate(now.getDate() - 30)
    return { startDate: start.toISOString() }
  }, [timeRange])

  const { data, isLoading, refetch } = useProviderStats(queryParams)
  const stats = data?.data ?? []

  const sorted = useMemo(() => {
    return [...stats].sort((a, b) => {
      let diff = 0
      switch (sortField) {
        case 'avgResponseTime':
          diff = a.avgResponseTime - b.avgResponseTime
          break
        case 'p95ResponseTime':
          diff = a.p95ResponseTime - b.p95ResponseTime
          break
        case 'requestCount':
          diff = a.totalRequests - b.totalRequests
          break
        case 'successRate': {
          const ra = a.totalRequests > 0 ? a.successCount / a.totalRequests : 0
          const rb = b.totalRequests > 0 ? b.successCount / b.totalRequests : 0
          diff = ra - rb
          break
        }
      }
      return sortOrder === 'asc' ? diff : -diff
    })
  }, [stats, sortField, sortOrder])

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder(field === 'successRate' ? 'desc' : 'asc')
    }
  }

  const summary = useMemo(() => {
    if (stats.length === 0) return null
    const totalReq = stats.reduce((s, p) => s + p.totalRequests, 0)
    const totalSuccess = stats.reduce((s, p) => s + p.successCount, 0)
    const avgResponseTime = stats.reduce((s, p) => s + p.avgResponseTime, 0) / stats.length
    const best = [...stats].sort((a, b) => a.avgResponseTime - b.avgResponseTime)[0]
    return { totalProviders: stats.length, totalReq, totalSuccess, avgResponseTime, best }
  }, [stats])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Wifi className="h-6 w-6" />
          供应商统计
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          按网络质量（平均响应时间 + 成功率）对供应商进行排名分析
        </p>
      </div>

      {/* 汇总卡片 */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">供应商数</div>
              <div className="text-2xl font-bold">{summary.totalProviders}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">总请求数</div>
              <div className="text-2xl font-bold">{summary.totalReq.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">整体成功率</div>
              <div className={cn(
                'text-2xl font-bold',
                successRateColor(summary.totalReq > 0 ? summary.totalSuccess / summary.totalReq : 0)
              )}>
                {summary.totalReq > 0
                  ? ((summary.totalSuccess / summary.totalReq) * 100).toFixed(1)
                  : '0'}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">整体平均响应时间</div>
              <div className={cn('text-2xl font-bold', responseTimeColor(summary.avgResponseTime))}>
                {formatMs(summary.avgResponseTime)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 工具栏 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {([
                ['avgResponseTime', <Clock key="c" className="mr-1 h-4 w-4" />, '平均响应时间'],
                ['p95ResponseTime', <BarChart3 key="b" className="mr-1 h-4 w-4" />, 'P95 响应时间'],
                ['successRate', <Activity key="a" className="mr-1 h-4 w-4" />, '成功率'],
                ['requestCount', <Hash key="h" className="mr-1 h-4 w-4" />, '请求数'],
              ] as [SortField, React.ReactNode, string][]).map(([field, icon, label]) => (
                <Button
                  key={field}
                  variant={sortField === field ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSort(field)}
                  className="h-8"
                >
                  {icon}{label}
                  {sortField === field && (
                    <ArrowUpDown className={cn('ml-1 h-3 w-3', sortOrder === 'desc' && 'rotate-180')} />
                  )}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-32 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">最近1小时</SelectItem>
                  <SelectItem value="24h">最近24小时</SelectItem>
                  <SelectItem value="7d">最近7天</SelectItem>
                  <SelectItem value="30d">最近30天</SelectItem>
                  <SelectItem value="all">全部时间</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
                <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
                刷新
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 供应商列表 */}
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
            <div className="text-center text-muted-foreground py-12">
              暂无供应商请求数据
            </div>
          ) : (
            <div className="space-y-3">
              {sorted.map((stat, index) => {
                const successRate = stat.totalRequests > 0
                  ? stat.successCount / stat.totalRequests
                  : 0
                const quality = responseTimeQuality(stat.avgResponseTime)

                return (
                  <ProviderCard
                    key={stat.providerId ?? stat.providerName ?? index}
                    stat={stat}
                    rank={index + 1}
                    successRate={successRate}
                    quality={quality}
                  />
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

interface ProviderCardProps {
  stat: ProviderStat
  rank: number
  successRate: number
  quality: { label: string; className: string }
}

function ProviderCard({ stat, rank, successRate, quality }: ProviderCardProps) {
  return (
    <div className="rounded-lg border p-4 hover:bg-accent/30 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="w-8 justify-center font-mono">
            {rank}
          </Badge>
          <Server className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">{stat.providerName ?? '未知供应商'}</span>
          <Badge variant="outline" className={cn('text-xs', quality.className)}>
            {quality.label}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          最后请求: {new Date(stat.lastRequestAt).toLocaleString('zh-CN')}
        </span>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-4 gap-3 text-sm mb-2">
        <div className="bg-muted/50 rounded-lg px-3 py-2">
          <div className="text-xs text-muted-foreground">请求数</div>
          <div className="font-semibold text-base">{stat.totalRequests.toLocaleString()}</div>
        </div>
        <div className="bg-muted/50 rounded-lg px-3 py-2">
          <div className="text-xs text-muted-foreground">成功率</div>
          <div className={cn('font-semibold text-base', successRateColor(successRate))}>
            {(successRate * 100).toFixed(1)}%
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg px-3 py-2">
          <div className="text-xs text-muted-foreground">平均响应时间</div>
          <div className={cn('font-semibold text-base', responseTimeColor(stat.avgResponseTime))}>
            {formatMs(stat.avgResponseTime)}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg px-3 py-2">
          <div className="text-xs text-muted-foreground">P95 响应时间</div>
          <div className={cn('font-semibold text-base', responseTimeColor(stat.p95ResponseTime))}>
            {formatMs(stat.p95ResponseTime)}
          </div>
        </div>
      </div>

      {/* TTFB 行 */}
      <div className="grid grid-cols-3 md:grid-cols-4 gap-3 text-sm">
        <div className="bg-blue-50/50 dark:bg-blue-950/20 rounded-lg px-3 py-2 border border-blue-100 dark:border-blue-900">
          <div className="text-xs text-muted-foreground">
            TTFB 均值
            {stat.ttfbCount > 0 && (
              <span className="ml-1 text-blue-500">({stat.ttfbCount}/{stat.totalRequests})</span>
            )}
          </div>
          <div className={cn('font-semibold text-base', stat.avgTtfb != null ? responseTimeColor(stat.avgTtfb) : 'text-muted-foreground')}>
            {stat.avgTtfb != null ? formatMs(stat.avgTtfb) : '—'}
          </div>
        </div>
        <div className="bg-blue-50/50 dark:bg-blue-950/20 rounded-lg px-3 py-2 border border-blue-100 dark:border-blue-900">
          <div className="text-xs text-muted-foreground">TTFB P95</div>
          <div className={cn('font-semibold text-base', stat.p95Ttfb != null ? responseTimeColor(stat.p95Ttfb) : 'text-muted-foreground')}>
            {stat.p95Ttfb != null ? formatMs(stat.p95Ttfb) : '—'}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg px-3 py-2">
          <div className="text-xs text-muted-foreground">最快</div>
          <div className="font-semibold text-base text-green-600">{formatMs(stat.minResponseTime)}</div>
        </div>
        <div className="bg-muted/50 rounded-lg px-3 py-2">
          <div className="text-xs text-muted-foreground">最慢</div>
          <div className="font-semibold text-base text-red-600">{formatMs(stat.maxResponseTime)}</div>
        </div>
      </div>

      {/* 成功率进度条 */}
      <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            successRate >= 0.95 ? 'bg-green-500' : successRate >= 0.80 ? 'bg-yellow-500' : 'bg-red-500'
          )}
          style={{ width: `${(successRate * 100).toFixed(1)}%` }}
        />
      </div>
    </div>
  )
}
