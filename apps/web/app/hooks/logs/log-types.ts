export interface LogMetadata {
  messageSequence?: {
    totalCount: number
    roles: Array<{
      role: 'user' | 'assistant' | 'system' | 'tool'
      index: number
      contentType?: string[]
      toolCallCount?: number
      toolName?: string
      toolCallId?: string
      length?: number
    }>
  }

  content?: {
    types?: string[]
    hasFunctionCalling?: boolean
    toolNames?: string[]
  }

  toolCalls?: {
    pattern?: 'sequential' | 'parallel' | 'single'
    tools?: string[]
    details?: Array<{
      name: string
      arguments?: unknown
      result?: unknown
      callId?: string
      source?: 'request' | 'response'
      messageIndex?: number
    }>
  }

  conversation?: {
    messageId?: string
    parentMessageId?: string
    turnNumber?: number
    role?: string
    roleSwitches?: number
    hasToolInteraction?: boolean
  }

  request?: {
    temperature?: number
    maxTokens?: number
    topP?: number
    thinkingMode?: boolean
  }

  performance?: {
    responseTimeTier?: 'fast' | 'normal' | 'slow'
    gatewayOverheadMs?: number
    providerTtfbMs?: number
    streamDurationMs?: number
    usageEstimated?: boolean
    ttfbToFirstThinkingMs?: number
    ttfbToFirstTextMs?: number
    thinkingDurationMs?: number
  }

  routing?: {
    requestedModel: string
    matchedRuleId?: string
    matchedRuleName?: string
    matchedRulePriority?: number
    modelGroupId?: string
    modelGroupName?: string
    instanceId?: string
    actualModelName?: string
    strategy?: string
    responseModelName?: string
  }

  [key: string]: unknown
}

export const logKeys = {
  all: ['logs'] as const,
  lists: () => [...logKeys.all, 'list'] as const,
  list: (filters: string) => [...logKeys.lists(), { filters }] as const,
  details: () => [...logKeys.all, 'detail'] as const,
  detail: (id: string) => [...logKeys.details(), id] as const,
  stats: () => [...logKeys.all, 'stats'] as const,
  storage: () => [...logKeys.all, 'storage'] as const,
  conversation: (conversationId: string) =>
    [...logKeys.all, 'conversation', conversationId] as const,
}

export interface LogListItem {
  id: string
  virtualKeyId: string | null
  virtualKeyName: string | null
  modelName: string
  originalModelName: string | null
  providerId: string | null
  providerName: string | null
  status: 'success' | 'failure' | 'pending'
  statusCode: number | null
  responseTimeMs: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  streaming: string
  retryCount: number
  errorMessage: string | null
  errorType: string | null
  clientType: string | null
  requestPath: string | null
  createdAt: string
  isComplete: boolean
  thinkingMode?: boolean | null
  responseModelName?: string | null
}

export interface Log extends LogListItem {
  requestHeaders: Record<string, string> | null
  requestBody: Record<string, unknown> | null
  clientResponseHeaders: Record<string, string> | null
  responseBody: Record<string, unknown> | null
  // 以下字段已迁移至 requestAttempts 表，仅旧记录可能存在
  providerRequestHeaders?: Record<string, string> | null
  standardRequestBody?: Record<string, unknown> | null
  transformedRequestBody?: Record<string, unknown> | null
  providerResponseHeaders?: Record<string, string> | null
  providerResponseBody?: Record<string, unknown> | null
  standardResponseBody?: Record<string, unknown> | null
  clientIp: string | null
  userAgent: string | null
  requestPath: string | null
  requestMethod: string | null
  incomingProtocol: string | null
  targetProtocol: string | null
  metadata: LogMetadata | null
  toolCallsCount: number | null
  retryCount: number
  conversationId?: string
}

export interface LogStats {
  overview: {
    totalRequests: number
    successRequests: number
    failureRequests: number
    avgResponseTime: number
    totalInputTokens: number
    totalOutputTokens: number
    totalTokens: number
  }
  modelStats: Array<{
    modelName: string
    requestCount: number
    avgResponseTime: number
    totalTokens: number
  }>
  keyStats: Array<{
    virtualKeyId: string
    virtualKeyName: string
    requestCount: number
    totalTokens: number
  }>
  clientStats: Array<{
    clientType: string | null
    requestCount: number
  }>
}

export interface LogStorage {
  totalCount: number
  oldestLogDate: string | null
  newestLogDate: string | null
  retentionDays: number
  cutoffDate: string
  estimatedExpiredLogs: string
}

export interface LogsListResponse {
  success: boolean
  data: LogListItem[]
  nextCursor: string | null
  hasMore: boolean
}

export interface LogResponse {
  success: boolean
  data: Log
}

export interface LogStatsResponse {
  success: boolean
  data: LogStats
}

export interface LogStorageResponse {
  success: boolean
  data: LogStorage
}

export interface CleanupResponse {
  success: boolean
  data: {
    deletedCount: number
    retentionDays: number
  }
  message: string
}

export interface ClientModelStat {
  originalModelName: string
  requestCount: number
  successCount: number
  failureCount: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  avgResponseTime: number
  lastRequestAt: string
}

export interface ClientModelStatsResponse {
  success: boolean
  data: ClientModelStat[]
}

export interface ProviderStat {
  providerId: string | null
  providerName: string | null
  totalRequests: number
  successCount: number
  failureCount: number
  avgResponseTime: number
  minResponseTime: number
  maxResponseTime: number
  p95ResponseTime: number
  avgTtfb: number | null
  p95Ttfb: number | null
  ttfbCount: number
  lastRequestAt: string
}

export interface ProviderStatsResponse {
  success: boolean
  data: ProviderStat[]
}

export interface KeyStat {
  virtualKeyId: string
  virtualKeyName: string
  requestCount: number
  successCount: number
  failureCount: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  avgResponseTimeMs: number
  lastUsedAt: string | null
}

export interface ConversationAttempt {
  id: string
  status: 'success' | 'failure' | 'pending'
  providerName: string | null
  statusCode: number | null
  ttfbMs: number | null
  durationMs: number
  failoverReason: string | null
  candidateIndex: number
  createdAt: string
}

export interface ConversationRound {
  id: string
  status: 'success' | 'failure' | 'pending'
  modelName: string
  inputTokens: number
  outputTokens: number
  responseTimeMs: number
  errorMessage: string | null
  attempts: ConversationAttempt[]
  createdAt: string
}

export interface ConversationTraceResponse {
  success: boolean
  data: ConversationRound[]
}
