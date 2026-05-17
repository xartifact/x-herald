import { useQuery } from '@tanstack/react-query'

import { get } from '@/core/lib/api-client'

import { logKeys } from './log-types'
import type {
  ClientModelStatsResponse,
  LogStatsResponse,
  LogStorageResponse,
  ProviderStatsResponse,
  KeyStat,
} from './log-types'

export function useLogStats(filters?: Record<string, string>) {
  const queryString = filters ? '?' + new URLSearchParams(filters).toString() : ''
  return useQuery({
    queryKey: [...logKeys.stats(), queryString],
    queryFn: () => get<LogStatsResponse>(`/api/logs/stats/overview${queryString}`, { extractData: false }),
  })
}

export function useLogStorage() {
  return useQuery({
    queryKey: logKeys.storage(),
    queryFn: () => get<LogStorageResponse>('/api/logs/stats/storage', { extractData: false }),
  })
}

export function useClientModelStats(filters?: Record<string, string>) {
  const queryString = filters ? '?' + new URLSearchParams(filters).toString() : ''
  return useQuery({
    queryKey: [...logKeys.all, 'client-models', queryString],
    queryFn: () => get<ClientModelStatsResponse>(`/api/logs/client-models${queryString}`, { extractData: false }),
  })
}

export function useProviderStats(filters?: Record<string, string>) {
  const queryString = filters ? '?' + new URLSearchParams(filters).toString() : ''
  return useQuery({
    queryKey: [...logKeys.all, 'provider-stats', queryString],
    queryFn: () => get<ProviderStatsResponse>(`/api/logs/stats/providers${queryString}`, { extractData: false }),
  })
}

export function useKeysStats(period?: 'today' | '7d' | '30d' | 'all') {
  const p = period ?? 'all'
  return useQuery({
    queryKey: [...logKeys.all, 'keys-stats', p],
    queryFn: async () => {
      const res = await get<{ success: boolean; data: KeyStat[] }>(
        `/api/logs/stats/keys?period=${p}`,
        { extractData: false }
      )
      return res.data ?? []
    },
  })
}
