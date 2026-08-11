import { DollarSign, Hash, ArrowRightLeft, Receipt } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui'
import { StatCard } from '../../../shared/components/stat-card'
import type { CostSummary } from '../hooks'

interface CostSummaryCardsProps {
  summary?: CostSummary
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return tokens.toLocaleString()
}

const SKELETON_CARDS = ['cost-card-1', 'cost-card-2', 'cost-card-3', 'cost-card-4']

export function CostSummaryCards({ summary }: CostSummaryCardsProps) {
  if (!summary) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {SKELETON_CARDS.map((key) => (
          <Card key={key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">加载中...</CardTitle>
              <div className="h-4 w-4 bg-muted rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold bg-muted rounded animate-pulse h-8 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const totalTokens = summary.totalInputTokens + summary.totalOutputTokens
  const avgCostPerRequest = summary.requestCount > 0 ? summary.totalCost / summary.requestCount : 0

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="总费用"
        icon={<DollarSign className="h-4 w-4" />}
        value={formatCurrency(summary.totalCost)}
        sub="累计 API 调用费用"
      />
      <StatCard
        title="总请求数"
        icon={<Hash className="h-4 w-4" />}
        value={summary.requestCount.toLocaleString()}
        sub="API 请求总数"
      />
      <StatCard
        title="总 Token"
        icon={<ArrowRightLeft className="h-4 w-4" />}
        value={formatTokens(totalTokens)}
        sub={`↑ ${formatTokens(summary.totalInputTokens)} 输入 / ↓ ${formatTokens(summary.totalOutputTokens)} 输出`}
      />
      <StatCard
        title="平均费用"
        icon={<Receipt className="h-4 w-4" />}
        value={formatCurrency(avgCostPerRequest)}
        sub="单次请求平均费用"
      />
    </div>
  )
}
