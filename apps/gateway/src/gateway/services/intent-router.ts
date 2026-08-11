/**
 * 意图路由服务
 * 使用小模型分析请求意图，按意图路由到对应模型组
 */
import { jsonrepair } from 'jsonrepair'

import logger from '../../lib/logger'
import { getDatabase } from '../../db/client'
import { providers } from '@xartifact/x-llm-gateway-db'
import { and, eq, isNull, modelInstances } from '@xartifact/x-llm-gateway-db'
import type { IntentActionConfig } from '@xartifact/x-llm-gateway-shared'
import type { StandardRequest } from '@xartifact/x-llm-gateway-shared'
import type { IntentSource } from '@xartifact/x-llm-gateway-db'

import { getActiveClassifierPrompt } from '../../features/settings/services/classifier-prompt-service'
import { gatewayBusinessMetrics } from '../../features/metrics/gateway-business-metrics'

const serviceLogger = logger.child({ module: 'intent-router' })

// 多轮对话里 classifier 只看最后一句容易误判（用户上一句技术问句 + 这一句
// "那你之前那个函数怎么写"会误导模型把当前这轮当成 coding 类的 follow-up）。
// 把最近 N 条 messages 一起发给分类器，给完整对话上下文。
const CLASSIFIER_HISTORY_WINDOW = 10
// 把 multimodal content 统一压平成纯文本，避免给分类器发 image_url 等它
// 处理不了的字段
function flattenMessageContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(
      (p: unknown) => !!p && typeof p === 'object' && (p as { type?: unknown }).type === 'text',
    )
    .map((p: unknown) => (p as { text?: unknown }).text ?? '')
    .join('\n')
}

const NOISE_BLOCK_PATTERNS: RegExp[] = [
  /<system-reminder>[\s\S]*?<\/system-reminder>/gi,
  /<system>[\s\S]*?<\/system>/gi,
  /<tool_result>[\s\S]*?<\/tool_result>/gi,
  /<tool_use>[\s\S]*?<\/tool_use>/gi,
  /\[BACKGROUND[^\]]*\][^\n]*/gi,
  /\[TOOL_RESULT\][^\n]*/gi,
  /\[TOOL_CALL\][^\n]*/gi,
  /\[SYSTEM[^\]]*\][^\n]*/gi,
  /\[internal[^\]]*\][^\n]*/gi,
  /\[Status:[^\]]*\][^\n]*/gi,
]

function stripNoiseBlocks(text: string): string {
  let out = text
  for (const re of NOISE_BLOCK_PATTERNS) {
    out = out.replace(re, '')
  }
  return out
}

function sanitizeMessagesForClassifier(messages: StandardRequest['messages']): Array<{
  role: 'user' | 'assistant'
  content: string
}> {
  const out: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue
    const raw = flattenMessageContent(m.content)
    const cleaned = stripNoiseBlocks(raw).trim()
    if (!cleaned) continue
    out.push({ role: m.role, content: cleaned })
  }
  return out
}

/**
 * 把最近 N 条对话压缩成一条 user message 发给分类器。
 *
 * 只保留纯文本内容，去掉 User:/Assistant: 角色前缀和 >>> 最新消息 <<< 标记：
 * - 小模型（qwythos-9b 等）对嵌入式角色标签响应不稳定 —— 尤其是纯 assistant
 *   会话（agent 工具调用流）里每行都标 "Assistant:" 会误导模型
 * - 最新消息标记改为由 system prompt 说明「最后一个段落即最新消息」，不再内嵌
 * - 各轮之间用空行分隔，保持「上下文在上、最新在下」的结构
 */
function collapseMessagesForClassifier(
  turns: Array<{ role: 'user' | 'assistant'; content: string }>,
): { role: 'user'; content: string } | null {
  if (turns.length === 0) return null
  return { role: 'user', content: turns.map((t) => t.content).join('\n\n') }
}

