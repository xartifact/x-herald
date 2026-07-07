import { Activity, ArrowUpDown, BarChart3, Clock, Hash, RefreshCw } from 'lucide-react'

import { cn } from '../../../shared/lib/utils'
import {
  Button,
  Card,
  CardContent,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../shared/components/ui'

export type SortField =
  | 'requestCount'
  | 'lastRequestAt'
  | 'totalTokens'
  | 'avgResponseTime'
  | 'successRate'
export type SortOrder = 'desc' | 'asc'

export interface FilterConfig {
  timeRange: string
  search: string
  sortField: SortField
  sortOrder: SortOrder
}

interface ClientModelFilterProps {
  config: FilterConfig
  isLoading: boolean
  onConfigChange: (config: FilterConfig) => void
  onRefresh: () => void
}

export function ClientModelFilter({
  config,
  isLoading,
  onConfigChange,
  onRefresh,
}: ClientModelFilterProps) {
  const handleSort = (field: SortField) => {
    if (config.sortField === field) {
      onConfigChange({ ...config, sortOrder: config.sortOrder === 'desc' ? 'asc' : 'desc' })
    } else {
      onConfigChange({ ...config, sortField: field, sortOrder: 'desc' })
    }
  }

  const SORT_BUTTONS: Array<{ field: SortField; icon: typeof Hash; label: string }> = [
    { field: 'requestCount', icon: Hash, label: '请求数' },
    { field: 'lastRequestAt', icon: Clock, label: '最近请求' },
    { field: 'totalTokens', icon: Activity, label: 'Token消耗' },
    { field: 'avgResponseTime', icon: BarChart3, label: '平均响应时间' },
    { field: 'successRate', icon: Activity, label: '成功率' },
  ]

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
              <div className="relative w-full md:w-64">
                <Input
                  placeholder="搜索模型名称..."
                  value={config.search}
                  onChange={(e) => onConfigChange({ ...config, search: e.target.value })}
                  className="h-9"
                />
              </div>
              <Select
                value={config.timeRange}
                onValueChange={(v) => onConfigChange({ ...config, timeRange: v })}
              >
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
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
              <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
              刷新
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {SORT_BUTTONS.map(({ field, icon: Icon, label }) => (
          <Button
            key={field}
            variant={config.sortField === field ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSort(field)}
            className="h-8"
          >
            <Icon className="mr-1 h-4 w-4" />
            {label}
            {config.sortField === field && (
              <ArrowUpDown
                className={cn('ml-1 h-3 w-3', config.sortOrder === 'asc' && 'rotate-180')}
              />
            )}
          </Button>
        ))}
      </div>
    </div>
  )
}
