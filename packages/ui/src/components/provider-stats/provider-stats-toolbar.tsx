import { Activity, ArrowUpDown, BarChart3, Clock, Hash, RefreshCw } from 'lucide-react'

import { cn } from '../../lib/utils'
import { Button, Card, CardContent, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui'

export type SortField = 'avgResponseTime' | 'requestCount' | 'successRate' | 'p95ResponseTime'
export type SortOrder = 'asc' | 'desc'

export interface ProviderFilterState {
  sortField: SortField
  sortOrder: SortOrder
  timeRange: string
}

interface ProviderStatsToolbarProps {
  filter: ProviderFilterState
  isLoading: boolean
  onFilterChange: (filter: ProviderFilterState) => void
  onRefresh: () => void
}

const SORT_BUTTONS: Array<{ field: SortField; icon: typeof Clock; label: string }> = [
  { field: 'avgResponseTime', icon: Clock, label: '平均响应时间' },
  { field: 'p95ResponseTime', icon: BarChart3, label: 'P95 响应时间' },
  { field: 'successRate', icon: Activity, label: '成功率' },
  { field: 'requestCount', icon: Hash, label: '请求数' },
]

export function ProviderStatsToolbar({ filter, isLoading, onFilterChange, onRefresh }: ProviderStatsToolbarProps) {
  const handleSort = (field: SortField) => {
    if (filter.sortField === field) {
      onFilterChange({ ...filter, sortOrder: filter.sortOrder === 'asc' ? 'desc' : 'asc' })
    } else {
      onFilterChange({ ...filter, sortField: field, sortOrder: field === 'successRate' ? 'desc' : 'asc' })
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {SORT_BUTTONS.map(({ field, icon: Icon, label }) => (
              <Button
                key={field}
                variant={filter.sortField === field ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSort(field)}
                className="h-8"
              >
                <Icon className="mr-1 h-4 w-4" />{label}
                {filter.sortField === field && (
                  <ArrowUpDown className={cn('ml-1 h-3 w-3', filter.sortOrder === 'desc' && 'rotate-180')} />
                )}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Select value={filter.timeRange} onValueChange={(v) => onFilterChange({ ...filter, timeRange: v })}>
              <SelectTrigger className="w-32 h-9">
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
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
              <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />刷新
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
