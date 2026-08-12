import { useMemo, useState } from 'react'

import { RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-react'

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatCard,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TabsList,
  TabsTrigger,
} from '@xartifact/x-herald-ui'
import type { IntentSource } from '../../../hooks/intent-logs'
import { useIntentLogs, useIntentLogStats, type IntentLogRow } from '../../../hooks/intent-logs'

import { IntentLogDetailDrawer } from './intent-log-detail-drawer'

const SKELETON_ROW_KEYS = ['skel-row-0', 'skel-row-1', 'skel-row-2', 'skel-row-3', 'skel-row-4']
const SKELETON_CELL_KEYS = [
  'skel-c0',
  'skel-c1',
  'skel-c2',
  'skel-c3',
  'skel-c4',
  'skel-c5',
  'skel-c6',
  'skel-c7',
]

const INTENT_SOURCE_LABELS: Record<
  IntentSource,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  classifier: { label: '分类器 LLM', variant: 'default' },
  fallback: { label: '分类器→default', variant: 'destructive' },
  default: { label: '无分类器', variant: 'outline' },
  model_name: { label: '模型名匹配', variant: 'secondary' },
  capability: { label: '能力匹配', variant: 'secondary' },
  agent_directive: { label: 'agent 指令', variant: 'outline' },
}

const TIME_RANGES: Array<{ value: string; label: string; days: number | null }> = [
  { value: '1h', label: '最近 1 小时', days: null },
  { value: '24h', label: '最近 24 小时', days: 1 },
  { value: '7d', label: '最近 7 天', days: 7 },
  { value: '30d', label: '最近 30 天', days: 30 },
  { value: 'all', label: '全部', days: null },
]

const INTENT_SOURCES: Array<{ value: string; label: string }> = [
  { value: 'all', label: '全部来源' },
  { value: 'classifier', label: '分类器 LLM' },
  { value: 'fallback', label: '分类器→default' },
  { value: 'default', label: '无分类器' },
  { value: 'model_name', label: '模型名匹配' },
  { value: 'capability', label: '能力匹配' },
]

function timeRangeToParams(range: string): { startDate?: string } {
  if (range === 'all' || range === '1h') return {}
  const days = TIME_RANGES.find((r) => r.value === range)?.days
  if (!days) return {}
  const start = new Date()
  start.setDate(start.getDate() - days)
  start.setSeconds(0, 0)
  return { startDate: start.toISOString() }
}

