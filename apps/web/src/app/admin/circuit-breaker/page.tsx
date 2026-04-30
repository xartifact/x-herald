'use client'

import { useState } from 'react'

import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle, RefreshCw, ShieldAlert, ShieldCheck, ShieldOff, Zap } from 'lucide-react'

import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/table'

const API_BASE = '/api'

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}` }
}

interface Stats {
  todayOpened: number
  weekOpened: number
  topInstances: Array<{
    instanceId: string
    instanceName: string
    groupName: string
    providerName: string
    openCount: number
    lastOpenedAt: string
  }>
}

interface CBEvent {
  id: string
  instanceId: string
  instanceName: string
  groupName: string
  providerName: string
  event: 'opened' | 'half_open' | 'closed'
  failureCount: number
  openUntil: string | null
  createdAt: string
}

function useCircuitBreakerStats() {
  return useQuery<Stats>({
    queryKey: ['circuit-breaker', 'stats'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/circuit-breaker/stats`, { headers: authHeaders() })
      const json = await res.json()
      return json.data
    },
    refetchInterval: 30_000,
  })
}

function useCircuitBreakerEvents(eventFilter: string) {
  return useQuery<{ events: CBEvent[]; total: number }>({
    queryKey: ['circuit-breaker', 'events', eventFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' })
      if (eventFilter !== 'all') params.set('event', eventFilter)
      const res = await fetch(`${API_BASE}/circuit-breaker/events?${params}`, { headers: authHeaders() })
      const json = await res.json()
      return json.data
    },
    refetchInterval: 30_000,
  })
}

function EventBadge({ event }: { event: CBEvent['event'] }) {
  if (event === 'opened') return (
    <Badge variant="destructive" className="gap-1">
      <ShieldOff className="h-3 w-3" />熔断
    </Badge>
  )
  if (event === 'half_open') return (
    <Badge variant="outline" className="gap-1 border-yellow-400 text-yellow-700">
      <AlertTriangle className="h-3 w-3" />半开
    </Badge>
  )
  return (
    <Badge variant="outline" className="gap-1 border-green-400 text-green-700">
      <CheckCircle className="h-3 w-3" />恢复
    </Badge>
  )
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 60_000) return `${Math.round(diff / 1000)}秒前`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}分钟前`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}小时前`
  return `${Math.round(diff / 86_400_000)}天前`
}

export default function CircuitBreakerPage() {
  const [eventFilter, setEventFilter] = useState('all')
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useCircuitBreakerStats()
  const { data: eventsData, isLoading: eventsLoading, refetch: refetchEvents } = useCircuitBreakerEvents(eventFilter)

  const handleRefresh = () => {
    refetchStats()
    refetchEvents()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">熔断记录</h2>
          <p className="text-muted-foreground">模型实例熔断事件历史与统计</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="mr-2 h-4 w-4" />刷新
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Zap className="h-4 w-4" />今日熔断次数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? '—' : stats?.todayOpened ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />7 天熔断次数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? '—' : stats?.weekOpened ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />触发过熔断的实例
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? '—' : stats?.topInstances.length ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top 实例 */}
      {stats && stats.topInstances.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">高频熔断实例</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>实例</TableHead>
                  <TableHead>模型组</TableHead>
                  <TableHead>供应商</TableHead>
                  <TableHead className="text-right">熔断次数</TableHead>
                  <TableHead className="text-right">最近一次</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.topInstances.map((inst) => (
                  <TableRow key={inst.instanceId}>
                    <TableCell className="font-medium">{inst.instanceName || inst.instanceId.slice(0, 8)}</TableCell>
                    <TableCell className="text-muted-foreground">{inst.groupName}</TableCell>
                    <TableCell className="text-muted-foreground">{inst.providerName}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{inst.openCount}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {relativeTime(inst.lastOpenedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 事件历史 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">事件历史</CardTitle>
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="opened">熔断</SelectItem>
                <SelectItem value="half_open">半开</SelectItem>
                <SelectItem value="closed">恢复</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {eventsLoading ? (
            <div className="p-6 text-sm text-muted-foreground text-center">加载中...</div>
          ) : !eventsData?.events.length ? (
            <div className="p-6 text-sm text-muted-foreground text-center">暂无熔断事件</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>实例</TableHead>
                  <TableHead>模型组</TableHead>
                  <TableHead>供应商</TableHead>
                  <TableHead>事件</TableHead>
                  <TableHead className="text-right">失败次数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventsData.events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {relativeTime(e.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium">{e.instanceName || e.instanceId.slice(0, 8)}</TableCell>
                    <TableCell className="text-muted-foreground">{e.groupName}</TableCell>
                    <TableCell className="text-muted-foreground">{e.providerName}</TableCell>
                    <TableCell><EventBadge event={e.event} /></TableCell>
                    <TableCell className="text-right text-muted-foreground">{e.failureCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
