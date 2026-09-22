import type {
  InstanceCost,
  InstanceCostTier,
  ModelReasoningOptions,
  ProviderModelInfo,
} from '@xartifact/x-herald-shared'

/**
 * 供应商模型字段别名注册表。
 *
 * 不同的供应商 /models 端点返回的字段名和嵌套结构差异很大：
 *
 * | 供应商     | context window    | pricing input    | pricing output    | vision               |
 * |-----------|-------------------|------------------|-------------------|----------------------|
 * | OpenAI    | (不提供)           | (不提供)          | (不提供)           | (不提供)              |
 * | Anthropic | (不提供)           | (不提供)          | (不提供)           | (不提供)              |
 * | OpenRouter| context_length     | pricing.prompt    | pricing.completion | architecture.input_modalities |
 * | Together  | context_length     | pricing.prompt    | pricing.completion | (不提供)              |
 * | DeepSeek  | (不提供)           | (不提供)          | (不提供)           | (不提供)              |
 *
 * 注册表列出每个概念的 **所有已知字段路径**（dot-path），
 * 按优先级顺序依次尝试，第一个命中即采用。
 * 新供应商上线时只需往对应数组追加路径即可。
 */

// ── 基础提取工具 ──────────────────────────────────────────────────────────────

/** dot-path 提取：从嵌套对象中按 `a.b.c` 路径取值 */
function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, key) => {
    if (cur == null || typeof cur !== 'object') return undefined
    return (cur as Record<string, unknown>)[key]
  }, obj)
}

function num(v: unknown): number | undefined {
  if (v == null) return undefined
  const n = typeof v === 'string' ? parseFloat(v) : (v as number)
  return typeof n === 'number' && !isNaN(n) ? n : undefined
}

function bool(v: unknown): boolean | undefined {
  if (v == null) return undefined
  return Boolean(v)
}

/** 从多个候选路径中提取第一个有效数值 */
function pickNum(obj: Record<string, unknown>, paths: readonly string[]): number | undefined {
  for (const p of paths) {
    const v = num(getPath(obj, p))
    if (v != null) return v
  }
  return undefined
}

/** 从多个候选路径中提取第一个有效字符串 */
function pickStr(obj: Record<string, unknown>, paths: readonly string[]): string | undefined {
  for (const p of paths) {
    const v = getPath(obj, p)
    if (typeof v === 'string' && v.length > 0) return v
  }
  return undefined
}

/** 从多个候选路径中提取第一个有效布尔值 */
function pickBool(obj: Record<string, unknown>, paths: readonly string[]): boolean | undefined {
  for (const p of paths) {
    const v = bool(getPath(obj, p))
    if (v != null) return v
  }
  return undefined
}

/** 检查数组字段是否包含某个值（用于 architecture.input_modalities 等） */
function arrayIncludes(
  obj: Record<string, unknown>,
  path: string,
  target: string,
): boolean | undefined {
  const v = getPath(obj, path)
  if (!Array.isArray(v)) return undefined
  return v.some((x) => String(x).toLowerCase() === target)
}

/** 检查字符串数组是否包含某个值（用于 supported_parameters 等） */
function arrayHasValue(
  obj: Record<string, unknown>,
  path: string,
  target: string,
): boolean | undefined {
  const v = getPath(obj, path)
  if (!Array.isArray(v)) return undefined
  return v.some((x) => String(x).toLowerCase() === target.toLowerCase())
}

// ── 字段别名注册表 ──────────────────────────────────────────────────────────

const FIELD_ALIASES = {
  name: ['name', 'display_name', 'title'],
  description: ['description', 'desc', 'long_description'],
  contextWindow: [
    'context_window',
    'context_length',
    'contextWindow',
    'max_context_length',
    'top_provider.context_length',
  ],
  maxOutputTokens: [
    'max_output_tokens',
    'max_completion_tokens',
    'maxOutputTokens',
    'top_provider.max_completion_tokens',
    'max_tokens',
  ],
} as const

