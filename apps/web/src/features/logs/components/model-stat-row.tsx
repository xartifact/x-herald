import { cn } from '@/core/lib/utils'
import type { ClientModelStat } from '@/hooks/use-logs'
import { Badge } from '@x-llm-gateway/ui'

interface ModelStatRowProps {
  stat: ClientModelStat
  rank: number
}

export function ModelStatRow({ stat, rank }: ModelStatRowProps) {
  const successRate = stat.requestCount > 0
    ? (stat.successCount / stat.requestCount * 100).toFixed(1)
    : '0'
  const rateNum = Number(successRate)
  const rateColor = rateNum >= 95 ? 'text-green-600' : rateNum >= 80 ? 'text-yellow-600' : 'text-red-600'
  const barColor = rateNum >= 95 ? 'bg-green-500' : rateNum >= 80 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="rounded-lg border p-3 text-sm hover:bg-accent/50 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs w-6 justify-center">{rank}</Badge>
          <span className="font-medium font-mono text-xs">{stat.originalModelName}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {new Date(stat.lastRequestAt).toLocaleDateString()}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="bg-muted/50 rounded px-2 py-1">
          <div className="text-muted-foreground">请求</div>
          <div className="font-semibold">{stat.requestCount.toLocaleString()}</div>
        </div>
        <div className="bg-muted/50 rounded px-2 py-1">
          <div className="text-muted-foreground">成功率</div>
          <div className={cn('font-semibold', rateColor)}>{successRate}%</div>
        </div>
        <div className="bg-muted/50 rounded px-2 py-1">
          <div className="text-muted-foreground">Tokens</div>
          <div className="font-semibold">{stat.totalTokens.toLocaleString()}</div>
        </div>
        <div className="bg-muted/50 rounded px-2 py-1">
          <div className="text-muted-foreground">响应时间</div>
          <div className="font-semibold">{Math.round(stat.avgResponseTime)}ms</div>
        </div>
      </div>

      <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', barColor)} style={{ width: `${successRate}%` }} />
      </div>
    </div>
  )
}
