import { useQuery } from '@tanstack/react-query'

import { get } from '@xartifact/x-herald-ui'

// 与后端 DB schema（packages/db/src/schema/intent-logs.ts）保持一致；
// 不直接依赖 db 包是因为 web app 当前不引入它。
export type IntentSource =
  | 'model_name'
  | 'capability'
  | 'classifier'
  | 'fallback'
  | 'default'
  | 'agent_directive'

export interface IntentLogRow {
  id: string
  requestGroupId: string | null
  virtualKeyId: string | null
  virtualKeyName: string | null
  accessModelId: string | null
  accessModelName: string | null
  modelRouteId: string | null
  modelRouteName: string | null
  modelRoutePriority: number | null
  intentName: string
  intentSource: IntentSource
  intentConfidence: number | null
  targetGroupId: string | null
  targetGroupName: string | null
  classifierProviderId: string | null
  classifierProviderName: string | null
  classifierModelName: string | null
  classifierLatencyMs: number | null
  classifierRawResponse: string | null
  classifierPromptVersion: number | null
  userMessageRaw: string | null
  userMessage: string | null
  userMessageCapabilities: string[] | null
  classifierSystemPrompt: string | null
  classifierReasoning: string | null
  classifierRequestMessages: unknown[] | null
  classifierRequestBody: unknown | null
  classifierResponseBody: unknown | null
  classifierStatusCode: number | null
  createdAt: string
}

// API 响应包络：`{ success, data: IntentLogRow[], nextCursor, hasMore }`
export interface IntentLogsListEnvelope {
  data: IntentLogRow[]
  nextCursor: string | null
  hasMore: boolean
}

export interface IntentStats {
  total: number
  byIntentName: Array<{ intentName: string; count: number }>
  byIntentSource: Array<{ intentSource: IntentSource; count: number }>
  byAccessModel: Array<{
    accessModelId: string | null
    accessModelName: string | null
    count: number
  }>
  avgClassifierLatencyMs: number | null
}

export const intentLogKeys = {
  all: ['intent-logs'] as const,
  lists: () => [...intentLogKeys.all, 'list'] as const,
  list: (q: string) => [...intentLogKeys.lists(), q] as const,
  stats: () => [...intentLogKeys.all, 'stats'] as const,
}

function buildQueryString(filters: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== '') params.set(k, String(v))
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

export function useIntentLogs(
  filters: {
    virtualKeyId?: string
    accessModelId?: string
    intentName?: string
    intentSource?: string
    startDate?: string
    endDate?: string
    cursor?: string
    pageSize?: number
  } = {},
) {
  const queryString = buildQueryString(filters)
  return useQuery({
    queryKey: intentLogKeys.list(queryString),
    queryFn: () =>
      get<IntentLogsListEnvelope>(`/api/logs/intents${queryString}`, { extractData: false }),
  })
}

export function useIntentLogStats(
  filters: {
    startDate?: string
    endDate?: string
    virtualKeyId?: string
  } = {},
) {
  const queryString = buildQueryString(filters)
  return useQuery({
    queryKey: [...intentLogKeys.stats(), queryString],
    queryFn: () =>
      get<{ data: IntentStats }>(`/api/logs/intents/stats${queryString}`, { extractData: false }),
  })
}
