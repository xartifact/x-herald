'use client';

import { useState } from 'react';

import { format } from 'date-fns';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button } from '@/ui/button';

import { useInstanceTimeseries } from '../hooks/use-metrics';

type Period = '1h' | '6h' | '24h' | '7d';
type Metric = 'ttfb' | 'latency' | 'tps' | 'successRate';

const PERIODS: { value: Period; label: string }[] = [
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
];

const METRICS: { value: Metric; label: string }[] = [
  { value: 'ttfb', label: 'TTFB' },
  { value: 'latency', label: '延迟' },
  { value: 'tps', label: 'TPS' },
  { value: 'successRate', label: '成功率' },
];

function formatTime(ts: string, period: Period): string {
  const d = new Date(ts);
  if (period === '7d') return format(d, 'MM/dd HH:00');
  return format(d, 'HH:mm');
}

interface Props {
  instanceId: string;
  instanceName: string;
}

export function InstancePerfChart({ instanceId, instanceName }: Props) {
  const [period, setPeriod] = useState<Period>('6h');
  const [metric, setMetric] = useState<Metric>('ttfb');
  const { data, isLoading } = useInstanceTimeseries(instanceId, period);

  const points = data?.data ?? [];
  const baseline = data?.baseline;

  const chartData = points.map((p) => ({
    time: formatTime(p.bucketStart, period),
    avg: metric === 'ttfb' ? p.ttfbAvg
      : metric === 'latency' ? p.latencyAvg
      : metric === 'tps' ? p.tpsAvg
      : p.successRate != null ? p.successRate * 100 : null,
    p95: metric === 'ttfb' ? p.ttfbP95
      : metric === 'latency' ? p.latencyP95
      : metric === 'tps' ? p.tpsP50
      : null,
  }));

  const baselineValue = baseline
    ? metric === 'ttfb' ? baseline.ttfbP95
      : metric === 'latency' ? baseline.latencyP95
      : metric === 'tps' ? baseline.tpsAvg
      : baseline.successRate != null ? baseline.successRate * 100 : null
    : null;

  const yLabel = metric === 'ttfb' || metric === 'latency' ? 'ms'
    : metric === 'tps' ? 't/s' : '%';

  const formatY = (v: number) => {
    if (metric === 'ttfb' || metric === 'latency') {
      return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`;
    }
    return `${v.toFixed(1)}${yLabel}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{instanceName}</span>
        <div className="flex gap-2">
          <div className="flex gap-1">
            {METRICS.map((m) => (
              <Button
                key={m.value}
                variant={metric === m.value ? 'default' : 'ghost'}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setMetric(m.value)}
              >
                {m.label}
              </Button>
            ))}
          </div>
          <div className="flex gap-1 border-l pl-2">
            {PERIODS.map((p) => (
              <Button
                key={p.value}
                variant={period === p.value ? 'default' : 'ghost'}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setPeriod(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
          加载中…
        </div>
      ) : chartData.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
          该时段暂无数据
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis tickFormatter={formatY} tick={{ fontSize: 11 }} width={55} />
            <Tooltip
              formatter={(value) => [formatY(Number(value)), '']}
              labelStyle={{ fontSize: 12 }}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="avg"
              name="均值"
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            {metric !== 'successRate' && (
              <Line
                type="monotone"
                dataKey="p95"
                name="P95"
                stroke="#f59e0b"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                dot={false}
                connectNulls
              />
            )}
            {baselineValue != null && (
              <ReferenceLine
                y={baselineValue}
                stroke="#10b981"
                strokeDasharray="6 3"
                label={{ value: '基线', fontSize: 10, fill: '#10b981', position: 'right' }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
      {baselineValue == null && chartData.length > 0 && (
        <p className="text-xs text-muted-foreground/60 mt-1 text-center">
          服务运行满 6 小时后自动生成基线
        </p>
      )}
    </div>
  );
}
