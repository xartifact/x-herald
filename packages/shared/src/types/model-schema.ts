/**
 * v1/models 接口返回的模型 Schema。
 *
 * 与 `~/.pi/agent/extensions/x-llm-gateway/schemas/v1-models.schema.json` 保持一致。
 * - 顶层为 OpenAI 标准的 list 信封：`{ object: "list", data: Model[] }`
 * - `Model` 保留 OpenAI 必需字段（`id` / `object` / `owned_by`），并扩展
 *   `name` / `created` / `context_window` / `max_output_tokens` / `capabilities` /
 *   `cost` / `headers` / `thinking_level_map` / `compat`
 * - 全部 snake_case，与 pi 客户端协议对齐
 */

// ── Capability flags ─────────────────────────────────────────────────────────

/**
 * 能力子集（snake_case）。
 * `vision` 与 `reasoning` 为必填，其余可选；扩展通过 `additionalCapabilities` 兜底。
 */
export interface ModelCapabilitiesSchema {
  /** Gateway 可以通过 SSE 流式输出 tokens */
  streaming?: boolean
  /** 模型接受 OpenAI 风格的 tool/function 定义 */
  function_calling?: boolean
  /** 模型接受图片输入 */
  vision: boolean
  /** 模型支持 response_format: { type: "json_object" } */
  json_mode?: boolean
  /** 模型支持 extended thinking */
  reasoning: boolean
  /** 其它前向兼容的布尔能力（如 `web_search`、`code_interpreter`） */
  additionalCapabilities?: Record<string, boolean>
}

// ── Cost ─────────────────────────────────────────────────────────────────────

/**
 * 单档价格（USD per 1M tokens）。
 * - `cache_read` / `cache_write` 为必填；`tiers` 可选
 * - 阶梯定价：当总输入量（input + cache_read + cache_write）超过 `input_tokens_above` 时
 *   整请求切换到该档价格；多档匹配时取 `input_tokens_above` 最大者
 */
export interface ModelCost {
  input: number
  output: number
  cache_read: number
  cache_write: number
  /** camelCase 兼容视图，与 cache_read / cache_write 同值（冗余发射，供期望该形状的消费端） */
  cacheRead?: number
  cacheWrite?: number
  tiers?: ModelCostTier[]
}

/** 单个阶梯定价 */
export interface ModelCostTier {
  /** 触发该阶梯的最小总输入 tokens（含 cache） */
  input_tokens_above: number
  input: number
  output: number
  cache_read?: number
  cache_write?: number
}

// ── Headers ──────────────────────────────────────────────────────────────────

/** 模型专属静态请求头，附加到每个请求 */
export type ModelHeaders = Record<string, string>

// ── Thinking level mapping ──────────────────────────────────────────────────

/**
 * 将 pi 内部的 thinking level 映射到 provider 接受的取值。
 * 严格集合；未列出的 level 会被拒绝。
 * 值为 `null` 表示在 thinking 选择器中隐藏该 level。
 */
export interface ModelThinkingLevelMap {
  off?: string | null
  minimal?: string | null
  low?: string | null
  medium?: string | null
  high?: string | null
  xhigh?: string | null
  max?: string | null
}

// ── Compat ───────────────────────────────────────────────────────────────────

/**
 * 协议兼容性提示，镜像 pi 的 `ProviderModelConfig.compat`。
 * 字段名 snake_case；未识别的 key 会被 pi 忽略。
 */
export interface ModelCompat {
  supports_store?: boolean
  supports_developer_role?: boolean
  supports_reasoning_effort?: boolean
  supports_usage_in_streaming?: boolean
  supports_strict_mode?: boolean
  supports_openai_grammar_tools?: boolean
  max_tokens_field?: 'max_completion_tokens' | 'max_tokens'
  requires_tool_result_name?: boolean
  requires_assistant_after_tool_result?: boolean
  requires_thinking_as_text?: boolean
  requires_reasoning_content_on_assistant_messages?: boolean
  thinking_format?:
    | 'openai'
    | 'openrouter'
    | 'deepseek'
    | 'together'
    | 'zai'
    | 'qwen'
    | 'chat-template'
    | 'qwen-chat-template'
    | 'string-thinking'
    | 'ant-ling'
  chat_template_kwargs?: Record<string, unknown>
  cache_control_format?: 'anthropic'
  session_affinity_format?: 'openai' | 'openai-nosession' | 'openrouter'
  send_session_affinity_headers?: boolean
  deferred_tools_mode?: 'kimi'
  supports_long_cache_retention?: boolean
  supports_eager_tool_input_streaming?: boolean
  supports_cache_control_on_tools?: boolean
  force_adaptive_thinking?: boolean
  allow_empty_signature?: boolean
  supports_strict_tools?: boolean
  openrouter_routing?: Record<string, unknown>
  vercel_gateway_routing?: Record<string, unknown>
  /** 前向兼容的额外 key（pi 忽略未知 key） */
  additionalCompat?: Record<string, unknown>
}

// ── Model entry ──────────────────────────────────────────────────────────────

/** v1/models 单个模型条目 */
export interface ModelSchema {
  /** OpenAI 标准，stable identifier */
  id: string
  /** 对外展示名；缺失时客户端回退到 `id` */
  name?: string
  /** OpenAI 标准，固定 "model" */
  object: 'model'
  /** OpenAI 标准 */
  owned_by: string
  /** OpenAI 标准，Unix timestamp (seconds) */
  created?: number
  /** 最大输入上下文窗口（tokens），Hermes 兼容键；须在 context_window 之前出现（JSON 键序） */
  context_length?: number
  /** 最大输入上下文窗口（tokens），必填 */
  context_window: number
  /** 单次响应最大输出 tokens，必填 */
  max_output_tokens: number
  capabilities: ModelCapabilitiesSchema
  cost?: ModelCost
  headers?: ModelHeaders
  thinking_level_map?: ModelThinkingLevelMap
  compat?: ModelCompat

  // ── camelCase 兼容视图（与上方 snake_case 字段同值，冗余发射，供期望该形状的消费端）──

  /** 与 context_window 同值 */
  contextWindow?: number
  /** 与 max_output_tokens 同值 */
  maxTokens?: number
  /** 与 capabilities.reasoning 同值 */
  reasoning?: boolean
  /** 输入模态列表；恒含 "text"，vision 时含 "image" */
  input?: string[]
  /** 与 compat.max_tokens_field 同值 */
  maxTokensField?: 'max_completion_tokens' | 'max_tokens'
  /** 媒体输入约束，透传路由目标实例 metadata.mediaInput（无实例配置时省略） */
  mediaInput?: Record<string, unknown>
}

// ── List response ────────────────────────────────────────────────────────────

/** v1/models 列表响应 */
export interface ModelListResponse {
  object: 'list'
  data: ModelSchema[]
}
