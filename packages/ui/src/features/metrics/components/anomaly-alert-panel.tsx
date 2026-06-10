'use client'

import { useState } from 'react'

import { AlertTriangle, Bell, CheckCircle2, RefreshCw, Search, ShieldAlert } from 'lucide-react'

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/components/ui'

import {
  useAnomalyEvents,
  useDetectAnomalies,
  useResolveAnomaly,
} from '../hooks/use-metrics'

const TYPE_LABELS: Record<string, string> = {
  slow_request: '慢请求',
  high_error_rate: '高错误率',
  high_token_usage: '高Token用量',
  provider_down: '供应商宕机',
}

const SEVERITY_CONFIG = {
  warning: {
    label: '警告',
    badgeClass: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    icon: AlertTriangle,
  },
  critical: {
    label: '严重',
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
    icon: ShieldAlert,
  },
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMins < 1) return '刚刚'
  if (diffMins < 60) return `${diffMins}分钟前`
  if (diffHours < 24) return `${diffHours}小时前`
  return `${diffDays}天前`
}

interface AnomalyRowProps {
  event: {
    id: string
    type: string
    severity: 'warning' | 'critical'
    providerName: string | null
    modelName: string | null
    instanceId: string | null
    description: string | null
    createdAt: string
  }
  onResolve: (id: string) => void
  isResolving: boolean
}

function AnomalyRow({ event, onResolve, isResolving }: AnomalyRowProps) {
  const severityConfig = SEVERITY_CONFIG[event.severity]
  const Icon = severityConfig.icon

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${event.severity === 'critical' ? 'text-red-500' : 'text-yellow-500'}`} />
          <Badge variant="outline" className={severityConfig.badgeClass}>
            {severityConfig.label}
          </Badge>
        </div>
      </TableCell>
      <TableCell className="font-medium">{TYPE_LABELS[event.type] ?? event.type}</TableCell>
      <TableCell className="text-muted-foreground">
        {event.providerName ?? '—'}
        {event.modelName && (
          <span className="text-xs ml-1">({event.modelName})</span>
        )}
      </TableCell>
      <TableCell className="max-w-[300px] truncate" title={event.description ?? ''}>
        {event.description ?? '—'}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {formatTimeAgo(event.createdAt)}
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onResolve(event.id)}
          disabled={isResolving}
        >
          <CheckCircle2 className="h-4 w-4 mr-1" />
          解决
        </Button>
      </TableCell>
    </TableRow>
  )
}

export function AnomalyAlertPanel() {
  const [showUnresolvedOnly, setShowUnresolvedOnly] = useState(true)
  const { data, isLoading, refetch } = useAnomalyEvents(showUnresolvedOnly)
  const detectMutation = useDetectAnomalies()
  const resolveMutation = useResolveAnomaly()

  const events = data?.data ?? []
  const unresolvedCount = events.filter((e) => !e.resolved).length

  const handleDetect = () => {
    detectMutation.mutate(undefined, {
      onSuccess: (res) => {
        if (res.data.newEvents > 0) {
          refetch()
        }
      },
    })
  }

  const handleResolve = (id: string) => {
    resolveMutation.mutate(id)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            异常告警
            {unresolvedCount > 0 && (
              <Badge variant="destructive" className="ml-1">
                {unresolvedCount}
              </Badge>
            )}
          </CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showUnresolvedOnly ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowUnresolvedOnly(!showUnresolvedOnly)}
          >
            {showUnresolvedOnly ? '仅未解决' : '全部'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDetect}
            disabled={detectMutation.isPending}
          >
            <Search className={`h-4 w-4 mr-1 ${detectMutation.isPending ? 'animate-spin' : ''}`} />
            检测
          </Button>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading && (
          <div className="text-center text-muted-foreground py-8">加载中…</div>
        )}
        {!isLoading && events.length === 0 && (
          <div className="text-center text-muted-foreground py-8 flex flex-col items-center gap-2">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
            <p>暂无异常事件</p>
          </div>
        )}
        {!isLoading && events.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>级别</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>供应商/模型</TableHead>
                <TableHead>描述</TableHead>
                <TableHead>时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <AnomalyRow
                  key={event.id}
                  event={event}
                  onResolve={handleResolve}
                  isResolving={resolveMutation.isPending}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
