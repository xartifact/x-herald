import { useState } from 'react'
import {
  CircuitBreakerStatsCards,
  RealtimeStateTable,
  TopInstancesTable,
  EventHistoryTable,
  CircuitBreakerConfirmDialog,
  Button,
  useCircuitBreakerStats,
  useRealtimeStates,
  useCircuitBreakerEvents,
  useManualAction,
} from '@x-llm-gateway/ui'
import { RefreshCw } from 'lucide-react'
import type { CircuitBreakerEventType } from '@x-llm-gateway/shared'

export function CircuitBreakerPage() {
  const [eventFilter, setEventFilter] = useState<CircuitBreakerEventType | 'all'>('all')
  const [offset, setOffset] = useState(0)
  const [limit, setLimit] = useState(50)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'reset' | 'trip' | null>(null)
  const [confirmInstanceId, setConfirmInstanceId] = useState('')

  const statsQuery = useCircuitBreakerStats()
  const realtimeQuery = useRealtimeStates()
  const eventsQuery = useCircuitBreakerEvents(eventFilter, offset, limit)
  const resetMutation = useManualAction('reset')
  const tripMutation = useManualAction('trip')

  const openConfirm = (instanceId: string, action: 'reset' | 'trip') => {
    setConfirmInstanceId(instanceId)
    setConfirmAction(action)
    setConfirmOpen(true)
  }

  const handleConfirm = () => {
    if (!confirmAction || !confirmInstanceId) return
    if (confirmAction === 'reset') {
      resetMutation.mutate(confirmInstanceId)
    } else {
      tripMutation.mutate(confirmInstanceId)
    }
  }

  const isActionPending = resetMutation.isPending || tripMutation.isPending
  const totalPages = Math.max(1, Math.ceil((eventsQuery.data?.total ?? 0) / limit))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">熔断记录</h1>
          <p className="text-muted-foreground">模型实例熔断状态与事件历史</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { statsQuery.refetch(); eventsQuery.refetch(); realtimeQuery.refetch(); }}>
          <RefreshCw className="mr-2 h-4 w-4" />刷新
        </Button>
      </div>

      <CircuitBreakerStatsCards
        stats={statsQuery.data ?? null}
        loading={statsQuery.isLoading}
        error={statsQuery.error}
        onRetry={() => statsQuery.refetch()}
      />

      <RealtimeStateTable
        instances={realtimeQuery.data?.instances ?? []}
        loading={realtimeQuery.isLoading}
        error={realtimeQuery.error}
        onReset={(id) => openConfirm(id, 'reset')}
        onTrip={(id) => openConfirm(id, 'trip')}
        actionPending={isActionPending}
        onRetry={() => realtimeQuery.refetch()}
      />

      {statsQuery.data?.topInstances && statsQuery.data.topInstances.length > 0 && (
        <TopInstancesTable instances={statsQuery.data.topInstances} />
      )}

      <EventHistoryTable
        events={eventsQuery.data?.events ?? []}
        loading={eventsQuery.isLoading}
        error={eventsQuery.error}
        filter={eventFilter}
        onFilterChange={(v) => { setEventFilter(v); setOffset(0) }}
        currentPage={Math.floor(offset / limit) + 1}
        totalPages={totalPages}
        pageSize={limit}
        onPageChange={(page) => setOffset((page - 1) * limit)}
        onPageSizeChange={(size) => { setLimit(size); setOffset(0) }}
        onRetry={() => eventsQuery.refetch()}
      />

      <CircuitBreakerConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        instanceId={confirmInstanceId}
        action={confirmAction ?? 'reset'}
        pending={isActionPending}
        onConfirm={handleConfirm}
      />
    </div>
  )
}