export interface IntentResult {
  intentName: string
  groupId: string
  confidence?: number
  source: IntentSource
  classifierLatencyMs?: number
  classifierRawResponse?: string
  classifierProviderId?: string
  classifierProviderName?: string
  classifierModelName?: string
  classifierPromptVersion?: number
  userMessageRaw?: string
  userMessage?: string
  userMessageCapabilities?: string[]
  /** 调用分类器时使用的 system prompt 全文 */
  classifierSystemPrompt?: string
  /** 推理模型的 thinking 内容（与 content 分开存） */
  classifierReasoning?: string
  /** 传给分类器的 messages 数组（system + user） */
  classifierRequestMessages?: unknown[]
  /** 完整 HTTP 请求 body（JSON 化 fetch 入参） */
  classifierRequestBody?: unknown
  /** 完整 HTTP 响应 body（分类器返回的 JSON，含 choices / usage / timings） */
  classifierResponseBody?: unknown
  /** HTTP 状态码 */
  classifierStatusCode?: number
  /**
   * 分类器实际返回的 category 字符串（大小写未标准化）。
   * 强化可观测性：即使该 category 不在 route config 的 targetGroupIds 中
   * （被 'default' 兜底前）也会原样透传，让运维看到 AI 的真实分类。
   * 与 intentName 的区别：intentName 是匹配上的 category（或 'default'），
   * classifierCategory 是分类器原话。
   */
  classifierCategory?: string | null
  /**
   * intentName 取自 classifierCategory（'default' 兜底时为 false），
   * 用于在监控 / 告警里区分 "分类器输出被忽略" 与 "分类器没给出答案"。
   */
  classifierCategoryMapped?: boolean
}

function detectCapabilitiesFromRequest(request: StandardRequest): string[] {
  const caps: string[] = []
  for (const msg of request.messages) {
    const content = msg.content
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === 'image_url') {
          caps.push('vision')
        }
        if (part.type === 'input_audio') {
          caps.push('audio')
        }
        if (part.type === 'video_url') {
          caps.push('video')
        }
      }
    }
  }
  if (request.tools && request.tools.length > 0) {
    caps.push('tool_use')
  }
  return caps
}

export interface ExtractedUserQuery {
  raw: string
  cleaned: string
  capabilities: string[]
}

export function extractUserQuery(request: StandardRequest): ExtractedUserQuery {
  const lastUserMsg = request.messages.filter((m) => m.role === 'user').pop()
  const raw = lastUserMsg ? flattenMessageContent(lastUserMsg.content).trim() : ''
  const cleaned = stripNoiseBlocks(raw).trim()
  return { raw, cleaned, capabilities: detectCapabilitiesFromRequest(request) }
}

const AGENT_DIRECTIVE_MARKER =
  /^\[(SYSTEM|internal|Status|TOOL_RESULT|TOOL_CALL|BACKGROUND TASK)[^\]]*\]/i

export function detectAgentDirective(raw: string): boolean {
  if (!raw) return false
  const firstLine =
    raw
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? ''
  if (!firstLine) return false
  return AGENT_DIRECTIVE_MARKER.test(firstLine)
}

interface MatchedCategory {
  /** 小写化的 category；和 config.targetGroupIds 的 key 直接对账 */
  category: string
  /** 0~1 之间的浮点 confidence；解析失败填 0 */
  confidence: number
  /** 分类器原样输出的 category 字符串（成功解析时才有，未标准化大小写） */
  rawCategory: string | null
}

/**
 * 从分类器返回的 JSON 文本里挑 category + confidence。
 *
 * 已知 category 集合的语义：
 *   - 非空 → 严格匹配：只有当返回的 category 在集合里才返回命中（老路径）
 *   - 空   → 宽容匹配：任意 category 都透传（强化可观测性，把分类器原意
 *           暴露到 intentName，避免被 'default' 吞掉）
 *
 * 抽出来是因为 matchCategory 里多个分支都要做同一件事（JSON.parse + 挑字段），
 * 重复会失同步。
 */
function parseCategoryField(text: string, knownCategorySet: Set<string>): MatchedCategory | null {
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null
  const rec = obj as Record<string, unknown>
  for (const key of ['category', 'intent', 'intent_name', 'result']) {
    const raw = rec[key]
    if (typeof raw !== 'string' || !raw) continue
    const lowerCat = raw.toLowerCase()
    if (knownCategorySet.size > 0 && !knownCategorySet.has(lowerCat)) continue
    const confRaw = rec.confidence
    const confidence =
      typeof confRaw === 'number' && Number.isFinite(confRaw)
        ? Math.max(0, Math.min(1, confRaw))
        : 0
    return { category: lowerCat, confidence, rawCategory: raw }
  }
  return null
}