// capabilities 的来源分两类：
// 1) 显式布尔字段（capabilities.streaming, supports_streaming 等）
// 2) 从数组推断（architecture.input_modalities 含 'image' → vision）
const CAPABILITY_ALIASES = {
  streaming: ['capabilities.streaming', 'supports_streaming', 'streaming'],
  functionCalling: [
    'capabilities.function_calling',
    'capabilities.functionCalling',
    'supports_function_calling',
    'supports_tools',
  ],
  vision: ['capabilities.vision', 'supports_vision', 'vision'],
  jsonMode: ['capabilities.json_mode', 'capabilities.jsonMode', 'supports_json_mode'],
  reasoning: ['capabilities.reasoning', 'supports_reasoning', 'reasoning'],
} as const

// 计费字段别名 — 对 OpenRouter 的 pricing.prompt 等 snake_case 嵌套路径
const COST_ALIASES = {
  input: ['input', 'prompt', 'prompt_price', 'input_price'],
  output: ['output', 'completion', 'completion_price', 'output_price'],
  cacheRead: [
    'cache_read',
    'cached_input',
    'input_cache_read',
    'prompt_cache_read',
    'cache_read_price',
  ],
  cacheWrite: ['cache_write', 'cache_creation', 'cache_creation_price', 'prompt_cache_write'],
} as const

// ── 归一化函数 ──────────────────────────────────────────────────────────────

/**
 * 将供应商 /models 返回的原始模型对象归一化为 ProviderModelInfo。
 *
 * 通过字段别名注册表从多种常见字段名中提取信息（兼容 OpenAI / Anthropic /
 * OpenRouter / Together / DeepSeek 等）。供应商未提供的字段留空（undefined）。
 */
export function normalizeProviderModel(
  raw: Record<string, unknown>,
  synced: boolean,
): ProviderModelInfo {
  const id = String(raw.id ?? '')
  if (!id) return { id: '', name: '', synced }

  const name = pickStr(raw, FIELD_ALIASES.name) ?? id
  const description = pickStr(raw, FIELD_ALIASES.description)
  const contextWindow = pickNum(raw, FIELD_ALIASES.contextWindow)
  const maxOutputTokens = pickNum(raw, FIELD_ALIASES.maxOutputTokens)
  const cost = normalizeCostRaw(raw)
  const capabilities = normalizeCapabilitiesRaw(raw)
  const reasoning = normalizeReasoningOptionsRaw(raw)

  const info: ProviderModelInfo = { id, name, synced }
  if (description) info.description = description
  if (contextWindow != null) info.contextWindow = contextWindow
  if (maxOutputTokens != null) info.maxOutputTokens = maxOutputTokens
  if (cost) info.cost = cost
  if (capabilities) info.capabilities = capabilities
  // 档位明细与布尔能力位并存：前者供客户端渲染选择器，后者是能力位
  if (reasoning) info.reasoning = reasoning
  return info
}

/** 从原始模型数据中提取计费信息 */
export function normalizeCostRaw(raw: Record<string, unknown>): InstanceCost | undefined {
  // 先找到 cost/pricing/price 所在的嵌套对象
  const costObj =
    (getPath(raw, 'cost') as Record<string, unknown> | undefined) ??
    (getPath(raw, 'pricing') as Record<string, unknown> | undefined) ??
    (getPath(raw, 'price') as Record<string, unknown> | undefined) ??
    raw // 也可能直接平铺在顶层

  if (!costObj || typeof costObj !== 'object') return undefined

  const c = costObj as Record<string, unknown>
  const input = pickNum(c, COST_ALIASES.input)
  const output = pickNum(c, COST_ALIASES.output)
  if (input == null || output == null) return undefined

  const cost: InstanceCost = { input, output }
  const cacheRead = pickNum(c, COST_ALIASES.cacheRead)
  const cacheWrite = pickNum(c, COST_ALIASES.cacheWrite)
  if (cacheRead != null) cost.cache_read = cacheRead
  if (cacheWrite != null) cost.cache_write = cacheWrite

  // tiers — 阶梯定价
  const tiersRaw = getPath(c, 'tiers')
  if (Array.isArray(tiersRaw)) {
    const tiers: InstanceCost['tiers'] = []
    for (const t of tiersRaw) {
      if (!t || typeof t !== 'object') continue
      const r = t as Record<string, unknown>
      const threshold = num(r.input_tokens_above)
      const ti = num(r.input)
      const to = num(r.output)
      if (threshold == null || ti == null || to == null) continue
      const tier: InstanceCostTier = { input_tokens_above: threshold, input: ti, output: to }
      const tcr = num(r.cache_read)
      const tcw = num(r.cache_write)
      if (tcr != null) tier.cache_read = tcr
      if (tcw != null) tier.cache_write = tcw
      tiers.push(tier)
    }
    if (tiers.length > 0) cost.tiers = tiers
  }
  return cost
}

