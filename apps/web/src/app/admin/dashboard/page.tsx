'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LogStatsCards } from '@/components/log-stats-cards'
import { useLogStats, useLogStorage, logKeys } from '@/hooks/use-logs'

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

export default function AdminDashboard() {
  const queryClient = useQueryClient()
  const [timeRange, setTimeRange] = useState('24h')

  const timeParams = useMemo(() => getTimeRange(timeRange), [timeRange])

  const { data: statsData, isFetching } = useLogStats(timeParams)
  const { data: storageData } = useLogStorage()

  const stats = statsData?.data?.overview
  const clientStats = statsData?.data?.clientStats
  const storage = storageData?.data

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: logKeys.stats() })
    queryClient.invalidateQueries({ queryKey: logKeys.storage() })
  }

  return (
    <div className="space-y-6">
      {/* 统计概览 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">概览</h2>
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
        <Link
          href="/admin/providers"
          className="block rounded-lg border bg-card p-5 hover:shadow-md transition"
        >
          <h3 className="text-base font-medium">供应商管理</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            添加 OpenAI、Anthropic 等供应商
          </p>
        </Link>

        <Link
          href="/admin/model-groups"
          className="block rounded-lg border bg-card p-5 hover:shadow-md transition"
        >
          <h3 className="text-base font-medium">模型组管理</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            配置模型组和路由策略
          </p>
        </Link>

        <Link
          href="/admin/keys"
          className="block rounded-lg border bg-card p-5 hover:shadow-md transition"
        >
          <h3 className="text-base font-medium">密钥管理</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            生成和管理虚拟密钥
          </p>
        </Link>
      </div>
    </div>
  )
}
