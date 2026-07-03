'use client'

import { useState, useMemo } from 'react'

import { BarChart3, Clock, Hash, Activity, ArrowUpDown } from 'lucide-react'

import { cn } from '../../../shared/lib/utils'
import type { ClientModelStat } from '@xartifact/x-llm-gateway-shared'
import { Badge } from '../../../shared/components/ui/badge'
import { Button } from '../../../shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/card'
import { ScrollArea } from '../../../shared/components/ui/scroll-area'

import { ModelStatRow } from './model-stat-row'

type SortField = 'requestCount' | 'lastRequestAt' | 'totalTokens' | 'avgResponseTime'
type SortOrder = 'desc' | 'asc'

interface ClientModelStatsProps {
  stats: ClientModelStat[]
  isLoading?: boolean
}

const EMPTY_CARD_TITLE = (
  <CardTitle className="text-sm flex items-center gap-2">
    <BarChart3 className="h-4 w-4" />
    客户端模型统计
  </CardTitle>
)

const SKELETON_ROWS = ['row-1', 'row-2', 'row-3', 'row-4', 'row-5']

export function ClientModelStats({ stats, isLoading }: ClientModelStatsProps) {
  const [sortField, setSortField] = useState<SortField>('requestCount')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const sortedStats = useMemo(() => {
    return [...stats].toSorted((a, b) => {
      let comparison = 0
      if (sortField === 'requestCount') comparison = a.requestCount - b.requestCount
      else if (sortField === 'totalTokens') comparison = a.totalTokens - b.totalTokens
      else if (sortField === 'avgResponseTime') comparison = a.avgResponseTime - b.avgResponseTime
      else comparison = new Date(a.lastRequestAt).getTime() - new Date(b.lastRequestAt).getTime()
      return sortOrder === 'desc' ? -comparison : comparison
    })
  }, [stats, sortField, sortOrder])

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')
    else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const SortButton = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        'h-7 text-xs font-normal',
        sortField === field && 'bg-accent text-accent-foreground',
      )}
      onClick={() => handleSort(field)}
    >
      {children}
      {sortField === field && (
        <ArrowUpDown className={cn('ml-1 h-3 w-3', sortOrder === 'asc' && 'rotate-180')} />
      )}
    </Button>
  )

  if (isLoading) {
    return (
      <Card>
        <CardHeader>{EMPTY_CARD_TITLE}</CardHeader>
        <CardContent>
          <div className="space-y-2">
            {SKELETON_ROWS.map((key) => (
              <div key={key} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (stats.length === 0) {
    return (
      <Card>
        <CardHeader>{EMPTY_CARD_TITLE}</CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8 text-sm">
            暂无客户端模型请求数据
          </div>
        </CardContent>
      </Card>
    )
  }

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
          <SortButton field="avgResponseTime">
            <Activity className="mr-1 h-3 w-3" />
            平均响应时间
          </SortButton>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-[300px]">
          <div className="space-y-2">
            {sortedStats.map((stat, index) => (
              <ModelStatRow key={stat.originalModelName} stat={stat} rank={index + 1} />
            ))}
          </div>
        </ScrollArea>
        <div className="mt-3 pt-3 border-t text-xs text-muted-foreground flex justify-between">
          <span>总 Token 消耗: {totalTokens.toLocaleString()}</span>
          <span>平均每模型: {Math.round(totalRequests / stats.length)} 次请求</span>
        </div>
      </CardContent>
    </Card>
  )
}