/**
 * 从原始模型数据中提取能力标记。
 *
 * 支持两种来源：
 * 1) 显式布尔字段（capabilities.streaming 等）
 * 2) 从数组字段推断（如 OpenRouter 的 architecture.input_modalities 含 'image' → vision）
 * 3) 从 supported_parameters 数组推断（如含 'tools' → functionCalling）
 */
export function normalizeCapabilitiesRaw(
  raw: Record<string, unknown>,
): ProviderModelInfo['capabilities'] | undefined {
  const streaming = pickBool(raw, CAPABILITY_ALIASES.streaming)
  const functionCalling =
    pickBool(raw, CAPABILITY_ALIASES.functionCalling) ??
    arrayHasValue(raw, 'supported_parameters', 'tools')
  const vision =
    pickBool(raw, CAPABILITY_ALIASES.vision) ??
    arrayIncludes(raw, 'architecture.input_modalities', 'image') ??
    arrayIncludes(raw, 'input_modalities', 'image')
  const jsonMode =
    pickBool(raw, CAPABILITY_ALIASES.jsonMode) ??
    arrayHasValue(raw, 'supported_parameters', 'response_format')
  const reasoning =
    pickBool(raw, CAPABILITY_ALIASES.reasoning) ??
    arrayHasValue(raw, 'supported_parameters', 'reasoning')

  const result: ProviderModelInfo['capabilities'] = {}
  if (streaming != null) result.streaming = streaming
  if (functionCalling != null) result.functionCalling = functionCalling
  if (vision != null) result.vision = vision
  if (jsonMode != null) result.jsonMode = jsonMode
  if (reasoning != null) result.reasoning = reasoning

  return Object.keys(result).length > 0 ? result : undefined
}

/**
 * 从上游 `/models` 原始对象提取推理档位描述。
 *
 * **这是修复根因的关键**：`normalizeCapabilitiesRaw` 用 `Boolean(v)` 判断
 * `reasoning`，而 `Boolean({...})` 恒为 `true` —— OpenRouter 的
 * `{"mandatory":false,"supported_efforts":["max","high","low"],"default_effort":"high"}`
 * 会被压成 `true`，档位明细全部销毁，客户端从此只能提供「开/关」。
 *
 * 这里在布尔之外**额外**保留对象形状，两者并存：
 *   - `capabilities.reasoning: boolean` → 是否支持推理（能力位，语义正确，保留）
 *   - `reasoning: ModelReasoningOptions` → 支持哪些档位（本函数产出）
 *
 * 仅在拿到至少一个有效字段时返回；`mandatory:false` 这类**只有空壳**的对象
 * （OpenRouter 用它表示"支持但无档位约束"）会归一为不返回档位列表，
 * 由调用方决定回退到「开/关」。
 */
