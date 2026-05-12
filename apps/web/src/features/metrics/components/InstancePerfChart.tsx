'use client';

import { useState } from 'react';

import { RefreshCw } from 'lucide-react';

import { Button } from '@/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card';
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
} from 'recharts';

import { useInstanceTimeseries, useMetricsSummary } from '../hooks/use-metrics';

const METRICS = [
  { value: 'ttfb', label: 'TTFB' },
  { value: 'responseTime', label: '总耗时' },
  { value: 'tps', label: 'TPS' },
  { value: 'successRate', label: '成功率' },
] as const;

type Metric = typeof METRICS[number]['value'];

interface InstancePerfChartProps {
  instanceId: string;
  instanceName: string;
  defaultPeriod?: string;
}

export function InstancePerfChart({ instanceId, instanceName, defaultPeriod = '6h' }: InstancePerfChartProps) {
  const [period, setPeriod] = useState(defaultPeriod);
  const [metric, setMetric] = useState<Metric>('ttfb');

  const { data: summary } = useMetricsSummary();
  const { data, isLoading, refetch } = useInstanceTimeseries(instanceId, period);

  const baseline = data?.baseline;

  const chartData = (data?.data ?? []).map((p: { bucketStart: string; ttfbAvg: number | null; ttfbP95: number | null; latencyAvg: number | null; latencyP95: number | null; tpsAvg: number | null; tpsP50: number | null }) => {
    const avgKey = metric === 'ttfb' ? 'ttfbAvg'
      : metric === 'responseTime' ? 'latencyAvg'
      : metric === 'tps' ? 'tpsAvg'
      : 'successRate';

    const p95Key = metric === 'ttfb' ? 'ttfbP95'
      : metric === 'responseTime' ? 'latencyP95'
      : 'tpsP50';

    return {
      time: new Date(p.bucketStart).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
      avg: p[avgKey as keyof typeof p],
      p95: p[p95Key as keyof typeof p],
    };
  });

  const formatY = (v: number): string => {
    if (metric === 'ttfb' || metric === 'responseTime') {
      if (v >= 1000) return `${(v / 1000).toFixed(1)}s`;
      return `${Math.round(v)}ms`;
    }
    if (metric === 'tps') return `${v.toFixed(1)}`;
    return `${(v * 100).toFixed(0)}%`;
  };

  const yLabel = metric === 'ttfb' || metric === 'responseTime' ? 'ms'
    : metric === 'tps' ? 'tokens/s'
    : '%';

  const baselineMetricKey = metric === 'ttfb' ? 'ttfbP95'
    : metric === 'responseTime' ? 'latencyP95'
    : metric === 'tps' ? 'tpsAvg'
    : 'successRate';

  const baselineValue = baseline
    ? baseline[baselineMetricKey as keyof typeof baseline]
    : null;

  const baselineNumeric = baselineValue != null ? Number(baselineValue) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-1 bg-muted/50 rounded-md p-0.5 text-xs">
          {METRICS.map((m) => (
            <Button
              key={m.value}
              variant={metric === m.value ? 'default' : 'ghost'}
              size="sm"
              className="h-6 px-2.5"
              onClick={() => setMetric(m.value)}
            >
              {m.label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-muted/50 rounded-md p-0.5 text-xs">
          {[
            { value: '1h', label: '1小时' },
            { value: '6h', label: '6小时' },
            { value: '24h', label: '24小时' },
          ].map((p) => (
            <Button
              key={p.value}
              variant={period === p.value ? 'default' : 'ghost'}
              size="sm"
              className="h-6 px-2.5"
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>

        <Button variant="ghost" size="sm" onClick={() => refetch()} className="ml-auto h-6 px-2">
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
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
        <>
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
      )}
    </div>
  );
}
