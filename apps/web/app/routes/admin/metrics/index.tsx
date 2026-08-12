import {
  MetricsSummaryCards,
  InstancePerfTable,
  ProviderQualityTable,
  InstancePerfChart,
  PageHeader,
} from '@xartifact/x-herald-ui'
import { useMetricsSummary, useInstancesSummary } from '../../../hooks/metrics'

export function MetricsPage() {
  const { data: summary, isLoading } = useMetricsSummary()
  const { data: instancesData } = useInstancesSummary()

  const firstInstance = instancesData?.data?.[0]

  return (
    <div className="space-y-6">
      <PageHeader
        title="性能指标"
        description="实例级 TTFB / 总耗时 / TPS 时序追踪，每5分钟聚合，自动基线对比"
      />

      <MetricsSummaryCards summary={summary} isLoading={isLoading} />

      {/* 实例性能图表 - 默认显示第一个实例 */}
      {firstInstance && (
        <InstancePerfChart
          instanceId={firstInstance.instanceId}
          instanceName={firstInstance.instanceName || firstInstance.instanceId}
        />
      )}

      <InstancePerfTable />
      <ProviderQualityTable />
    </div>
  )
}
