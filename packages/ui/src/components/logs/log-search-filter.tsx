'use client'

import { Search, RefreshCw } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Switch } from '../ui/switch'
import { Card, CardContent } from '../ui/card'

interface LogSearchFilterProps {
  searchQuery: string
  onSearchChange: (value: string) => void
  statusFilter: string
  onStatusChange: (value: string) => void
  /** client type filter value */
  clientTypeFilter: string
  onClientTypeChange: (value: string) => void
  /** Map of client type slugs to display names, used to populate the client type dropdown */
  clientTypeOptions?: Record<string, string>
  timeRange: string
  onTimeRangeChange: (value: string) => void
  onRefresh: () => void
  isRefreshing?: boolean
  autoRefresh?: boolean
  autoRefreshInterval?: number
  onAutoRefreshChange?: (enabled: boolean) => void
  onAutoRefreshIntervalChange?: (seconds: number) => void
}

export function LogSearchFilter({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  clientTypeFilter,
  onClientTypeChange,
  clientTypeOptions,
  timeRange,
  onTimeRangeChange,
  onRefresh,
  isRefreshing = false,
  autoRefresh = false,
  autoRefreshInterval = 30,
  onAutoRefreshChange,
  onAutoRefreshIntervalChange,
}: LogSearchFilterProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索日志..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={onStatusChange}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="success">成功</SelectItem>
              <SelectItem value="failure">失败</SelectItem>
              <SelectItem value="pending">进行中</SelectItem>
            </SelectContent>
          </Select>

          {/* Client type filter */}
          <Select value={clientTypeFilter} onValueChange={onClientTypeChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="客户端" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部客户端</SelectItem>
              {clientTypeOptions &&
                Object.entries(clientTypeOptions).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          {/* Time range filter */}
          <Select value={timeRange} onValueChange={onTimeRangeChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="时间范围" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部时间</SelectItem>
              <SelectItem value="1h">近1小时</SelectItem>
              <SelectItem value="24h">近24小时</SelectItem>
              <SelectItem value="7d">近7天</SelectItem>
              <SelectItem value="30d">近30天</SelectItem>
            </SelectContent>
          </Select>

          {/* Auto refresh controls */}
          {onAutoRefreshChange && (
            <div className="flex items-center gap-2">
              <Switch
                checked={autoRefresh}
                onCheckedChange={onAutoRefreshChange}
                id="auto-refresh"
              />
              <label htmlFor="auto-refresh" className="text-sm text-muted-foreground cursor-pointer">
                自动刷新
              </label>
              {autoRefresh && onAutoRefreshIntervalChange && (
                <Select
                  value={String(autoRefreshInterval)}
                  onValueChange={(v) => onAutoRefreshIntervalChange(Number(v))}
                >
                  <SelectTrigger className="w-[80px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5s</SelectItem>
                    <SelectItem value="10">10s</SelectItem>
                    <SelectItem value="30">30s</SelectItem>
                    <SelectItem value="60">60s</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Refresh button */}
          <Button
            variant="outline"
            size="icon"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
