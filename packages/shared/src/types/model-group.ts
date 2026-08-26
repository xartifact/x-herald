export type RoutingStrategy =
  | 'round_robin'
  | 'weighted'
  | 'least_response_time'
  | 'priority'
  | 'cost_optimized'
  | 'smart'

export interface RoutingConfig {
  strategy: RoutingStrategy
  fallbackEnabled: boolean
  params?: Record<string, any>
}

export interface ApiResponse<T> {
  success: boolean
  data: T
  error?: string
  total?: number
  code?: string
  message?: string
}

export interface GroupFormData {
  name: string
  aliases: string
  displayName: string
  description: string
  category: 'chat' | 'embedding' | 'image' | 'audio'
  capabilities: {
    streaming: boolean
    functionCalling: boolean
    vision: boolean
    jsonMode: boolean
    maxTokens: number
    contextWindow: number
  }
  routingStrategy: RoutingStrategy
  fallbackEnabled: boolean
}

export interface InstanceFormData {
  providerId: string
  name: string
  actualModelName: string
  description: string
  weight: number
  priority: number
  config?: InstanceConfig
}

export interface ModelCapabilities {
  streaming: boolean
  functionCalling: boolean
  vision: boolean
  jsonMode: boolean
  maxTokens: number
  contextWindow: number
  reasoning?: boolean
  codeInterpreter?: boolean
  webSearch?: boolean
  [key: string]: unknown
}

/**
 * 模型实例计费信息（USD per 1M tokens）。
 *
 * 与 v1-models.schema.json 中的 `Cost` 定义对齐。
 * `input` / `output` 为必填（与旧版 `{ input: number; output: number }` 兼容），
 * `cache_read` / `cache_write` / `tiers` 为可选扩展。
 */
export interface InstanceCost {
  input: number
  output: number
  cache_read?: number
  cache_write?: number
  tiers?: InstanceCostTier[]
}

/** 阶梯定价：当总输入 tokens 超过 `input_tokens_above` 时切换到该档价格 */
export interface InstanceCostTier {
  input_tokens_above: number
  input: number
  output: number
  cache_read?: number
  cache_write?: number
}

/**
 * 供应商 `/models` 端点返回的单个模型信息（归一化后）。
 *
 * `fetchRemoteModels` 抓取供应商响应后，将各供应商可能返回的额外字段
 * 归一化为 camelCase 并填充到对应属性。供应商未提供的字段留空（undefined）。
 */
export interface ProviderModelInfo {
  /** 模型 ID（供应商原始标识，如 `gpt-4o`、`claude-sonnet-4-5-20250929`） */
  id: string
  /** 展示名称 */
  name: string
  /** 是否已同步为 model_instance */
  synced: boolean
  /** 模型描述（如有） */
  description?: string
  /** 上下文窗口大小（tokens） */
  contextWindow?: number
  /** 最大输出 tokens */
  maxOutputTokens?: number
  /** 计费信息 */
  cost?: InstanceCost
  /** 能力标记 */
  capabilities?: {
    streaming?: boolean
    functionCalling?: boolean
    vision?: boolean
    jsonMode?: boolean
    reasoning?: boolean
  }
}

export interface InstanceConfig {
  parameterMapping?: Record<
    string,
    {
      min?: number
      max?: number
      default?: unknown
      transform?: string
    }
  >

  capabilityOverrides?: Partial<{
    streaming: boolean
    functionCalling: boolean
    vision: boolean
    maxTokens: number
    contextWindow: number
  }>

  customHeaders?: Record<string, string>

  /**
   * 角色归一化映射：把入站消息的某个 role 映射为另一个 role。
   * 例如 OpenAI SDK 新发的 `developer` 角色，某些上游（X-AIO 等）不支持，
   * 可配置 `{ developer: 'system' }` 在 egress 前统一改写。
   * 未配置时不改写任何角色（透明透传）。
   */
  roleMapping?: Record<string, 'system' | 'user' | 'assistant' | 'tool'>

  supportsThinking?: boolean
  patchMissingReasoningContent?: boolean

  retryConfig?: {
    maxRetries: number
    retryDelay: number
    retryableStatusCodes: number[]
  }

