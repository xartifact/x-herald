import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  get,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  LogStatsCards,
  useLogStats,
  useLogStorage,
  logKeys,
} from '@x-llm-gateway/ui'

function getTimeRange(range: string): Record<string, string> {
  if (range === 'all') return {}

  const now = new Date()
  const startDate = new Date()

  switch (range) {
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
    default:
      return {}
  }

  return { startDate: startDate.toISOString() }
}

export function DashboardPage() {
  const queryClient = useQueryClient()

  const { data: providersRes } = useQuery({
    queryKey: ['providers'],
    queryFn: () => get<{ data: unknown[] }>('/api/providers', { extractData: false }),
  })
  const { data: modelGroupsRes } = useQuery({
    queryKey: ['modelGroups'],
    queryFn: () => get<{ data: unknown[] }>('/api/model-groups', { extractData: false }),
  })
  const { data: keysRes } = useQuery({
    queryKey: ['keys'],
    queryFn: () => get<{ data: unknown[] }>('/api/keys', { extractData: false }),
  })

  const [timeRange, setTimeRange] = useState('24h')

  const timeParams = useMemo(() => getTimeRange(timeRange), [timeRange])

  const { data: statsData, isFetching } = useLogStats(timeParams)
  const { data: storageData } = useLogStorage()

  const providerCount = (providersRes as { data?: unknown[] } | undefined)?.data?.length ?? 0
  const modelGroupCount = (modelGroupsRes as { data?: unknown[] } | undefined)?.data?.length ?? 0
  const keyCount = (keysRes as { data?: unknown[] } | undefined)?.data?.length ?? 0

  const stats = statsData?.data?.overview
  const clientStats = statsData?.data?.clientStats
  const storage = storageData?.data

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: logKeys.stats() })
    queryClient.invalidateQueries({ queryKey: logKeys.storage() })
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">仪表盘</h1>

      {/* 资源计数卡片 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>提供商</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold" id="provider-count">{providerCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>模型组</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold" id="model-group-count">{modelGroupCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>API Keys</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold" id="key-count">{keyCount}</p></CardContent>
        </Card>
      </div>

      {/* 统计概览 */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">概览</h2>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
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
            onClick={handleRefresh}
            disabled={isFetching}
            title="刷新数据"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <LogStatsCards stats={stats} storage={storage} clientStats={clientStats} />

      {/* 快速导航 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <a
          href="/admin/providers"
          className="block rounded-lg border bg-card p-5 hover:shadow-md transition"
        >
          <h3 className="text-base font-medium">提供商管理</h3>
          <p className="mt-1 text-sm text-muted-foreground">添加 OpenAI、Anthropic 等供应商</p>
        </a>
        <a
          href="/admin/model-groups"
          className="block rounded-lg border bg-card p-5 hover:shadow-md transition"
        >
          <h3 className="text-base font-medium">模型组管理</h3>
          <p className="mt-1 text-sm text-muted-foreground">配置模型组和路由策略</p>
        </a>
        <a
          href="/admin/keys"
          className="block rounded-lg border bg-card p-5 hover:shadow-md transition"
        >
          <h3 className="text-base font-medium">密钥管理</h3>
          <p className="mt-1 text-sm text-muted-foreground">生成和管理虚拟密钥</p>
        </a>
      </div>
    </div>
  )
}
