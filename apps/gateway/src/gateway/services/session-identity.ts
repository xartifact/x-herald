/**
 * 会话标识解析：把客户端各家用不同名字表达的「同一段对话」收敛成一个稳定 key。
 *
 * 为什么需要：压缩/折叠状态必须按会话共享，否则同一段对话每轮都重新开始，
 * 压缩既省不下 token 又会反复改动请求。各家客户端标记会话的方式互不兼容：
 *
 * | 来源 | 形态 | 谁在用 |
 * | --- | --- | --- |
 * | body.prompt_cache_key | JSON 字段 | OpenAI Responses / 部分 SDK |
 * | x-conversation-id | 头部 | 本网关自己的会话追踪 |
 * | x-session-id | 头部 | 通用 SDK |
 * | x-claude-code-session-id | 头部 | Claude Code |
 * | x-grok-* | 头部前缀 | Grok 客户端 |
 * | x-opencode-session-id | 头部 | OpenCode |
 *
 * 优先级按「离对话语义最近」排序：显式 `prompt_cache_key` 是客户端对同一段上下文
 * 的直接声明，比传输层头部更可信；其余按生态覆盖面排列。
 *
 * **无标识时返回 null**，调用方据此完全跳过压缩——不能用一个随机 UUID 冒充会话，
 * 那会让每个请求都变成独立会话，压缩收益为负还要付摘要成本。
 */

/** 解析结果：key 用于聚合会话，source 用于日志与排障 */
export interface SessionIdentity {
  key: string
  source: SessionSource
}

export type SessionSource =
  | 'prompt_cache_key'
  | 'x-conversation-id'
  | 'x-session-id'
  | 'x-claude-code-session-id'
  | 'x-grok-session-id'
  | 'x-opencode-session-id'

/** Grok 系客户端用 `x-grok-<variant>` 变体，逐一代举不完，用前缀匹配 */
const GROK_PREFIX = 'x-grok-'

/** 头部来源，按优先级顺序 */
const HEADER_SOURCES: ReadonlyArray<{ header: string; source: SessionSource }> = [
  { header: 'x-conversation-id', source: 'x-conversation-id' },
  { header: 'x-session-id', source: 'x-session-id' },
  { header: 'x-claude-code-session-id', source: 'x-claude-code-session-id' },
  { header: 'x-grok-session-id', source: 'x-grok-session-id' },
  { header: 'x-opencode-session-id', source: 'x-opencode-session-id' },
]

/** 会话 key 的列宽上限（request_logs.conversation_key 是 varchar(255)） */
const MAX_KEY_LENGTH = 255

function normalize(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.slice(0, MAX_KEY_LENGTH)
}

/**
 * 按优先级解析会话标识，返回**首个**非空值。
 *
 * 冲突处理：一旦某个来源命中就停止，不再合并多个来源。合并会制造一个客户端从未
 * 声明过的合成 key；而只取首个则保证「同一次请求在同一头/字段上永远解析到同一个
 * 结果」，这也是幂等的前提。
 */
export function resolveSessionIdentity(params: {
  /** 已按需归一化的请求头（小写键） */
  headers: Record<string, string | undefined>
  /** 原始请求体；只读 `prompt_cache_key`，不做其它推断 */
  body?: unknown
}): SessionIdentity | null {
  const bodyKey = readBodyPromptCacheKey(params.body)
  const fromBody = normalize(bodyKey)
  if (fromBody) return { key: fromBody, source: 'prompt_cache_key' }

  for (const { header, source } of HEADER_SOURCES) {
    const value = normalize(params.headers[header])
    if (value) return { key: value, source }
  }

  // Grok 变体：只有在具体名字都未命中时才扫前缀，保证顺序确定
  for (const [name, raw] of Object.entries(params.headers)) {
    if (!name.toLowerCase().startsWith(GROK_PREFIX)) continue
    const value = normalize(raw)
    if (value) return { key: value, source: 'x-grok-session-id' }
  }

  return null
}

/** 从请求体里取 `prompt_cache_key`；非对象或字段类型不符一律视为缺失 */
function readBodyPromptCacheKey(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined
  if (!('prompt_cache_key' in body)) return undefined
  return body.prompt_cache_key
}
