import { cn } from '@/core/lib/utils'
import { Card, CardContent } from '@x-llm-gateway/ui'

import { formatMs, responseTimeColor, successRateColor } from './provider-stats-utils'

interface SummaryData {
  totalProviders: number
  totalReq: number
  totalSuccess: number
  avgResponseTime: number
}

interface ProviderStatsSummaryProps {
  summary: SummaryData | null
}

export function ProviderStatsSummary({ summary }: ProviderStatsSummaryProps) {
  if (!summary) return null

  const overallSuccessRate = summary.totalReq > 0 ? summary.totalSuccess / summary.totalReq : 0

  return (
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
          <div className={cn('text-2xl font-bold', successRateColor(overallSuccessRate))}>
            {(overallSuccessRate * 100).toFixed(1)}%
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
  )
}
