'use client'

import { useState, useMemo } from 'react'
import { BarChart3, Clock, Hash, Activity, ArrowUpDown, RefreshCw, Brain } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { ScrollArea } from '@/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { cn } from '@/core/lib/utils'
import { useClientModelStats } from '@/hooks/use-logs'

type SortField = 'requestCount' | 'lastRequestAt' | 'totalTokens' | 'avgLatency' | 'successRate'
type SortOrder = 'desc' | 'asc'

export default function ClientModelsPage() {
  const [timeRange, setTimeRange] = useState<string>('7d')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('requestCount')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  // 构建查询参数
  const queryParams = useMemo(() => {
    const params: Record<string, string> = {}
    
    if (timeRange !== 'all') {
      const now = new Date()
      const startDate = new Date()
      
      switch (timeRange) {
        case '1h':
          startDate.setHours(now.getHours() - 1)
          break
        case '24h':
          startDate.setHours(now.getHours() - 24)
          break
        case '7d':
          startDate.setDate(now.getDate() - 7)
          break
        case '30d':
          startDate.setDate(now.getDate() - 30)
          break
      }
      
      params.startDate = startDate.toISOString()
    }
    
    return params
  }, [timeRange])

  const { data: statsData, isLoading, refetch } = useClientModelStats(queryParams)
  const stats = statsData?.data || []

  // 过滤和排序数据
  const filteredAndSortedStats = useMemo(() => {
    let filtered = stats
    
    // 搜索过滤
    if (searchQuery) {
      filtered = stats.filter(stat => 
        stat.originalModelName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    
    // 排序
    const sorted = [...filtered].sort((a, b) => {
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
        case 'successRate':
          const aRate = a.requestCount > 0 ? a.successCount / a.requestCount : 0
          const bRate = b.requestCount > 0 ? b.successCount / b.requestCount : 0
          comparison = aRate - bRate
          break
        case 'lastRequestAt':
          comparison = new Date(a.lastRequestAt).getTime() - new Date(b.lastRequestAt).getTime()
          break
      }
      return sortOrder === 'desc' ? -comparison : comparison
    })
    
    return sorted
  }, [stats, searchQuery, sortField, sortOrder])

  // 切换排序
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  // 计算汇总数据
  const summary = useMemo(() => {
    if (stats.length === 0) return null
    
    return {
      totalModels: stats.length,
      totalRequests: stats.reduce((sum, s) => sum + s.requestCount, 0),
      totalSuccess: stats.reduce((sum, s) => sum + s.successCount, 0),
      totalFailure: stats.reduce((sum, s) => sum + s.failureCount, 0),
      totalTokens: stats.reduce((sum, s) => sum + s.totalTokens, 0),
      avgLatency: stats.reduce((sum, s) => sum + s.avgLatency, 0) / stats.length,
    }
  }, [stats])

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Brain className="h-6 w-6" />
          客户端模型统计
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          查看和分析客户端请求的所有模型使用情况
        </p>
      </div>

      {/* 汇总卡片 */}
      {summary && (
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
                summary.totalRequests > 0 && (summary.totalSuccess / summary.totalRequests) >= 0.95 ? "text-green-600" :
                summary.totalRequests > 0 && (summary.totalSuccess / summary.totalRequests) >= 0.80 ? "text-yellow-600" : "text-red-600"
              )}>
                {summary.totalRequests > 0 ? ((summary.totalSuccess / summary.totalRequests) * 100).toFixed(1) : 0}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">总 Token</div>
              <div className="text-2xl font-bold">{(summary.totalTokens / 1000000).toFixed(2)}M</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">平均延迟</div>
              <div className="text-2xl font-bold">{Math.round(summary.avgLatency)}ms</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">失败请求</div>
              <div className="text-2xl font-bold text-red-600">{summary.totalFailure}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 筛选和排序工具栏 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
              {/* 搜索 */}
              <div className="relative w-full md:w-64">
                <Input
                  placeholder="搜索模型名称..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9"
                />
              </div>
              
              {/* 时间范围 */}
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-full md:w-32 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">最近1小时</SelectItem>
                  <SelectItem value="24h">最近24小时</SelectItem>
                  <SelectItem value="7d">最近7天</SelectItem>
                  <SelectItem value="30d">最近30天</SelectItem>
                  <SelectItem value="all">全部时间</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* 刷新按钮 */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
              刷新
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 排序选项 */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={sortField === 'requestCount' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleSort('requestCount')}
          className="h-8"
        >
          <Hash className="mr-1 h-4 w-4" />
          请求数
          {sortField === 'requestCount' && <ArrowUpDown className={cn("ml-1 h-3 w-3", sortOrder === 'asc' && "rotate-180")} />}
        </Button>
        <Button
          variant={sortField === 'lastRequestAt' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleSort('lastRequestAt')}
          className="h-8"
        >
          <Clock className="mr-1 h-4 w-4" />
          最近请求
          {sortField === 'lastRequestAt' && <ArrowUpDown className={cn("ml-1 h-3 w-3", sortOrder === 'asc' && "rotate-180")} />}
        </Button>
        <Button
          variant={sortField === 'totalTokens' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleSort('totalTokens')}
          className="h-8"
        >
          <Activity className="mr-1 h-4 w-4" />
          Token消耗
          {sortField === 'totalTokens' && <ArrowUpDown className={cn("ml-1 h-3 w-3", sortOrder === 'asc' && "rotate-180")} />}
        </Button>
        <Button
          variant={sortField === 'avgLatency' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleSort('avgLatency')}
          className="h-8"
        >
          <BarChart3 className="mr-1 h-4 w-4" />
          平均延迟
          {sortField === 'avgLatency' && <ArrowUpDown className={cn("ml-1 h-3 w-3", sortOrder === 'asc' && "rotate-180")} />}
        </Button>
        <Button
          variant={sortField === 'successRate' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleSort('successRate')}
          className="h-8"
        >
          <Activity className="mr-1 h-4 w-4" />
          成功率
          {sortField === 'successRate' && <ArrowUpDown className={cn("ml-1 h-3 w-3", sortOrder === 'asc' && "rotate-180")} />}
        </Button>
      </div>

      {/* 数据列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>模型列表</span>
            <Badge variant="secondary">
              {filteredAndSortedStats.length} / {stats.length} 个模型
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
          ) : filteredAndSortedStats.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              {searchQuery ? '没有找到匹配的模型' : '暂无客户端模型请求数据'}
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {filteredAndSortedStats.map((stat, index) => {
                  const successRate = stat.requestCount > 0 
                    ? (stat.successCount / stat.requestCount * 100).toFixed(1)
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
                          <div className="font-semibold text-lg">{stat.requestCount.toLocaleString()}</div>
                        </div>
                        <div className="bg-muted/50 rounded-lg px-3 py-2">
                          <div className="text-xs text-muted-foreground">成功率</div>
                          <div className={cn(
                            "font-semibold text-lg",
                            Number(successRate) >= 95 ? "text-green-600" : 
                            Number(successRate) >= 80 ? "text-yellow-600" : "text-red-600"
                          )}>
                            {successRate}%
                          </div>
                        </div>
                        <div className="bg-muted/50 rounded-lg px-3 py-2">
                          <div className="text-xs text-muted-foreground">Token 消耗</div>
                          <div className="font-semibold text-lg">{stat.totalTokens.toLocaleString()}</div>
                        </div>
                        <div className="bg-muted/50 rounded-lg px-3 py-2">
                          <div className="text-xs text-muted-foreground">平均延迟</div>
                          <div className="font-semibold text-lg">{Math.round(stat.avgLatency)}ms</div>
                        </div>
                        <div className="bg-muted/50 rounded-lg px-3 py-2">
                          <div className="text-xs text-muted-foreground">失败次数</div>
                          <div className="font-semibold text-lg text-red-600">{stat.failureCount}</div>
                        </div>
                      </div>
                      
                      {/* 成功率进度条 */}
                      <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
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
          )}
        </CardContent>
      </Card>
    </div>
  )
}
