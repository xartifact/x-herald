// Log viewer types — matches the API response shapes from apps/web/src/hooks/log-types.ts
// These are application-layer types shared by engine API and UI components

export interface LogListItem {
  id: string
  virtualKeyId: string | null
  virtualKeyName: string | null
  modelName: string
  originalModelName: string | null
  providerId: string | null
  providerName: string | null
  status: 'success' | 'failure' | 'cancelled' | 'pending'
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
  requestCategory:
    | 'embedding'
    | 'chat_text'
    | 'chat_image'
    | 'chat_video'
    | 'chat_audio'
    | 'other'
    | null
  createdAt: string
  isComplete: boolean
  thinkingMode?: boolean | null
  responseModelName?: string | null
}

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

export interface Log extends LogListItem {
  requestHeaders: Record<string, string> | null
  requestBody: Record<string, unknown> | null
  clientResponseHeaders: Record<string, string> | null
  responseBody: Record<string, unknown> | null
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
    /** 客户端在收到部分数据后主动断开——不计入 failureRequests，也不算失败率 */
    cancelledRequests: number
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