function matchCategory(rawText: string, config: IntentActionConfig): MatchedCategory {
  const categories = Object.keys(config.targetGroupIds).map((c) => c.toLowerCase())
  const knownCategorySet = new Set(categories)
  const text = rawText.trim()
  if (!text) return { category: 'default', confidence: 0, rawCategory: null }

  // 1) 严格 JSON 解析：分类器按 prompt 输出的 {"category":"<known>",...}
  const strict = parseCategoryField(text, knownCategorySet)
  if (strict) return strict

  // 2) jsonrepair 修复常见格式错误（截断、缺右括号、缺引号）
  try {
    const repaired = parseCategoryField(jsonrepair(text), knownCategorySet)
    if (repaired) return repaired
  } catch {
    // 不是 JSON，fallthrough
  }

  // 3) 抽取 { ... } 块重试
  const jsonObjectMatch = text.match(/\{[\s\S]*\}/)
  if (jsonObjectMatch) {
    const fromMatch = parseCategoryField(jsonObjectMatch[0], knownCategorySet)
    if (fromMatch) return fromMatch
  }

  // 4) 宽容透传：JSON 合法但 category 不在已知集合 → 保留原值
  //    这是强化 AI 分析可观测性的关键：让 raw category 不被 'default' 吞掉
  if (knownCategorySet.size > 0) {
    for (const candidate of jsonObjectMatch ? [text, jsonObjectMatch[0]] : [text]) {
      const lenient = parseCategoryField(candidate, new Set())
      if (lenient) return lenient
    }
  }

  // 5) 整个文本就是一个 category（不裹 JSON）— 兼容老 prompt
  const lower = text.toLowerCase()
  if (knownCategorySet.has(lower)) {
    return { category: lower, confidence: 0, rawCategory: text.trim() }
  }

  // 6) 子串匹配（最后兜底）— 兼容 prompt 没要求 JSON 的老配置
  const contained = categories
    .filter((c) => lower.includes(c))
    .toSorted((a, b) => b.length - a.length)
  if (contained.length > 0) {
    return { category: contained[0], confidence: 0, rawCategory: contained[0] }
  }

  // 7) 兜底
  return { category: 'default', confidence: 0, rawCategory: null }
}

/**
 * 运行时把 classifier.modelName 规范化为上游需要的实际 model 名。
 *
 * 如果 modelName 看起来像 model_instance.id (UUID)，查 model_instances
 * 表换成 actual_model_name；否则原样返回。
 *
 * UUID 检测用最严格的 hex+dash 模式匹配，避免误伤任意字符串。
 * 查询失败（表没数据 / DB 故障）时降级返回原 modelName，让上游自己决定。
 */
async function resolveUpstreamModelName(_providerId: string, modelName: string): Promise<string> {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidPattern.test(modelName)) return modelName
  try {
    const db = getDatabase()
    const rows = await db
      .select({ actualModelName: modelInstances.actualModelName })
      .from(modelInstances)
      .where(eq(modelInstances.id, modelName))
      .limit(1)
    return rows[0]?.actualModelName ?? modelName
  } catch (e) {
    serviceLogger.warn({ err: e, modelName }, 'resolveUpstreamModelName: lookup failed')
    return modelName
  }
}

