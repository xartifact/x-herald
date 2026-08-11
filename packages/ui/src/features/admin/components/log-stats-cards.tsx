import { BarChart3, Clock, Database, Zap } from 'lucide-react'

import { Badge } from '../../../shared/components/ui/index'
import { StatCard } from '../../../shared/components/stat-card'
import type { LogStats, LogStorage } from '@xartifact/x-llm-gateway-shared'

const CLIENT_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google Gemini',
  unknown: '未知客户端',
}

interface LogStatsCardsProps {
  stats?: LogStats['overview']
  storage?: LogStorage
  clientStats?: LogStats['clientStats']
}

export function LogStatsCards({ stats, storage, clientStats }: LogStatsCardsProps) {
  if (!stats) return null

  const successRate =
    stats.totalRequests > 0 ? ((stats.successRequests / stats.totalRequests) * 100).toFixed(1) : '0'

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`
    return tokens.toLocaleString()
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(2).replace(/\.00$/, '')}ms`
    return `${(ms / 1000).toFixed(2).replace(/\.00$/, '')}s`
  }

  const topClient = clientStats && clientStats.length > 0 ? clientStats[0] : null
  const topClientName = topClient?.clientType
    ? (CLIENT_LABELS[topClient.clientType] ?? topClient.clientType)
    : '未知客户端'

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="总请求数"
        icon={<BarChart3 className="h-4 w-4" />}
        value={stats.totalRequests.toLocaleString()}
        sub={
          <div className="flex items-center gap-2">
            <Badge
              variant={Number(successRate) >= 95 ? 'default' : 'secondary'}
              className="text-xs"
            >
              {successRate}% 成功率
            </Badge>
            <span className="text-xs text-muted-foreground">
              {stats.successRequests} 成功 / {stats.failureRequests} 失败
            </span>
          </div>
        }
      />
      <StatCard
        title="Token 消耗"
        icon={<Zap className="h-4 w-4" />}
        value={formatTokens(stats.totalTokens)}
        sub={`↑ ${formatTokens(stats.totalInputTokens)} 输入 / ↓ ${formatTokens(stats.totalOutputTokens)} 输出`}
      />
      <StatCard
        title="平均响应时间"
        icon={<Clock className="h-4 w-4" />}
        value={formatDuration(stats.avgResponseTime)}
        sub="响应时间平均值"
      />
      <StatCard
        title="存储状态"
        icon={<Database className="h-4 w-4" />}
        value={storage?.totalCount.toLocaleString() || 0}
        sub={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">已存储日志</span>
            {storage && storage.estimatedExpiredLogs !== '0' && (
              <Badge variant="outline" className="text-xs text-warning">
                {storage.estimatedExpiredLogs} 条过期
              </Badge>
            )}
          </div>
        }
      />

      {topClient && (
        <StatCard
          title="客户端分布"
          icon={<BarChart3 className="h-4 w-4" />}
          value={topClientName}
          sub={
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-xs">
                最多 {topClient.requestCount} 次
              </Badge>
              {(clientStats ?? []).slice(1, 3).map((s) => (
                <span key={s.clientType ?? 'unknown'} className="text-xs text-muted-foreground">
                  {s.clientType ? (CLIENT_LABELS[s.clientType] ?? s.clientType) : '未知'}
                </span>
              ))}
            </div>
          }
        />
      )}
    </div>
  )
}
