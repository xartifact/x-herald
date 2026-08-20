import { Search, RefreshCw } from 'lucide-react'
import { Button } from '../../../shared/components/ui/button'
import { Input } from '../../../shared/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../shared/components/ui/select'
import { Switch } from '../../../shared/components/ui/switch'
import { Label } from '../../../shared/components/ui/label'
import { Card, CardContent } from '../../../shared/components/ui/card'
import { cn } from '../../../shared/lib/utils'

interface LogSearchFilterProps {
  searchQuery: string
  onSearchChange: (value: string) => void
  statusFilter: string
  onStatusChange: (value: string) => void
  requestCategoryFilter: string
  onRequestCategoryChange: (value: string) => void
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
  requestCategoryFilter,
  onRequestCategoryChange,
  clientTypeFilter,
  onClientTypeChange,
  clientTypeOptions,
  timeRange,
  onTimeRangeChange,
  onRefresh,
  isRefreshing = false,
  autoRefresh = false,
  autoRefreshInterval = 10,
  onAutoRefreshChange,
  onAutoRefreshIntervalChange,
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

          <div className="flex items-center gap-2 flex-wrap">
            <Select value={statusFilter} onValueChange={onStatusChange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="状态筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="success">成功</SelectItem>
                <SelectItem value="failure">失败</SelectItem>
                <SelectItem value="pending">请求中</SelectItem>
              </SelectContent>
            </Select>

            <Select value={clientTypeFilter} onValueChange={onClientTypeChange}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="客户端筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部客户端</SelectItem>
                {clientTypeOptions &&
                  Object.entries(clientTypeOptions)
                    .filter(([type]) => type !== 'unknown')
                    .map(([type, name]) => (
                      <SelectItem key={type} value={type}>
                        {name}
                      </SelectItem>
                    ))}
              </SelectContent>
            </Select>

            <Select value={requestCategoryFilter} onValueChange={onRequestCategoryChange}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="类型筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="embedding">Embedding</SelectItem>
                <SelectItem value="chat_text">Text</SelectItem>
                <SelectItem value="chat_image">Image</SelectItem>
                <SelectItem value="chat_video">Video</SelectItem>
                <SelectItem value="chat_audio">Audio</SelectItem>
                <SelectItem value="other">Other</SelectItem>
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

            <div className="flex items-center gap-2 border rounded-md px-3 py-1.5">
              <Switch
                id="auto-refresh"
                checked={autoRefresh}
                onCheckedChange={onAutoRefreshChange}
              />
              <Label htmlFor="auto-refresh" className="text-sm cursor-pointer whitespace-nowrap">
                自动刷新
              </Label>
              {autoRefresh && onAutoRefreshIntervalChange && (
                <Select
                  value={String(autoRefreshInterval)}
                  onValueChange={(v) => onAutoRefreshIntervalChange(Number(v))}
                >
                  <SelectTrigger className="w-[80px] h-7 text-xs border-0 shadow-none px-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 秒</SelectItem>
                    <SelectItem value="10">10 秒</SelectItem>
                    <SelectItem value="30">30 秒</SelectItem>
                    <SelectItem value="60">60 秒</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

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
