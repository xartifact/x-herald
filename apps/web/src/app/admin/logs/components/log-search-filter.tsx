'use client'

import { Search, RefreshCw } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/core/lib/utils'

interface LogSearchFilterProps {
  searchQuery: string
  onSearchChange: (value: string) => void
  statusFilter: string
  onStatusChange: (value: string) => void
  timeRange: string
  onTimeRangeChange: (value: string) => void
  onRefresh: () => void
  isRefreshing?: boolean
}

export function LogSearchFilter({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  timeRange,
  onTimeRangeChange,
  onRefresh,
  isRefreshing = false,
}: LogSearchFilterProps) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索模型名称或虚拟密钥..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={onStatusChange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="状态筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="success">成功</SelectItem>
                <SelectItem value="failure">失败</SelectItem>
              </SelectContent>
            </Select>

            <Select value={timeRange} onValueChange={onTimeRangeChange}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="时间范围" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部时间</SelectItem>
                <SelectItem value="1h">最近 1 小时</SelectItem>
                <SelectItem value="24h">最近 24 小时</SelectItem>
                <SelectItem value="7d">最近 7 天</SelectItem>
                <SelectItem value="30d">最近 30 天</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="刷新数据"
            >
              <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
