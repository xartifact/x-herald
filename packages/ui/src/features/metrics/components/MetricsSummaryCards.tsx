import { Activity, AlertTriangle, Clock, Zap } from 'lucide-react'

import { StatCard } from '../../../shared/components/stat-card'
import type { StatTone } from '../../../shared/components/stat-card'

import type { MetricsSummary } from '../hooks/use-metrics'

interface Props {
  summary: MetricsSummary | undefined
  isLoading: boolean
}

function fmt(v: number | null | undefined, unit = '', decimals = 0): string {
  if (v == null) return '—'
  return `${v.toFixed(decimals)}${unit}`
}

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return '—'
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}

function successRateTone(rate: number | null | undefined): StatTone {
  if (rate == null) return 'default'
  if (rate >= 0.95) return 'success'
  if (rate >= 0.8) return 'warning'
  return 'danger'
}

function ttfbTone(ms: number | null | undefined): StatTone {
  if (ms == null) return 'default'
  if (ms < 3000) return 'success'
  if (ms < 10000) return 'warning'
  return 'danger'
}

export function MetricsSummaryCards({ summary, isLoading }: Props) {
  const s = summary?.recentHour
  const anomaly = summary?.anomalyCount ?? 0

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="近1小时请求"
        icon={<Activity className="h-4 w-4" />}
        value={(s?.totalRequests ?? 0).toLocaleString()}
        sub={`今日 ${(summary?.daily.totalRequests ?? 0).toLocaleString()} 次`}
        loading={isLoading}
      />
      <StatCard
        title="成功率"
        icon={<Zap className="h-4 w-4" />}
        value={fmt(s?.avgSuccessRate != null ? s.avgSuccessRate * 100 : null, '%', 1)}
        tone={successRateTone(s?.avgSuccessRate)}
        sub={`${s?.activeInstances ?? 0} 个实例活跃`}
        loading={isLoading}
      />
      <StatCard
        title="TTFB P95"
        icon={<Clock className="h-4 w-4" />}
        value={fmtMs(s?.avgTtfbP95)}
        tone={ttfbTone(s?.avgTtfbP95)}
        sub="各实例均值"
        loading={isLoading}
      />
      <StatCard
        title="异常实例"
        icon={<AlertTriangle className="h-4 w-4" />}
        value={String(anomaly)}
        tone={anomaly > 0 ? 'danger' : 'success'}
        sub="TTFB &gt; 2× 基线"
        loading={isLoading}
      />
    </div>
  )
}
