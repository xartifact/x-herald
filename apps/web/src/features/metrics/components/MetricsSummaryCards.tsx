import { Activity, AlertTriangle, Clock, Zap } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card';

import type { MetricsSummary } from '../hooks/use-metrics';

interface Props {
  summary: MetricsSummary | undefined;
  isLoading: boolean;
}

function fmt(v: number | null | undefined, unit = '', decimals = 0): string {
  if (v == null) return '—';
  return `${v.toFixed(decimals)}${unit}`;
}

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

export function MetricsSummaryCards({ summary, isLoading }: Props) {
  const s = summary?.recentHour;
  const anomaly = summary?.anomalyCount ?? 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">近1小时请求</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {isLoading ? '—' : (s?.totalRequests ?? 0).toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            今日 {(summary?.daily.totalRequests ?? 0).toLocaleString()} 次
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">成功率</CardTitle>
          <Zap className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${
            s?.avgSuccessRate == null ? '' :
            s.avgSuccessRate >= 0.95 ? 'text-green-600' :
            s.avgSuccessRate >= 0.8 ? 'text-yellow-600' : 'text-red-600'
          }`}>
            {isLoading ? '—' : fmt(s?.avgSuccessRate != null ? s.avgSuccessRate * 100 : null, '%', 1)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {s?.activeInstances ?? 0} 个实例活跃
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">TTFB P95</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${
            s?.avgTtfbP95 == null ? '' :
            s.avgTtfbP95 < 3000 ? 'text-green-600' :
            s.avgTtfbP95 < 10000 ? 'text-yellow-600' : 'text-red-600'
          }`}>
            {isLoading ? '—' : fmtMs(s?.avgTtfbP95)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">各实例均值</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">异常实例</CardTitle>
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${anomaly > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {isLoading ? '—' : anomaly}
          </div>
          <p className="text-xs text-muted-foreground mt-1">TTFB &gt; 2× 基线</p>
        </CardContent>
      </Card>
    </div>
  );
}
