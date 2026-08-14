import { useQuery } from '@tanstack/react-query'

import { get } from '../../shared/lib/api-client'
import type { RouteCondition, RoutingTraceSummary } from '@xartifact/x-herald-shared'

export interface RoutingTraceFilters {
  modelName?: string
  outcome?: 'success' | 'rejected' | 'all_failed'
  hasFailover?: boolean
  startDate?: string
  endDate?: string
  matchedRuleId?: string
  cursor?: string
  pageSize?: number
}

export interface RoutingTraceListResponse {
  items: RoutingTraceSummary[]
  nextCursor: string | null
  hasMore: boolean
}

export interface RoutingTraceDetailResponse extends RoutingTraceSummary {
  matchedRule?: {
    id: string
    name: string
    priority: number
    conditions?: RouteCondition[]
  }
  accessModelId?: string
  chain: Array<{
    index: number
    kind: 'primary' | 'backup' | 'single'
    actionType: string
    resolvedGroupId?: string
    resolvedGroupName?: string
    intentName?: string
    intentSource?: string
    intentTrace?: {
      intentName?: string
      intentSource?: string
      confidence?: number
      userMessage?: string
      capabilities?: string[]
      classifierCategory?: string | null
      classifierRawResponse?: string | null
      classifierModelName?: string | null
      classifierLatencyMs?: number
      classifierStatusCode?: number | null
    }
    capabilities?: string[]
    candidates: Array<{
      candidateIndex: number
      chainStepIndex: number
      chainStepKind: 'primary' | 'backup' | 'single'
      instanceId: string
      instanceName: string
      providerId: string
      providerName: string
      priority: number
      strategy: string
      groupName: string
      matched: boolean
      status?: 'success' | 'failed' | 'pending'
      statusCode?: number
      failoverReason?: string
      durationMs?: number
      requestLogId?: string
    }>
  }>
  finalCandidate?: {
    chainStepIndex: number
    chainStepKind: 'primary' | 'backup' | 'single'
    candidateIndex: number
    instanceId: string
    instanceName: string
    providerId: string
    providerName: string
  }
  totalAttempts: number
  /** 路由失败/被拒绝时的原因（reject 节点的 reason，或"无可用实例"之类的报错） */
  errorMessage?: string
}

export const routingTraceKeys = {
  all: ['routing-traces'] as const,
  lists: () => [...routingTraceKeys.all, 'list'] as const,
  list: (queryString: string) => [...routingTraceKeys.lists(), { queryString }] as const,
  details: () => [...routingTraceKeys.all, 'detail'] as const,
  detail: (logId: string) => [...routingTraceKeys.details(), logId] as const,
}

function buildQueryString(filters: RoutingTraceFilters): string {
  const params = new URLSearchParams()
  if (filters.modelName) params.set('modelName', filters.modelName)
  if (filters.outcome) params.set('outcome', filters.outcome)
  if (filters.hasFailover) params.set('hasFailover', 'true')
  if (filters.startDate) params.set('startDate', filters.startDate)
  if (filters.endDate) params.set('endDate', filters.endDate)
  if (filters.matchedRuleId) params.set('matchedRuleId', filters.matchedRuleId)
  if (filters.cursor) params.set('cursor', filters.cursor)
  params.set('pageSize', String(filters.pageSize ?? 20))
  return params.toString()
}

export function useRoutingTraces(filters: RoutingTraceFilters) {
  const queryString = buildQueryString(filters)
  return useQuery({
    queryKey: routingTraceKeys.list(queryString),
    queryFn: () =>
      get<RoutingTraceListResponse>(`/api/routing-traces?${queryString}`, {
        extractData: false,
      }),
    refetchOnWindowFocus: false,
  })
}
export function useRoutingTraceDetail(logId: string | null) {
  return useQuery({
    queryKey: routingTraceKeys.detail(logId ?? ''),
    queryFn: async () => {
      if (!logId) return null
      return get<RoutingTraceDetailResponse>(`/api/routing-traces/${logId}`, {
        extractData: false,
      })
    },
    enabled: !!logId,
  })
}
