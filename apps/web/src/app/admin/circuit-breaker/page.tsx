'use client'

import { useState } from 'react'

import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'

import { Button } from '@x-llm-gateway/ui'

import { CircuitBreakerEventHistory } from './circuit-breaker-event-history'
import { useCircuitBreakerEvents, useCircuitBreakerStats, useManualAction, useRealtimeStates } from './circuit-breaker-hooks'
import { CircuitBreakerRealtimeTable } from './circuit-breaker-realtime-table'
import { CircuitBreakerStats } from './circuit-breaker-stats'

export default function CircuitBreakerPage() {
  const queryClient = useQueryClient()
  const [eventFilter, setEventFilter] = useState('all')

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useCircuitBreakerStats()
  const { data: realtimeData } = useRealtimeStates()
  const { data: eventsData, isLoading: eventsLoading, refetch: refetchEvents } = useCircuitBreakerEvents(eventFilter)

  const resetMutation = useManualAction('reset')
  const tripMutation = useManualAction('trip')

  const handleRefresh = () => {
    refetchStats()
    refetchEvents()
    queryClient.invalidateQueries({ queryKey: ['circuit-breaker', 'realtime-states'] })
  }

  const handleManualAction = (instanceId: string, action: 'reset' | 'trip') => {
    const confirmed = window.confirm(
      action === 'reset'
        ? `确认重置熔断？实例 ${instanceId.slice(0, 12)}... 将恢复正常路由。`
        : `确认强制熔断？实例 ${instanceId.slice(0, 12)}... 将被排除在路由之外。`
    )
    if (!confirmed) return
    if (action === 'reset') resetMutation.mutate(instanceId)
    else tripMutation.mutate(instanceId)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">熔断记录</h2>
          <p className="text-muted-foreground">模型实例熔断状态与事件历史</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="mr-2 h-4 w-4" />刷新
        </Button>
      </div>

      <CircuitBreakerRealtimeTable
        instances={realtimeData?.instances ?? []}
        onAction={handleManualAction}
        isPending={resetMutation.isPending || tripMutation.isPending}
      />

      <CircuitBreakerStats stats={stats} isLoading={statsLoading} />

      <CircuitBreakerEventHistory
        events={eventsData?.events ?? []}
        isLoading={eventsLoading}
        filter={eventFilter}
        onFilterChange={setEventFilter}
      />
    </div>
  )
}
