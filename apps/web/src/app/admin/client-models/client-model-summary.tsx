import { cn } from '@x-llm-gateway/ui'
import { Card, CardContent } from '@x-llm-gateway/ui'

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

  const successRate = summary.totalRequests > 0
    ? summary.totalSuccess / summary.totalRequests
    : 0

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">模型种类</div>
          <div className="text-2xl font-bold">{summary.totalModels}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">总请求数</div>
          <div className="text-2xl font-bold">{summary.totalRequests.toLocaleString()}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">成功率</div>
          <div className={cn(
            "text-2xl font-bold",
            successRate >= 0.95 ? "text-green-600" : successRate >= 0.80 ? "text-yellow-600" : "text-red-600"
          )}>
            {(successRate * 100).toFixed(1)}%
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">总 Token</div>
          <div className="text-2xl font-bold">{(summary.totalTokens / 1_000_000).toFixed(2)}M</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">平均响应时间</div>
          <div className="text-2xl font-bold">{Math.round(summary.avgResponseTime)}ms</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">失败请求</div>
          <div className="text-2xl font-bold text-red-600">{summary.totalFailure}</div>
        </CardContent>
      </Card>
    </div>
  )
}
