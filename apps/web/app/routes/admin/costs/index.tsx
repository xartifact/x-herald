import { useMemo, useState, useCallback } from 'react'
import { DollarSign, RefreshCw } from 'lucide-react'

import {
  Button,
  Card,
  CardContent,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@xartifact/x-llm-gateway-ui'
import {
  useCostSummary,
  useCostByKey,
  useCostByProvider,
  useCostByModel,
} from '../../../hooks/costs'
import { CostDateFilter, CostSummaryCards, CostBreakdownTable } from '@xartifact/x-llm-gateway-ui'
import type { DateRangeFilter } from '@xartifact/x-llm-gateway-ui'

function buildQueryParams(filter: DateRangeFilter): { startDate?: string; endDate?: string } {
  const params: { startDate?: string; endDate?: string } = {}
  if (filter.startDate) params.startDate = filter.startDate
  if (filter.endDate) params.endDate = filter.endDate
  return params
}

export function CostsPage() {
  const [filter, setFilter] = useState<DateRangeFilter>({
    preset: '7d',
  })

  const queryParams = useMemo(() => buildQueryParams(filter), [filter])

  const { data: summaryData, refetch: refetchSummary } = useCostSummary(queryParams)
  const {
    data: byKeyData,
    isLoading: byKeyLoading,
    refetch: refetchByKey,
  } = useCostByKey(queryParams)
  const {
    data: byProviderData,
    isLoading: byProviderLoading,
    refetch: refetchByProvider,
  } = useCostByProvider(queryParams)
  const {
    data: byModelData,
    isLoading: byModelLoading,
    refetch: refetchByModel,
  } = useCostByModel(queryParams)

  const summary = summaryData ?? undefined
  const byKey = byKeyData ?? []
  const byProvider = byProviderData ?? []
  const byModel = byModelData ?? []

  const totalCost = summary?.totalCost ?? 0

  const handleRefresh = useCallback(() => {
    refetchSummary()
    refetchByKey()
    refetchByProvider()
    refetchByModel()
  }, [refetchSummary, refetchByKey, refetchByProvider, refetchByModel])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            费用统计
          </h2>
          <p className="text-sm text-muted-foreground mt-1">查看和分析 API 调用费用明细</p>
        </div>
        <div className="flex items-center gap-2">
          <CostDateFilter value={filter} onChange={setFilter} />
          <Button variant="outline" size="icon" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <CostSummaryCards summary={summary} />

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="by-key" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="by-key">按密钥</TabsTrigger>
              <TabsTrigger value="by-provider">按供应商</TabsTrigger>
              <TabsTrigger value="by-model">按模型</TabsTrigger>
            </TabsList>

            <TabsContent value="by-key">
              <CostBreakdownTable items={byKey} totalCost={totalCost} isLoading={byKeyLoading} />
            </TabsContent>

            <TabsContent value="by-provider">
              <CostBreakdownTable
                items={byProvider}
                totalCost={totalCost}
                isLoading={byProviderLoading}
              />
            </TabsContent>

            <TabsContent value="by-model">
              <CostBreakdownTable
                items={byModel}
                totalCost={totalCost}
                isLoading={byModelLoading}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
