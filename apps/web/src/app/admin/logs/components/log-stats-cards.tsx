'use client'

import { BarChart3, Clock, Database, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { LogStats } from '@/hooks/use-logs'
import type { LogStorage } from '@/hooks/use-logs'
import { CLIENT_REGISTRY } from '@/features/gateway/services/client-identifier'

interface LogStatsCardsProps {
  stats?: LogStats['overview']
  storage?: LogStorage
  clientStats?: LogStats['clientStats']
}

export function LogStatsCards({ stats, storage, clientStats }: LogStatsCardsProps) {
  if (!stats) return null

  const successRate = stats.totalRequests > 0
    ? ((stats.successRequests / stats.totalRequests) * 100).toFixed(1)
    : '0'

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`
    return tokens.toLocaleString()
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(2).replace(/\.00$/, '')}ms`
    return `${(ms / 1000).toFixed(2).replace(/\.00$/, '')}s`
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">总请求数</CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalRequests.toLocaleString()}</div>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={Number(successRate) >= 95 ? 'default' : 'secondary'} className="text-xs">
              {successRate}% 成功率
            </Badge>
            <span className="text-xs text-muted-foreground">
              {stats.successRequests} 成功 / {stats.failureRequests} 失败
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Token 消耗</CardTitle>
          <Zap className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatTokens(stats.totalTokens)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            ↑ {formatTokens(stats.totalInputTokens)} 输入 / ↓ {formatTokens(stats.totalOutputTokens)} 输出
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">平均延迟</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatDuration(stats.avgLatency)}</div>
          <div className="text-xs text-muted-foreground mt-1">响应时间平均值</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">存储状态</CardTitle>
          <Database className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{storage?.totalCount.toLocaleString() || 0}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">已存储日志</span>
            {storage && storage.estimatedExpiredLogs !== '0' && (
              <Badge variant="outline" className="text-xs text-amber-600">
                {storage.estimatedExpiredLogs} 条过期
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {clientStats && clientStats.length > 0 && (() => {
        const top = clientStats[0]
        const topName = top.clientType
          ? (CLIENT_REGISTRY[top.clientType] ?? top.clientType)
          : '未知客户端'
        return (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">客户端分布</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold truncate" title={topName}>{topName}</div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="secondary" className="text-xs">
                  最多 {top.requestCount} 次
                </Badge>
                {clientStats.slice(1, 3).map(s => (
                  <span key={s.clientType ?? 'unknown'} className="text-xs text-muted-foreground">
                    {s.clientType ? (CLIENT_REGISTRY[s.clientType] ?? s.clientType) : '未知'}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })()}
    </div>
  )
}
