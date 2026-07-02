'use client'

import { DollarSign, Hash, ArrowRightLeft, Receipt } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui'
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

export function CostSummaryCards({ summary }: CostSummaryCardsProps) {
  if (!summary) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">总费用</CardTitle>
          <DollarSign className="h-4 w-4 text-emerald-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-emerald-600">
            {formatCurrency(summary.totalCost)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">累计 API 调用费用</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">总请求数</CardTitle>
          <Hash className="h-4 w-4 text-blue-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-600">
            {summary.requestCount.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground mt-1">API 请求总数</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">总 Token</CardTitle>
          <ArrowRightLeft className="h-4 w-4 text-purple-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-purple-600">{formatTokens(totalTokens)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            ↑ {formatTokens(summary.totalInputTokens)} 输入 / ↓{' '}
            {formatTokens(summary.totalOutputTokens)} 输出
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">平均费用</CardTitle>
          <Receipt className="h-4 w-4 text-orange-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-orange-600">
            {formatCurrency(avgCostPerRequest)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">单次请求平均费用</div>
        </CardContent>
      </Card>
    </div>
  )
}