export function normalizeReasoningOptionsRaw(
  raw: Record<string, unknown>,
): ModelReasoningOptions | undefined {
  const candidate = getPath(raw, 'reasoning')
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return undefined

  const r = candidate as Record<string, unknown>
  const out: ModelReasoningOptions = {}

  if (typeof r.mandatory === 'boolean') out.mandatory = r.mandatory
  if (typeof r.default_enabled === 'boolean') out.default_enabled = r.default_enabled

  const efforts = r.supported_efforts
  if (Array.isArray(efforts)) {
    const list = efforts.filter((e): e is string => typeof e === 'string' && e.length > 0)
    if (list.length > 0) out.supported_efforts = list
  }

  const defaultEffort = r.default_effort
  if (typeof defaultEffort === 'string' && defaultEffort.length > 0) {
    out.default_effort = defaultEffort
  }

  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * 从同步模型数据构建 metadata JSONB。
 *
 * 将供应商提供的 contextWindow / maxOutputTokens / capabilities / reasoning
 * 存入 metadata，供后续 /v1/models 端点组装。
 */
export function buildInstanceMetadata(m: {
  contextWindow?: number
  maxOutputTokens?: number
  capabilities?: {
    streaming?: boolean
    functionCalling?: boolean
    vision?: boolean
    jsonMode?: boolean
    reasoning?: boolean
  }
  /** 推理档位明细（OpenRouter 形状）；同步时落库，供 /v1/models 回放 */
  reasoning?: ModelReasoningOptions
}): Record<string, unknown> | null {
  const meta: Record<string, unknown> = {}
  if (m.contextWindow != null) meta.contextWindow = m.contextWindow
  if (m.maxOutputTokens != null) meta.maxOutputTokens = m.maxOutputTokens
  if (m.capabilities) {
    const caps: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(m.capabilities)) {
      if (v != null) caps[k] = v
    }
    if (Object.keys(caps).length > 0) meta.capabilities = caps
  }
  if (m.reasoning && Object.keys(m.reasoning).length > 0) meta.reasoning = m.reasoning
  return Object.keys(meta).length > 0 ? meta : null
}

const UPSTREAM_ERROR_BODY_MAX_BYTES = 4_096
const UPSTREAM_ERROR_MESSAGE_MAX_CHARS = 300

function sanitizeUpstreamErrorText(value: string, maxLength: number): string | null {
  const sanitized = value
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[REDACTED_URL]')
    .replace(
      /\b(authorization|api[_-]?key|access[_-]?token|token|secret|password)\s*[:=]\s*(?:bearer\s+)?[^\s,;)}\]]+/gi,
      '$1=[REDACTED]',
    )
    .replace(/\bbearer\s+[a-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|pk|rk)-[a-z0-9_-]+\b/gi, '[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()
  if (!sanitized) return null
  return sanitized.length > maxLength ? `${sanitized.slice(0, maxLength)}…` : sanitized
}

/**
 * Reads only a small JSON error response. HTML and oversized bodies deliberately
 * remain opaque so an upstream response cannot leak into the admin API or logs.
 */
export async function readUpstreamErrorBody(response: Response): Promise<string | null> {
  if (
    !response.headers.get('content-type')?.toLowerCase().split(';', 1)[0]?.trim().endsWith('json')
  ) {
    return null
  }
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > UPSTREAM_ERROR_BODY_MAX_BYTES) return null

  const reader = response.body?.getReader()
  if (!reader) return null

  const decoder = new TextDecoder()
  let size = 0
  let body = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > UPSTREAM_ERROR_BODY_MAX_BYTES) {
        await reader.cancel().catch(() => undefined)
        return null
      }
      body += decoder.decode(value, { stream: true })
    }
    return body + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

/** Extracts a whitelisted provider error code and message from a JSON error body. */
export function extractUpstreamErrorDetails(
  rawBody: string,
): { code?: string; message?: string } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const root = parsed as Record<string, unknown>
  const nested = root.error
  const source =
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : root
  const codeValue =
    typeof source.code === 'string' ? source.code : typeof root.code === 'string' ? root.code : null
  const messageValue =
    typeof source.message === 'string'
      ? source.message
      : typeof root.message === 'string'
        ? root.message
        : null
  const code = codeValue ? sanitizeUpstreamErrorText(codeValue, 100) : null
  const message = messageValue
    ? sanitizeUpstreamErrorText(messageValue, UPSTREAM_ERROR_MESSAGE_MAX_CHARS)
    : null

  if (!code && !message) return null
  return { ...(code ? { code } : {}), ...(message ? { message } : {}) }
}

/** Formats a bounded, actionable summary without exposing arbitrary upstream bodies. */
export function formatUpstreamHttpError(
  apiLabel: string,
  status: number,
  rawBody: string | null,
): string {
  const detail = rawBody ? extractUpstreamErrorDetails(rawBody) : null
  const prefix = `${apiLabel} API returned ${status}`
  if (!detail) return prefix
  if (detail.code && detail.message) return `${prefix} (${detail.code}): ${detail.message}`
  if (detail.code) return `${prefix} (${detail.code})`
  return `${prefix}: ${detail.message}`
}
