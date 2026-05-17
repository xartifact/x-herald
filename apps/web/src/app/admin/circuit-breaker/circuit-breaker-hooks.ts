'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import type { CBEvent, RealtimeState, Stats } from './circuit-breaker-types'

const API_BASE = '/api'

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}` }
}

export function useCircuitBreakerStats() {
  return useQuery<Stats>({
    queryKey: ['circuit-breaker', 'stats'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/circuit-breaker/stats`, { headers: authHeaders() })
      const json = await res.json()
      return json.data
    },
    refetchInterval: 30_000,
  })
}

export function useRealtimeStates() {
  return useQuery<{ instances: RealtimeState[] }>({
    queryKey: ['circuit-breaker', 'realtime-states'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/circuit-breaker/realtime-states`, { headers: authHeaders() })
      const json = await res.json()
      return json.data
    },
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  })
}

export function useCircuitBreakerEvents(eventFilter: string) {
  return useQuery<{ events: CBEvent[]; total: number }>({
    queryKey: ['circuit-breaker', 'events', eventFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' })
      if (eventFilter !== 'all') params.set('event', eventFilter)
      const res = await fetch(`${API_BASE}/circuit-breaker/events?${params}`, { headers: authHeaders() })
      const json = await res.json()
      return json.data
    },
    refetchInterval: 30_000,
  })
}

export function useManualAction(action: 'reset' | 'trip') {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (instanceId: string) => {
      const res = await fetch(`${API_BASE}/circuit-breaker/${instanceId}/${action}`, {
        method: 'POST',
        headers: authHeaders(),
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['circuit-breaker'] })
      toast.success(action === 'reset' ? '熔断已重置' : '已强制熔断')
    },
    onError: () => {
      toast.error(action === 'reset' ? '重置失败' : '熔断失败')
    },
  })
}
