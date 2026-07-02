import { cn } from '../../../shared/lib/utils'
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ScrollArea,
} from '../../../shared/components/ui'

interface ModelStat {
  originalModelName: string
  requestCount: number
  successCount: number
  failureCount: number
  totalTokens: number
  avgResponseTime: number
  lastRequestAt: string
}

interface ClientModelListProps {
  stats: ModelStat[]
  total: number
  isLoading: boolean
  searchQuery: string
}

export function ClientModelList({ stats, total, isLoading, searchQuery }: ClientModelListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>模型列表</span>
          <Badge variant="secondary">
            {stats.length} / {total} 个模型
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : stats.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            {searchQuery ? '没有找到匹配的模型' : '暂无客户端模型请求数据'}
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="space-y-3">
              {stats.map((stat, index) => {
                const successRate =
                  stat.requestCount > 0
                    ? ((stat.successCount / stat.requestCount) * 100).toFixed(1)
                    : '0'
                return (
                  <div
                    key={stat.originalModelName}
                    className="rounded-lg border p-4 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="w-8 justify-center">
                          {index + 1}
                        </Badge>
                        <span className="font-medium font-mono text-sm">
                          {stat.originalModelName}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        最后请求: {new Date(stat.lastRequestAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-4 text-sm">
                      <div className="bg-muted/50 rounded-lg px-3 py-2">
                        <div className="text-xs text-muted-foreground">请求次数</div>
                        <div className="font-semibold text-lg">
                          {stat.requestCount.toLocaleString()}
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded-lg px-3 py-2">
                        <div className="text-xs text-muted-foreground">成功率</div>
                        <div
                          className={cn(
                            'font-semibold text-lg',
                            Number(successRate) >= 95
                              ? 'text-green-600'
                              : Number(successRate) >= 80
                                ? 'text-yellow-600'
                                : 'text-red-600',
                          )}
                        >
                          {successRate}%
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded-lg px-3 py-2">
                        <div className="text-xs text-muted-foreground">Token 消耗</div>
                        <div className="font-semibold text-lg">
                          {stat.totalTokens.toLocaleString()}
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded-lg px-3 py-2">
                        <div className="text-xs text-muted-foreground">平均响应时间</div>
                        <div className="font-semibold text-lg">
                          {Math.round(stat.avgResponseTime)}ms
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded-lg px-3 py-2">
                        <div className="text-xs text-muted-foreground">失败次数</div>
                        <div className="font-semibold text-lg text-red-600">
                          {stat.failureCount}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          Number(successRate) >= 95
                            ? 'bg-green-500'
                            : Number(successRate) >= 80
                              ? 'bg-yellow-500'
                              : 'bg-red-500',
                        )}
                        style={{ width: `${successRate}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
