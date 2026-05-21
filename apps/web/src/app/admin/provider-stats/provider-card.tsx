import { Server } from 'lucide-react'

import { cn } from '@/core/lib/utils'
import type { ProviderStat } from '@/hooks/use-logs'
import { Badge } from '@x-llm-gateway/ui'

import { formatMs, responseTimeColor, responseTimeQuality, successRateColor } from './provider-stats-utils'

interface ProviderCardProps {
  stat: ProviderStat
  rank: number
}

export function ProviderCard({ stat, rank }: ProviderCardProps) {
  const successRate = stat.totalRequests > 0 ? stat.successCount / stat.totalRequests : 0
  const quality = responseTimeQuality(stat.avgResponseTime)

  return (
    <div className="rounded-lg border p-4 hover:bg-accent/30 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="w-8 justify-center font-mono">{rank}</Badge>
          <Server className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">{stat.providerName ?? '未知供应商'}</span>
          <Badge variant="outline" className={cn('text-xs', quality.className)}>{quality.label}</Badge>
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

      <div className="grid grid-cols-3 md:grid-cols-4 gap-3 text-sm">
        <div className="bg-blue-50/50 dark:bg-blue-950/20 rounded-lg px-3 py-2 border border-blue-100 dark:border-blue-900">
          <div className="text-xs text-muted-foreground">
            TTFB 均值
            {stat.ttfbCount > 0 && <span className="ml-1 text-blue-500">({stat.ttfbCount}/{stat.totalRequests})</span>}
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

      <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', successRate >= 0.95 ? 'bg-green-500' : successRate >= 0.80 ? 'bg-yellow-500' : 'bg-red-500')}
          style={{ width: `${(successRate * 100).toFixed(1)}%` }}
        />
      </div>
    </div>
  )
}