  /**
   * 实例级超时覆盖。
   * - connectTimeoutMs：TCP/TLS 建连超时（缺省用全局 CONNECT_TIMEOUT）
   * - ttfbTimeoutMs：单次 attempt TTFB 覆盖（缺省用全局 attempt*）
   * - connectTimeout / readTimeout：历史字段，分别映射到 connect / ttfb
   */
  timeoutConfig?: {
    connectTimeoutMs?: number
    ttfbTimeoutMs?: number
    /** @deprecated 使用 connectTimeoutMs */
    connectTimeout?: number
    /** @deprecated 历史误用为 read，现映射为 ttfbTimeoutMs */
    readTimeout?: number
  }

  parameterTransforms?: Array<{
    when?: {
      paramName: string
      operator: 'eq' | 'ne' | 'exists' | 'not_exists'
      value?: unknown
    }
    action: {
      type: 'add' | 'remove' | 'rename' | 'transform'
      targetParam: string
      value?: unknown
      expression?: string
    }
  }>

  schemaConfig?: {
    cleanEnabled: boolean
    preserveFields?: string[]
    additionalBannedFields?: string[]
  }

  requestInject?: Record<string, unknown>

  requestTransform?: string

  responseExtract?: Record<string, string>
  responseTransform?: string

  /**
   * 失败尝试的日志落库策略（模型实例级，配置可选）。
   *
   * 默认行为（缺省 / true）：每次候选尝试都独立落库 —— 请求经 failover 成功后，
   * 失败的首选尝试会留下一条 status=failure 的 request_logs 行（如 "Failover: HTTP 500"），
   * 与最终成功的行共存（同 requestGroupId，不同 candidateIndex）。
   *
   * 设为 false：跳过失败尝试的 failure 落库 —— 该候选的 request_logs 行保持 pending
   * 不写入失败态，请求最终以成功尝试的单一行为准（request_attempts 仍保留每次尝试的
   * HTTP 细节，routing-traces 完整可见）。适合"失败尝试不应以失败面目出现在请求日志"的
   * 场景；对最终全部候选都失败的请求，仍以最后一次失败的 error 收尾。
   */
  logFailoverAttempts?: boolean
}

export interface ModelGroup {
  id: string
  name: string
  aliases: string[] | null
  displayName: string
  description: string | null
  category: string
  capabilities: ModelCapabilities
  supportedProtocols: string[] | null
  enabled: boolean
  routingConfig: RoutingConfig | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  instances?: ModelInstance[]
}

export interface ModelInstance {
  id: string
  providerId: string
  name: string
  actualModelName: string
  description: string | null
  config: InstanceConfig | null
  weight: number
  priority: number
  costPer1kTokens: InstanceCost | null
  healthCheckUrl: string | null
  enabled: boolean
  status: string
  lastCheckedAt: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  provider?: { id: string; name: string }
  groupIds?: string[]
  groupId?: string | null
}

export interface ModelGroupDetail {
  group: ModelGroup
  instances: ModelInstance[]
}

export interface CreateModelGroupPayload {
  name: string
  aliases?: string[]
  displayName: string
  description?: string
  category?: string
  capabilities?: ModelCapabilities
  supportedProtocols?: string[]
  routingConfig?: RoutingConfig
  metadata?: Record<string, unknown>
}

export interface UpdateModelGroupPayload {
  name?: string
  aliases?: string[]
  displayName?: string
  description?: string
  category?: string
  capabilities?: ModelCapabilities
  supportedProtocols?: string[]
  routingConfig?: RoutingConfig
  metadata?: Record<string, unknown>
}

export interface CreateModelInstancePayload {
  groupIds?: string[]
  groupId?: string | null
  providerId: string
  name: string
  actualModelName: string
  description?: string
  weight?: number
  priority?: number
  costPer1kTokens?: InstanceCost
  config?: InstanceConfig
}

export interface UpdateModelInstancePayload {
  name?: string
  actualModelName?: string
  description?: string
  weight?: number
  priority?: number
  costPer1kTokens?: InstanceCost | null
  config?: InstanceConfig | null
}

/**
 * 模型实例连通性测试结果 —— 由实例清单上的"测试"按钮触发（POST /instances/:id/test）。
 * ok=true 表示上游可达且返回了正常响应；其余情况 ok=false，message 说明原因。
 */
export interface InstanceTestResult {
  /** 连通且响应正常 */
  ok: boolean
  /** 上游返回的 HTTP 状态码（网络错误时为 null） */
  statusCode: number | null
  /** 探测耗时（ms） */
  latencyMs: number
  /** 探测时使用的实例实际模型名 */
  model: string | null
  /** 给用户看的结论文案（成功/失败原因） */
  message: string
  /** 上游返回的简短响应片段（成功时，便于确认可用性） */
  snippet: string | null
}
