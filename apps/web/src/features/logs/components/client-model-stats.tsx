'use client'

import { useState, useMemo } from 'react'

import { BarChart3, Clock, Hash, Activity, ArrowUpDown } from 'lucide-react'

import { cn } from '@/core/lib/utils'
import type { ClientModelStat } from '@/hooks/use-logs'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { ScrollArea } from '@/ui/scroll-area'

type SortField = 'requestCount' | 'lastRequestAt' | 'totalTokens' | 'avgLatency'
type SortOrder = 'desc' | 'asc'

interface ClientModelStatsProps {
  stats: ClientModelStat[]
  isLoading?: boolean
}

export function ClientModelStats({ stats, isLoading }: ClientModelStatsProps) {
  const [sortField, setSortField] = useState<SortField>('requestCount')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  // 排序后的数据
  const sortedStats = useMemo(() => {
    const sorted = [...stats].sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'requestCount':
          comparison = a.requestCount - b.requestCount
          break
        case 'totalTokens':
          comparison = a.totalTokens - b.totalTokens
          break
        case 'avgLatency':
          comparison = a.avgLatency - b.avgLatency
          break
        case 'lastRequestAt':
          comparison = new Date(a.lastRequestAt).getTime() - new Date(b.lastRequestAt).getTime()
          break
      }
      return sortOrder === 'desc' ? -comparison : comparison
    })
    return sorted
  }, [stats, sortField, sortOrder])

  // 切换排序
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  // 排序按钮组件
  const SortButton = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "h-7 text-xs font-normal",
        sortField === field && "bg-accent text-accent-foreground"
      )}
      onClick={() => handleSort(field)}
    >
      {children}
      {sortField === field && (
        <ArrowUpDown className={cn("ml-1 h-3 w-3", sortOrder === 'asc' && "rotate-180")} />
      )}
    </Button>
  )

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            客户端模型统计
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (stats.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            客户端模型统计
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8 text-sm">
            暂无客户端模型请求数据
          </div>
        </CardContent>
      </Card>
    )
  }

  // 计算总计
  const totalRequests = stats.reduce((sum, s) => sum + s.requestCount, 0)
  const totalTokens = stats.reduce((sum, s) => sum + s.totalTokens, 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            客户端模型统计
            <Badge variant="secondary" className="text-xs">
              {stats.length} 个模型
            </Badge>
          </CardTitle>
          <div className="text-xs text-muted-foreground">
            共 {totalRequests.toLocaleString()} 次请求
          </div>
        </div>
        
        {/* 排序选项 */}
        <div className="flex flex-wrap gap-1 pt-2">
          <SortButton field="requestCount">
            <Hash className="mr-1 h-3 w-3" />
            请求数
          </SortButton>
          <SortButton field="lastRequestAt">
            <Clock className="mr-1 h-3 w-3" />
            最近请求
          </SortButton>
          <SortButton field="totalTokens">
            <Activity className="mr-1 h-3 w-3" />
            Token消耗
          </SortButton>
          <SortButton field="avgLatency">
            <Activity className="mr-1 h-3 w-3" />
            平均延迟
          </SortButton>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <ScrollArea className="h-[300px]">
          <div className="space-y-2">
            {sortedStats.map((stat, index) => {
              const successRate = stat.requestCount > 0 
                ? (stat.successCount / stat.requestCount * 100).toFixed(1)
                : '0'
              
              return (
                <div
                  key={stat.originalModelName}
                  className="rounded-lg border p-3 text-sm hover:bg-accent/50 transition-colors"
                >
                  {/* 头部：模型名和排名 */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs w-6 justify-center">
                        {index + 1}
                      </Badge>
                      <span className="font-medium font-mono text-xs">
                        {stat.originalModelName}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(stat.lastRequestAt).toLocaleDateString()}
                    </div>
                  </div>
                  
                  {/* 统计指标 */}
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div className="bg-muted/50 rounded px-2 py-1">
                      <div className="text-muted-foreground">请求</div>
                      <div className="font-semibold">{stat.requestCount.toLocaleString()}</div>
                    </div>
                    <div className="bg-muted/50 rounded px-2 py-1">
                      <div className="text-muted-foreground">成功率</div>
                      <div className={cn(
                        "font-semibold",
                        Number(successRate) >= 95 ? "text-green-600" : 
                        Number(successRate) >= 80 ? "text-yellow-600" : "text-red-600"
                      )}>
                        {successRate}%
                      </div>
                    </div>
                    <div className="bg-muted/50 rounded px-2 py-1">
                      <div className="text-muted-foreground">Tokens</div>
                      <div className="font-semibold">{stat.totalTokens.toLocaleString()}</div>
                    </div>
                    <div className="bg-muted/50 rounded px-2 py-1">
                      <div className="text-muted-foreground">延迟</div>
                      <div className="font-semibold">{Math.round(stat.avgLatency)}ms</div>
                    </div>
                  </div>
                  
                  {/* 成功率进度条 */}
                  <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        Number(successRate) >= 95 ? "bg-green-500" : 
                        Number(successRate) >= 80 ? "bg-yellow-500" : "bg-red-500"
                      )}
                      style={{ width: `${successRate}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>
        
        {/* 底部汇总 */}
        <div className="mt-3 pt-3 border-t text-xs text-muted-foreground flex justify-between">
          <span>总 Token 消耗: {totalTokens.toLocaleString()}</span>
          <span>平均每模型: {Math.round(totalRequests / stats.length)} 次请求</span>
        </div>
      </CardContent>
    </Card>
  )
}
