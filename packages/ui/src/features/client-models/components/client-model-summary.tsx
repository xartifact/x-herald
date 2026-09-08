import { StatCard } from '../../../shared/components/stat-card'
import { successRateTone } from '../../../shared/lib/health-tone'

interface SummaryData {
  totalModels: number
  totalRequests: number
  totalSuccess: number
  totalFailure: number
  totalTokens: number
  avgResponseTime: number
}

interface ClientModelSummaryProps {
  summary: SummaryData | null
}

export function ClientModelSummary({ summary }: ClientModelSummaryProps) {
  if (!summary) return null

  const successRate = summary.totalRequests > 0 ? summary.totalSuccess / summary.totalRequests : 0

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
      <StatCard title="模型种类" value={summary.totalModels} />
      <StatCard title="总请求数" value={summary.totalRequests.toLocaleString()} />
      <StatCard
        title="成功率"
        value={`${(successRate * 100).toFixed(1)}%`}
        tone={successRateTone(successRate)}
      />
      <StatCard title="总 Token" value={`${(summary.totalTokens / 1_000_000).toFixed(2)}M`} />
      <StatCard title="平均响应时间" value={`${Math.round(summary.avgResponseTime)}ms`} />
      <StatCard
        title="失败数"
        value={summary.totalFailure}
        tone={summary.totalFailure > 0 ? 'danger' : 'default'}
      />
    </div>
  )
}