function formatLatency(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms.toFixed(2).replace(/\.00$/, '')}ms`
  return `${(ms / 1000).toFixed(2).replace(/\.00$/, '')}s`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

interface IntentLogsTabProps {
  onNavigateToPrompts?: () => void
}

export function IntentLogsTab({ onNavigateToPrompts }: IntentLogsTabProps) {
  const [timeRange, setTimeRange] = useState('24h')
  const [intentSource, setIntentSource] = useState('all')
  const [intentNameQuery, setIntentNameQuery] = useState('')
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [selectedLog, setSelectedLog] = useState<IntentLogRow | null>(null)
  const [pageSize] = useState(50)

  const filters = useMemo(() => {
    const f: Record<string, string | number | undefined> = { pageSize }
    const timeParams = timeRangeToParams(timeRange)
    Object.assign(f, timeParams)
    if (intentSource !== 'all') f.intentSource = intentSource
    if (intentNameQuery.trim()) f.intentName = intentNameQuery.trim()
    if (cursor) f.cursor = cursor
    return f
  }, [timeRange, intentSource, intentNameQuery, cursor, pageSize])

  const { data: logsResp, isLoading, isFetching, refetch } = useIntentLogs(filters)
  const { data: statsResp, isLoading: statsLoading } = useIntentLogStats(
    timeRangeToParams(timeRange),
  )

  const logs = (logsResp?.data ?? []) as IntentLogRow[]
  const hasMore = logsResp?.hasMore ?? false
  const nextCursor = logsResp?.nextCursor

  const stats = statsResp?.data

  function handleApplyFilters() {
    setCursor(undefined)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="意图分类记录"
        description="每次代理请求经过意图路由时记录一次；用于诊断分类器是否正常工作、分类是否合理"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard title="总分类次数" value={stats?.total} loading={statsLoading} />
        <StatCard
          title="分类器平均耗时"
          value={
            stats?.avgClassifierLatencyMs == null
              ? '—'
              : formatLatency(stats.avgClassifierLatencyMs)
          }
          loading={statsLoading}
        />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">按来源</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            {(stats?.byIntentSource ?? [])
              .slice(0, 3)
              .map((s: { intentSource: IntentSource; count: number }) => (
                <div key={s.intentSource} className="flex justify-between">
                  <span className="text-muted-foreground">
                    {INTENT_SOURCE_LABELS[s.intentSource].label}
                  </span>
                  <span className="font-mono">{s.count}</span>
                </div>
              ))}
            {(stats?.byIntentSource ?? []).length === 0 && (
              <span className="text-muted-foreground">—</span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">按类别</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            {(stats?.byIntentName ?? [])
              .slice(0, 3)
              .map((s: { intentName: string; count: number }) => (
                <div key={s.intentName} className="flex justify-between">
                  <span className="text-muted-foreground font-mono">{s.intentName}</span>
                  <span className="font-mono">{s.count}</span>
                </div>
              ))}
            {(stats?.byIntentName ?? []).length === 0 && (
              <span className="text-muted-foreground">—</span>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="md:col-span-1">
              <label className="text-xs text-muted-foreground">时间范围</label>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">分类来源</label>
              <Select value={intentSource} onValueChange={setIntentSource}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTENT_SOURCES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">类别名（模糊匹配）</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="coding / general / ..."
                    value={intentNameQuery}
                    onChange={(e) => setIntentNameQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
                  />
                </div>
                <Button onClick={handleApplyFilters}>应用</Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          共 {logs.length} 条{hasMore ? '（还有更多）' : ''}
        </span>
        {cursor && (
          <Button variant="ghost" size="sm" onClick={() => setCursor(undefined)}>
            <ChevronLeft className="mr-1 h-3 w-3" />
            回到第一页
          </Button>
        )}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>类别</TableHead>
              <TableHead>来源</TableHead>
              <TableHead>耗时</TableHead>
              <TableHead>Prompt</TableHead>
              <TableHead>接入模型</TableHead>
              <TableHead>目标组</TableHead>
              <TableHead>调用方</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              SKELETON_ROW_KEYS.map((rowKey) => (
                <TableRow key={rowKey}>
                  {SKELETON_CELL_KEYS.map((cellKey) => (
                    <TableCell key={cellKey}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  暂无数据
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => {
                const sourceMeta = INTENT_SOURCE_LABELS[log.intentSource]
                return (
                  <TableRow
                    key={log.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedLog(log)}
                  >
                    <TableCell className="font-mono text-xs">{formatTime(log.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={log.intentName === 'default' ? 'destructive' : 'default'}>
                        {log.intentName}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={sourceMeta.variant}>{sourceMeta.label}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatLatency(log.classifierLatencyMs)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.classifierPromptVersion != null
                        ? `v${log.classifierPromptVersion}`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-xs">{log.accessModelName ?? '—'}</TableCell>
                    <TableCell className="text-xs">{log.targetGroupName ?? '—'}</TableCell>
                    <TableCell className="text-xs">{log.virtualKeyName ?? '—'}</TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {hasMore && nextCursor && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setCursor(nextCursor)}>
            <ChevronRight className="mr-1 h-4 w-4" />
            加载下一页
          </Button>
        </div>
      )}

      <IntentLogDetailDrawer
        log={selectedLog}
        open={!!selectedLog}
        onOpenChange={(o) => !o && setSelectedLog(null)}
        onNavigateToPrompts={onNavigateToPrompts}
      />
    </div>
  )
}

export { TabsList, TabsTrigger }