async function classifyIntent(
  request: StandardRequest,
  config: IntentActionConfig,
  userQuery: ExtractedUserQuery,
): Promise<{
  intentName: string
  /** 0~1，分类器在 JSON 里返回的 confidence；解析失败为 0 */
  confidence: number
  /** 分类器原样 category 字符串；解析失败/provider 不可用为 null */
  classifierCategory: string | null
  /** intentName 是否与 config.targetGroupIds 里的某个 key 匹配（命中已知集合） */
  classifierCategoryMapped: boolean
  latencyMs: number
  rawResponse: string
  providerId?: string
  providerName?: string
  modelName?: string
  userText: string
  systemPrompt: string
  promptVersion: number
  requestMessages: unknown[]
  reasoning: string
  /** 完整 HTTP 请求 body（fetch 出参） */
  requestBody?: unknown
  /** 完整 HTTP 响应 body（分类器返回的 JSON） */
  responseBody?: unknown
  /** HTTP 状态码 */
  statusCode?: number
}> {
  if (!config.classifier) {
    return {
      intentName: 'default',
      confidence: 0,
      classifierCategory: null,
      classifierCategoryMapped: false,
      latencyMs: 0,
      rawResponse: '',
      userText: userQuery.cleaned,
      systemPrompt: '',
      promptVersion: 0,
      requestMessages: [],
      reasoning: '',
    }
  }

  const categories = config.classifier.categories.map((c: string) => `  - "${c}"`).join('\n')
  const userText = userQuery.cleaned

  const activePrompt = await getActiveClassifierPrompt()
  const systemPrompt = activePrompt.content.replace('{categories}', categories)
  const promptVersion = activePrompt.version

  const lastUserIdx = (() => {
    for (let i = request.messages.length - 1; i >= 0; i--) {
      if (request.messages[i].role === 'user') return i
    }
    return -1
  })()
  const conversationSlice =
    lastUserIdx >= 0 ? request.messages.slice(0, lastUserIdx + 1) : request.messages
  const cleaned = sanitizeMessagesForClassifier(conversationSlice)
  const historyWindow = config.classifier.historyWindow ?? CLASSIFIER_HISTORY_WINDOW
  const tail = cleaned.slice(-historyWindow)
  const collapsed = collapseMessagesForClassifier(tail)

  if (!collapsed) {
    return {
      intentName: 'default',
      confidence: 0,
      classifierCategory: null,
      classifierCategoryMapped: false,
      latencyMs: 0,
      rawResponse: 'no_user_query',
      userText,
      systemPrompt,
      promptVersion,
      requestMessages: [],
      reasoning: '',
    }
  }

  const prompt = [{ role: 'system' as const, content: systemPrompt }, collapsed]

  const startedAt = Date.now()
  // 必须 hoist 到函数作用域，否则 catch 里看不到（const 在 try 内声明的，作用域不出 try）
  let requestBody: unknown = undefined
  try {
    const db = getDatabase()
    const providerResult = await db
      .select({
        id: providers.id,
        name: providers.name,
        apiKey: providers.apiKey,
        baseUrl: providers.protocols,
      })
      .from(providers)
      .where(
        and(
          eq(providers.id, config.classifier.providerId),
          eq(providers.enabled, true),
          isNull(providers.deletedAt),
        ),
      )
      .limit(1)
    if (providerResult.length === 0) {
      return {
        intentName: 'default',
        confidence: 0,
        classifierCategory: null,
        classifierCategoryMapped: false,
        latencyMs: Date.now() - startedAt,
        rawResponse: 'provider_not_found',
        userText,
        systemPrompt,
        promptVersion,
        requestMessages: prompt,
        reasoning: '',
      }
    }

    const prov = providerResult[0]
    const oc = (prov.baseUrl as Record<string, { baseUrl: string; enabled: boolean }>).openai
    if (!oc?.baseUrl) {
      return {
        intentName: 'default',
        confidence: 0,
        classifierCategory: null,
        classifierCategoryMapped: false,
        latencyMs: Date.now() - startedAt,
        rawResponse: 'no_base_url',
        userText,
        systemPrompt,
        promptVersion,
        requestMessages: prompt,
        reasoning: '',
      }
    }

    // 运行时最后一道防线：graph 里的 classifier.modelName 如果被错误地保存为
    // model_instance.id (UUID)，查表换成 actual_model_name 后再发给上游。
    // 这是为了防止编译器层的 resolver 被绕过（例：上游 RouteRuleEngine 还没
    // 重新编译、或者未来新增了不走编译器的调用路径）。
    const upstreamModelName = await resolveUpstreamModelName(
      config.classifier.providerId,
      config.classifier.modelName,
    )

    const requestBody = {
      model: upstreamModelName,
      messages: prompt,
      response_format: { type: 'json_object' as const },
      max_tokens: 64,
      temperature: 0,
      stop: ['\n\n'],
    }
    const response = await fetch(`${oc.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(prov.apiKey ? { Authorization: `Bearer ${prov.apiKey}` } : {}),
      },
      body: JSON.stringify(requestBody),
    })
    if (!response.ok) {
      // 旧逻辑只把 `http_400` 写进 rawResponse，运维看不到上游真实错误。
      // 现在读取 response body 写进 responseBody，前端详情 dialog 可看到。
      // body 可能是 text 或 json —— 都尽量当 text 读，然后尝试 JSON.parse。
      const errorText = await response.text().catch(() => '')
      let parsed: unknown = errorText
      try {
        parsed = errorText ? JSON.parse(errorText) : errorText
      } catch {
        // 不是 JSON，原样保留 text
      }
      return {
        intentName: 'default',
        confidence: 0,
        classifierCategory: null,
        classifierCategoryMapped: false,
        latencyMs: Date.now() - startedAt,
        rawResponse: `http_${response.status}`,
        userText,
        systemPrompt,
        promptVersion,
        requestMessages: prompt,
        reasoning: '',
        requestBody,
        responseBody: parsed,
        statusCode: response.status,
      }
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null
          reasoning_content?: string | null
        }
      }>
    }
    const msg = data.choices?.[0]?.message
    const content = msg?.content?.trim() ?? ''
    const reasoning = msg?.reasoning_content?.trim() ?? ''
    // 与 rawResponse 语义统一：优先 content；都没有就是空
    const rawText = content || reasoning
    const matched = matchCategory(rawText, config)
    const knownKeys = new Set(Object.keys(config.targetGroupIds).map((c) => c.toLowerCase()))
    const mapped = matched.category !== 'default' && knownKeys.has(matched.category)
    return {
      intentName: matched.category,
      confidence: matched.confidence,
      classifierCategory: matched.rawCategory,
      classifierCategoryMapped: mapped,
      latencyMs: Date.now() - startedAt,
      rawResponse: rawText,
      providerId: prov.id,
      providerName: prov.name,
      modelName: upstreamModelName,
      userText,
      systemPrompt,
      promptVersion,
      requestMessages: prompt,
      reasoning,
      requestBody,
      responseBody: data,
      statusCode: response.status,
    }
  } catch (error) {
    // 之前固定写 "exception" 字面量，运维无法看到具体原因。改成捕获真实
    // error.message 写入数据库，前端详情 dialog 直接显示出来。
    const errMsg =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : typeof error === 'string'
          ? error
          : 'unknown error'
    serviceLogger.warn({ error }, 'Intent classification failed')
    // requestBody 在 try 块中可能尚未初始化（DB 查询失败时就抛了），
    // 只能条件性地传入
    const hasRequestBody = typeof requestBody !== 'undefined' && requestBody !== undefined
    return {
      intentName: 'default',
      confidence: 0,
      classifierCategory: null,
      classifierCategoryMapped: false,
      latencyMs: Date.now() - startedAt,
      rawResponse: errMsg,
      userText,
      systemPrompt,
      promptVersion,
      requestMessages: prompt,
      reasoning: '',
      ...(hasRequestBody ? { requestBody } : {}),
    }
  }
}

export async function resolveIntentRoute(
  request: StandardRequest,
  ctx: { requestId: string },
  config: IntentActionConfig,
): Promise<IntentResult> {
  const userQuery = extractUserQuery(request)
  const model = request.model?.toLowerCase() || ''

  if (detectAgentDirective(userQuery.raw)) {
    const fallbackGroupId = config.defaultGroupId || Object.values(config.targetGroupIds)[0] || ''
    return {
      intentName: 'default',
      groupId: fallbackGroupId,
      source: 'agent_directive',
      userMessageRaw: userQuery.raw,
      userMessage: userQuery.cleaned,
      userMessageCapabilities: userQuery.capabilities,
    }
  }

  for (const [intent, groupId] of Object.entries(config.targetGroupIds)) {
    if (model.includes(intent)) {
      return {
        intentName: intent,
        groupId,
        source: 'model_name',
        userMessageRaw: userQuery.raw,
        userMessage: userQuery.cleaned,
        userMessageCapabilities: userQuery.capabilities,
      }
    }
  }

  if (!config.classifier) {
    const fallbackGroupId = config.defaultGroupId || Object.values(config.targetGroupIds)[0] || ''
    return {
      intentName: 'default',
      groupId: fallbackGroupId,
      source: 'default',
      userMessageRaw: userQuery.raw,
      userMessage: userQuery.cleaned,
      userMessageCapabilities: userQuery.capabilities,
    }
  }

  const cls = await classifyIntent(request, config, userQuery)
  if (cls.providerName) {
    gatewayBusinessMetrics.intentClassifierDuration.observe(
      { provider: cls.providerName },
      cls.latencyMs / 1000,
    )
  }
  // classifier 返回的 intentName 在两种情况下会与 targetGroupIds 不匹配：
  //   a) intentName === 'default'      → 分类器没给出答案 / 解析失败
  //   b) intentName !== 'default' 但 targetGroupIds[cat] 是 undefined
  //      → "分类器说 X，但配置没把 X 接住"（unmapped_category 路径）
  // 区分 a/b 让运维能精准定位问题：a 是模型问题，b 是配置问题。
  const classifierCategoryUnmapped =
    cls.intentName !== 'default' && !config.targetGroupIds[cls.intentName]
  const finalGroupId =
    config.targetGroupIds[cls.intentName] ||
    config.defaultGroupId ||
    Object.values(config.targetGroupIds)[0] ||
    ''
  const source: IntentSource = cls.intentName === 'default' ? 'fallback' : 'classifier'
  if (source === 'fallback' && cls.providerName) {
    const reason = classifierCategoryUnmapped
      ? 'unmapped_category'
      : bucketFallbackReason(cls.rawResponse)
    gatewayBusinessMetrics.intentClassifierFallback.inc({
      provider: cls.providerName,
      reason,
    })
    // 关键告警信号：分类器反复输出一个 route config 没接住的 category
    if (classifierCategoryUnmapped && cls.classifierCategory) {
      serviceLogger.warn(
        {
          classifierCategory: cls.classifierCategory,
          targetGroupIds: Object.keys(config.targetGroupIds),
          confidence: cls.confidence,
        },
        'Classifier returned a category not present in targetGroupIds — route config should be updated',
      )
    }
  }

  return {
    intentName: cls.intentName,
    groupId: finalGroupId,
    confidence: cls.confidence || undefined,
    source,
    classifierLatencyMs: cls.latencyMs,
    classifierRawResponse: cls.rawResponse,
    classifierProviderId: cls.providerId,
    classifierProviderName: cls.providerName,
    classifierModelName: cls.modelName,
    classifierPromptVersion: cls.promptVersion,
    userMessageRaw: userQuery.raw,
    userMessage: cls.userText || userQuery.cleaned,
    userMessageCapabilities: userQuery.capabilities,
    classifierSystemPrompt: cls.systemPrompt,
    classifierReasoning: cls.reasoning,
    classifierRequestMessages: cls.requestMessages,
    classifierRequestBody: cls.requestBody,
    classifierResponseBody: cls.responseBody,
    classifierStatusCode: cls.statusCode,
    classifierCategory: cls.classifierCategory,
    classifierCategoryMapped: cls.classifierCategoryMapped,
  }
}

// 监控用的 fallback reason bucket。'unmapped_category' 不是 rawResponse 里的字面量，
// 而是 resolveIntentRoute 检测到「分类器输出了非 'default' 的 category，但
// targetGroupIds 没接住」时主动设置的 sentinel。把它放进桶里保证 bucketFallbackReason
// 不会把它二次归类为 'unmatched'。
const FALLBACK_REASON_BUCKETS = new Set([
  '',
  'no_user_query',
  'provider_not_found',
  'no_base_url',
  'unmapped_category',
])

function bucketFallbackReason(raw: string): string {
  if (FALLBACK_REASON_BUCKETS.has(raw)) return raw
  const m = raw.match(/^http_(\d{3})$/)
  if (m) {
    const code = Number(m[1])
    if (code >= 400 && code < 500) return 'http_4xx'
    if (code >= 500 && code < 600) return 'http_5xx'
    return `http_${code}`
  }
  return 'unmatched'
}
