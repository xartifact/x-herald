'use client';

import { useState } from 'react';

import { RefreshCw } from 'lucide-react';

import { Button } from '../../../shared/components/ui';

import { useInstanceTimeseries, useMetricsSummary } from '../hooks/use-metrics';
import { PerfLineChart } from './PerfLineChart';

const METRICS = [
  { value: 'ttfb', label: 'TTFB' },
  { value: 'responseTime', label: '总耗时' },
  { value: 'tps', label: 'TPS' },
  { value: 'successRate', label: '成功率' },
] as const;

const PERIODS = [
  { value: '1h', label: '1小时' },
  { value: '6h', label: '6小时' },
  { value: '24h', label: '24小时' },
] as const;

export type Metric = typeof METRICS[number]['value'];

interface InstancePerfChartProps {
  instanceId: string;
  instanceName: string;
  defaultPeriod?: string;
}

export function InstancePerfChart({ instanceId, defaultPeriod = '6h' }: InstancePerfChartProps) {
  const [period, setPeriod] = useState(defaultPeriod);
  const [metric, setMetric] = useState<Metric>('ttfb');

  const { data: summary } = useMetricsSummary();
  const { data, isLoading, refetch } = useInstanceTimeseries(instanceId, period);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-1 bg-muted/50 rounded-md p-0.5 text-xs">
          {METRICS.map((m) => (
            <Button key={m.value} variant={metric === m.value ? 'default' : 'ghost'} size="sm" className="h-6 px-2.5" onClick={() => setMetric(m.value)}>
              {m.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-muted/50 rounded-md p-0.5 text-xs">
          {PERIODS.map((p) => (
            <Button key={p.value} variant={period === p.value ? 'default' : 'ghost'} size="sm" className="h-6 px-2.5" onClick={() => setPeriod(p.value)}>
              {p.label}
            </Button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="ml-auto h-6 px-2">
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <PerfLineChart data={data} isLoading={isLoading} metric={metric} summary={summary} />
    </div>
  );
}
