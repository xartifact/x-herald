'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { get, post } from '../lib/api-client'
import type { CircuitBreakerStats, CircuitBreakerRealtimeState, CircuitBreakerEventResponse } from '@x-llm-gateway/shared'

export function useCircuitBreakerStats() {
  return useQuery<CircuitBreakerStats>({
    queryKey: ['circuit-breaker', 'stats'],
    queryFn: () => get<CircuitBreakerStats>('/api/circuit-breaker/stats'),
    refetchInterval: 30_000,
  })
}

export function useRealtimeStates() {
  return useQuery<{ instances: CircuitBreakerRealtimeState[] }>({
    queryKey: ['circuit-breaker', 'realtime-states'],
    queryFn: () => get<{ instances: CircuitBreakerRealtimeState[] }>('/api/circuit-breaker/realtime-states'),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  })
}

export function useCircuitBreakerEvents(eventFilter: string, offset = 0, limit = 50) {
  return useQuery<{ events: CircuitBreakerEventResponse[]; total: number }>({
    queryKey: ['circuit-breaker', 'events', eventFilter, offset, limit],
    queryFn: () => {
      const params: Record<string, string> = { limit: String(limit), offset: String(offset) }
      if (eventFilter !== 'all') params.event = eventFilter
      return get<{ events: CircuitBreakerEventResponse[]; total: number }>('/api/circuit-breaker/events', { params })
    },
    refetchInterval: 30_000,
  })
}

export function useManualAction(action: 'reset' | 'trip') {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (instanceId: string) =>
      post(`/api/circuit-breaker/${instanceId}/${action}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['circuit-breaker'] })
      toast.success(action === 'reset' ? '熔断已重置' : '已强制熔断')
    },
    onError: () => {
      toast.error(action === 'reset' ? '重置失败' : '熔断失败')
    },
  })
}