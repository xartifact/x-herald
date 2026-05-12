'use client';

import { InstancePerfTable } from '@/features/metrics/components/InstancePerfTable';
import { MetricsSummaryCards } from '@/features/metrics/components/MetricsSummaryCards';
import { ProviderQualityTable } from '@/features/metrics/components/ProviderQualityTable';
import { useMetricsSummary } from '@/features/metrics/hooks/use-metrics';

export default function MetricsPage() {
  const { data: summary, isLoading } = useMetricsSummary();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">性能指标</h1>
        <p className="text-muted-foreground text-sm mt-1">
          实例级 TTFB / 总耗时 / TPS 时序追踪，每5分钟聚合，自动基线对比
        </p>
      </div>

      <MetricsSummaryCards summary={summary} isLoading={isLoading} />
      <InstancePerfTable />
      <ProviderQualityTable />
    </div>
  );
}
