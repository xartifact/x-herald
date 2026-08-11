/**
 * 统一 LLM 类型定义
 * 作为所有协议转换的中间格式
 */

// ==================== 消息类型 ====================

export type ProtocolType = 'openai' | 'anthropic' | 'gemini' | 'vertex' | 'custom'
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

export type CacheControl = Record<string, unknown>

export interface TextContent {
  type: 'text'
  text: string
  cache_control?: CacheControl
}

export interface ImageContent {
  type: 'image_url'
  image_url: {
    url: string
    detail?: 'auto' | 'low' | 'high'
  }
  cache_control?: CacheControl
}

export interface AudioContent {
  type: 'input_audio'
  input_audio: {
    data: string
    format: string
  }
  cache_control?: CacheControl
}

export interface VideoContent {
  type: 'video_url'
  video_url: {
    url: string
  }
  cache_control?: CacheControl
}

export type MessageContent = TextContent | ImageContent | AudioContent | VideoContent

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
  cache_control?: CacheControl
}

export interface ToolMessage {
  role: 'tool'
  content: string
  tool_call_id: string
}

export interface ToolResult {
  tool_call_id: string
  content: string
  is_error?: boolean
  cache_control?: CacheControl
}

export interface StandardMessage {
  role: MessageRole
  content: string | MessageContent[]
  tool_calls?: ToolCall[]
  tool_call_id?: string
  // 支持多条 tool results（解决 Anthropic 多 tool_result 丢失问题）
  tool_results?: ToolResult[]
  name?: string
  // 推理/思考内容（统一 Anthropic thinking 和阿里云 reasoning_content）
  reasoning_content?: string
  // Anthropic thinking 的 signature（用于验证真实性，透传保留）
  reasoning_signature?: string
  // 元数据（用于保留原始协议信息，不参与转换）
  metadata?: Record<string, unknown>
}

// ==================== 工具定义 ====================

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
  cache_control?: CacheControl
  // 协议特有的未知字段，ingress 时保留，egress 时透传回去
  _passthrough?: Record<string, unknown>
}

export type ToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; function: { name: string } }

// ==================== 推理/思考模式 ====================

export interface ReasoningConfig {
  effort?: 'low' | 'medium' | 'high'
  max_tokens?: number
  enabled?: boolean
  // 阿里云百炼的 enable_thinking 参数
  enable_thinking?: boolean
}

// ==================== 系统提示类型 ====================

export interface SystemPrompt {
  type: 'text'
  text: string
  cache_control?: CacheControl
}

// ==================== 输出配置 ====================

export interface OutputConfig {
  type: 'text' | 'json_object' | 'json_schema'
  schema?: unknown
}

// ==================== 统一请求 ====================

export interface StandardRequest {
  // 必需字段
  model: string
  messages: StandardMessage[]

  // 生成参数
  temperature?: number
  max_tokens?: number
  top_p?: number
  top_k?: number
  frequency_penalty?: number
  presence_penalty?: number

  // 功能开关
  stream?: boolean
  tools?: ToolDefinition[]
  tool_choice?: ToolChoice

  // 推理模式
  reasoning?: ReasoningConfig

  // 系统提示（支持字符串或数组格式）
  system?: string | SystemPrompt[]

  // 输出配置
  output_config?: OutputConfig

  // 其他参数
  stop?: string | string[]
  seed?: number
  response_format?: {
    type: 'text' | 'json_object' | 'json_schema'
    schema?: unknown
  }

  // 流式选项 (OpenAI 特有)
  stream_options?: {
    include_usage?: boolean
  }

  // 元数据（不参与协议转换，仅传递）
  metadata?: {
    originalProvider?: string
    targetProvider?: string
    routingDecision?: string
    [key: string]: unknown
  }
}

// ==================== 统一响应 ====================

export interface Usage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  prompt_tokens_details?: {
    cached_tokens?: number
  }
}

export interface StandardResponse {
  id: string
  object: 'chat.completion' | 'chat.completion.chunk'
  created: number
  model: string

  // 非流式响应
  choices?: Array<{
    index: number
    message?: StandardMessage
    delta?: Partial<StandardMessage>
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null
  }>

  // 用量统计
  usage?: Usage
}

// ==================== 流式响应块 ====================

export interface StreamChunk {
  id: string
  object: 'chat.completion.chunk'
  created: number
  model: string
  choices: Array<{
    index: number
    delta: {
      role?: MessageRole
      content?: string
      reasoning_content?: string
      tool_calls?: Array<{
        index: number
        id?: string
        type?: 'function'
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason: string | null
  }>
  usage?: Usage
}

// ==================== Provider 相关 ====================

export interface ProviderConfig {
  name: string
  baseUrl: string
  apiKey: string
  protocol: ProtocolType
  models: string[]
  defaultModel?: string
  headers?: Record<string, string>
  protocols?: Record<
    string,
    {
      baseUrl: string
      enabled: boolean
      thinkingMapping?: {
        enabled: boolean
        mappings: Record<string, string>
      }
      syntheticThinking?: 'strip' | 'inject'
      toolSchemaSanitization?: boolean
    }
  >
}

export interface ModelInfo {
  id: string
  name: string
  provider: string
  capabilities: {
    streaming: boolean
    functionCalling: boolean
    vision: boolean
    jsonMode: boolean
    maxTokens: number
    contextWindow: number
  }
}

export interface TransformerContext {
  request: StandardRequest
  response?: StandardResponse
  provider: ProviderConfig
  model: string
  headers: Record<string, string>
  metadata: Record<string, unknown>
  // Extended fields (used by handlers)
  requestId: string
  startTime: number
  targetProtocol?: ProtocolType
  instanceConfig?: Record<string, unknown>
  originalRequest?: unknown
  originalResponse?: Response
  state: Map<string, unknown>
}

export interface Transformer {
  readonly name: string
  readonly supportedProtocols?: ProtocolType[]
  normalizeRequest?(request: unknown, ctx: TransformerContext): Promise<StandardRequest>
  adaptRequest?(
    request: StandardRequest,
    ctx: TransformerContext,
  ): Promise<{
    body: unknown
    url?: string
    headers?: Record<string, string>
  }>
  normalizeResponse?(response: Response, ctx: TransformerContext): Promise<StandardResponse>
  adaptResponse?(response: StandardResponse, ctx: TransformerContext): Promise<Response>
  transformStream?(stream: ReadableStream, ctx: TransformerContext): Promise<ReadableStream>
}

export interface TransformerRegistry {
  register(
    name: string,
    transformer: Transformer | import('./transformer').TransformerConstructor,
  ): void
  get(name: string): Transformer | undefined
  has(name: string): boolean
  list(): string[]
}
