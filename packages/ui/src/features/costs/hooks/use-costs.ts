import { useQuery } from '@tanstack/react-query'

import { get } from '../../../shared/lib/api-client'

export const costKeys = {
  all: ['costs'] as const,
  summary: (params?: CostQueryParams) => [...costKeys.all, 'summary', params] as const,
  byKey: (params?: CostQueryParams) => [...costKeys.all, 'by-key', params] as const,
  byProvider: (params?: CostQueryParams) => [...costKeys.all, 'by-provider', params] as const,
  byModel: (params?: CostQueryParams) => [...costKeys.all, 'by-model', params] as const,
}

export interface CostQueryParams {
  startDate?: string
  endDate?: string
}

export interface CostSummary {
  totalCost: number
  totalInputTokens: number
  totalOutputTokens: number
  requestCount: number
}

export interface CostBreakdownItem {
  name: string
  totalCost: number
  requestCount: number
  inputTokens: number
  outputTokens: number
}

export function useCostSummary(params?: CostQueryParams) {
  return useQuery({
    queryKey: costKeys.summary(params),
    queryFn: () => get<CostSummary>('/api/costs/summary', { params: params as Record<string, string | undefined> }),
    refetchInterval: 30_000,
  })
}

export function useCostByKey(params?: CostQueryParams) {
  return useQuery({
    queryKey: costKeys.byKey(params),
    queryFn: () => get<CostBreakdownItem[]>('/api/costs/by-key', { params: params as Record<string, string | undefined> }),
    refetchInterval: 30_000,
  })
}

export function useCostByProvider(params?: CostQueryParams) {
  return useQuery({
    queryKey: costKeys.byProvider(params),
    queryFn: () => get<CostBreakdownItem[]>('/api/costs/by-provider', { params: params as Record<string, string | undefined> }),
    refetchInterval: 30_000,
  })
}

export function useCostByModel(params?: CostQueryParams) {
  return useQuery({
    queryKey: costKeys.byModel(params),
    queryFn: () => get<CostBreakdownItem[]>('/api/costs/by-model', { params: params as Record<string, string | undefined> }),
    refetchInterval: 30_000,
  })
}
