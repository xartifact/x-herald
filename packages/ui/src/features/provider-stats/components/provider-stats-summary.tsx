import { StatCard } from '../../../shared/components/stat-card'
import { successRateTone, responseTimeTone } from '../../../shared/lib/health-tone'

import { formatMs } from './provider-stats-utils'

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
      <StatCard title="供应商数" value={summary.totalProviders} />
      <StatCard title="总请求数" value={summary.totalReq.toLocaleString()} />
      <StatCard
        title="整体成功率"
        value={`${(overallSuccessRate * 100).toFixed(1)}%`}
        tone={successRateTone(overallSuccessRate)}
      />
      <StatCard
        title="整体平均响应时间"
        value={formatMs(summary.avgResponseTime)}
        tone={responseTimeTone(summary.avgResponseTime)}
      />
    </div>
  )
}
