import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

import type { TimeseriesBaseline, TimeseriesPoint } from '../hooks/use-metrics'
import type { Metric } from './InstancePerfChart'

interface PerfLineChartProps {
  data: { data?: TimeseriesPoint[]; baseline?: TimeseriesBaseline | null } | null | undefined
  isLoading: boolean
  metric: Metric
  summary: unknown
}

function formatY(metric: Metric, v: number): string {
  if (metric === 'ttfb' || metric === 'responseTime') {
    return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`
  }
  if (metric === 'tps') return `${v.toFixed(1)}`
  return `${(v * 100).toFixed(0)}%`
}

export function PerfLineChart({ data, isLoading, metric }: PerfLineChartProps) {
  const baseline = data?.baseline

  const avgKey =
    metric === 'ttfb'
      ? 'ttfbAvg'
      : metric === 'responseTime'
        ? 'latencyAvg'
        : metric === 'tps'
          ? 'tpsAvg'
          : 'successRate'
  const p95Key = metric === 'ttfb' ? 'ttfbP95' : metric === 'responseTime' ? 'latencyP95' : 'tpsP50'
  const baselineMetricKey =
    metric === 'ttfb'
      ? 'ttfbP95'
      : metric === 'responseTime'
        ? 'latencyP95'
        : metric === 'tps'
          ? 'tpsAvg'
          : 'successRate'

  const chartData = (data?.data ?? []).map((p) => ({
    time: new Date(p.bucketStart).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
    avg: p[avgKey as keyof typeof p],
    p95: p[p95Key as keyof typeof p],
  }))

  const baselineValue = baseline ? baseline[baselineMetricKey] : null
  const baselineNumeric = baselineValue != null ? Number(baselineValue) : null

  if (isLoading)
    return (
      <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
        加载中…
      </div>
    )
  if (chartData.length === 0)
    return (
      <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
        该时段暂无数据
      </div>
    )

  return (
    <>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="time" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis
            tickFormatter={(v) => formatY(metric, Number(v))}
            tick={{ fontSize: 11 }}
            width={55}
          />
          <Tooltip
            formatter={(value) => [formatY(metric, Number(value)), '']}
            labelStyle={{ fontSize: 12 }}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {metric !== 'successRate' && (
            <Line
              type="monotone"
              name="P95"
              dataKey="p95"
              stroke="#f59e0b"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              dot={false}
              connectNulls
            />
          )}
          <Line
            type="monotone"
            name="均值"
            dataKey="avg"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          {baselineNumeric != null && (
            <ReferenceLine
              y={baselineNumeric}
              stroke="#10b981"
              strokeDasharray="6 3"
              label={{ value: '基线', fontSize: 10, fill: '#10b981', position: 'right' }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      {baselineNumeric == null && chartData.length > 0 && (
        <p className="text-xs text-muted-foreground/60 mt-1 text-center">
          服务运行满 6 小时后自动生成基线
        </p>
      )}
    </>
  )
}
