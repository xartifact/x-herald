import { Hono } from 'hono'

import logger from '../lib/logger'
import type { VirtualKey } from '@xartifact/x-herald-db'

import { virtualKeyMiddleware } from '../middleware/virtual-key'
import actuatorRoutes from './routes/actuator'
import anthropicRoutes from './routes/anthropic'
import embeddingRoutes from './routes/embedding'
import openaiRoutes from './routes/openai'
import { resolveClientIp } from './services/client-identifier'
import { logRequest } from './services/log-service'
import { fetchAccessibleModels, type AccessibleModel } from './services/model-list'
import type { ModelSchema } from '@xartifact/x-herald-shared'

const ID_PATTERN = /^[A-Za-z0-9._:/\\-]+$/

/**
 * 网关能如实转发的通用推理档位。
 *
 * 网关对 `reasoning_effort` 是**透传**（ingress 原样收、egress 原样发，
 * 见 `openai/ingress.ts` / `openai/egress.ts`），因此可转发的档位由上游
 * 模型决定。在没有上游档位明细时的保守集合取 OpenAI 文档化的三档。
 */
const DEFAULT_REASONING_EFFORTS = ['low', 'medium', 'high'] as const
const DEFAULT_REASONING_EFFORT = 'medium'

/** 关闭推理的档位标记；OpenRouter 与客户端均以 `"none"` 表示关闭。 */
const REASONING_OFF = 'none'

/**
 * 构造对外 `reasoning` 字段（OpenRouter 对象形状）。
 *
 * 修复背景：此前这里发射 `capabilities.reasoning` 的**布尔**镜像，而按
 * OpenRouter 契约解码的客户端（`reasoning.supported_efforts` / `default_effort`）
 * 会因类型不符而拿不到任何档位信息。现在改为对象形状，与 OpenRouter
 * `/api/v1/models` 对齐。
 *
 * 取值优先级：
 *   1. 上游档位明细（`m.reasoningOptions`，同步时从供应商 `/models` 捕获并落库）
 *      —— 原样转发，这是对 OpenRouter 最忠实的兼容。
 *   2. 无上游明细但模型支持推理 → 用网关可透传的保守集合，并补上 `"none"`，
 *      让客户端能关闭推理。
 *   3. 不支持推理 → 返回 `undefined`（调用方省略该字段）。
 *
 * 注意 `capabilities.reasoning`（布尔能力位）**保留不变**：
 * 「是否支持推理」与「支持哪些档位」是两个正交信息。
 */
function buildReasoningOptions(m: AccessibleModel): ModelSchema['reasoning'] {
  const upstream = m.reasoningOptions
  if (upstream && (upstream.supported_efforts?.length || upstream.default_effort)) {
    return upstream
  }

  if (!m.capabilities?.reasoning) return undefined

  // 无上游明细：给出可透传的档位集，并附加关闭项
  const efforts = [...DEFAULT_REASONING_EFFORTS, REASONING_OFF]
  return {
    supported_efforts: efforts,
    default_effort: DEFAULT_REASONING_EFFORT,
  }
}

/** 把内部 AccessibleModel 映射为对外 ModelSchema；id 不合法时跳过 */
function toModelSchema(m: AccessibleModel): ModelSchema | null {
  if (!ID_PATTERN.test(m.name)) return null
  const caps = m.capabilities
  const entry: ModelSchema = {
    id: m.name,
    object: 'model',
    owned_by: 'x-herald',
    context_length: caps?.contextWindow ?? 0,
    context_window: caps?.contextWindow ?? 0,
    max_output_tokens: caps?.maxOutputTokens ?? 0,
    capabilities: {
      vision: caps?.vision ?? false,
      reasoning: caps?.reasoning ?? false,
    },
  }
  if (m.displayName) entry.name = m.displayName
  const created = Math.floor(m.createdAt.getTime() / 1000)
  if (created >= 1000000000 && created <= 4102444800) entry.created = created
  if (caps?.streaming) entry.capabilities.streaming = true
  if (caps?.functionCalling) entry.capabilities.function_calling = true
  if (caps?.jsonMode) entry.capabilities.json_mode = true
  if (m.cost) entry.cost = m.cost
  if (m.compat) entry.compat = m.compat
  if (m.headers) entry.headers = m.headers
  if (m.thinkingLevelMap) entry.thinking_level_map = m.thinkingLevelMap

  // ── camelCase 兼容视图（合理冗余：与上方 snake_case 字段同值，供期望该形状的消费端）──
  if (caps) {
    entry.contextWindow = caps.contextWindow
    entry.maxTokens = caps.maxOutputTokens
    entry.reasoning = buildReasoningOptions(m)
    entry.input = ['text', ...(caps.vision ? ['image'] : [])]
  }
  if (entry.compat?.max_tokens_field) entry.maxTokensField = entry.compat.max_tokens_field
  if (m.mediaInput) entry.mediaInput = m.mediaInput
  if (entry.cost) {
    entry.cost.cacheRead = entry.cost.cache_read
    entry.cost.cacheWrite = entry.cost.cache_write
  }
  return entry
}

const gatewayRoutes = new Hono<{
  Variables: {
    virtualKey: VirtualKey
  }
}>()

gatewayRoutes.use('*', virtualKeyMiddleware)

gatewayRoutes.route('/', actuatorRoutes)
gatewayRoutes.route('/', openaiRoutes)
gatewayRoutes.route('/', embeddingRoutes)
gatewayRoutes.route('/', anthropicRoutes)

/**
 * GET /v1/models — 统一模型列表端点
 * 通过请求头判断协议，返回对应格式
 *
 * 判断优先级：
 * 1. x-protocol-type 显式声明
 * 2. anthropic-version 头（Anthropic SDK 必带）
 * 3. x-api-key 头（Anthropic 鉴权方式）
 * 4. 默认 OpenAI
 */
gatewayRoutes.get('/models', async (c) => {
  const startTime = Date.now()
  const virtualKey = c.get('virtualKey')
  const clientIp = resolveClientIp(c)
  const userAgent = c.req.header('user-agent') || 'unknown'

  const protocolHeader = c.req.header('x-protocol-type')
  const isAnthropic =
    protocolHeader === 'anthropic' ||
    (!protocolHeader &&
      (!!c.req.header('anthropic-version') ||
        (!c.req.header('authorization') && !!c.req.header('x-api-key'))))
  const protocol: 'openai' | 'anthropic' = isAnthropic ? 'anthropic' : 'openai'

  try {
    const models = await fetchAccessibleModels(virtualKey)

    await logRequest({
      virtualKey,
      modelName: 'list',
      status: 'success',
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
      clientIp,
      userAgent,
      requestPath: c.req.path,
      requestMethod: 'GET',
      streaming: false,
      incomingProtocol: protocol,
    })

    const data = models.map(toModelSchema).filter((m): m is ModelSchema => m !== null)

    if (protocol === 'anthropic') {
      return c.json({
        data: data.map((m) => ({
          type: 'model' as const,
          ...m,
          created_at: new Date((m.created ?? 0) * 1000).toISOString(),
          created: undefined,
        })),
        has_more: false,
        first_id: data[0]?.id ?? null,
        last_id: data[data.length - 1]?.id ?? null,
      })
    }

    return c.json({ object: 'list', data })
  } catch (error) {
    logger.error({ error }, 'Models list error')
    if (protocol === 'anthropic') {
      return c.json(
        { type: 'error', error: { type: 'internal_error', message: 'Failed to list models' } },
        500,
      )
    }
    return c.json({ error: { type: 'internal_error', message: 'Failed to list models' } }, 500)
  }
})

/**
 * GET /v1/models/:id — 单模型查询（Hermes 本地探测路径 C）。
 * 必须始终返回 JSON：未知模型也返回 JSON 404（否则 Hermes 抛
 * JSONDecodeError 被 except 吞掉，整条本地探测链终止）。
 * 路由注册先于 createEngine 中的 SPA serveStatic，不会落 SPA 兜底。
 */
gatewayRoutes.get('/models/:id{.+}', async (c) => {
  const startTime = Date.now()
  const virtualKey = c.get('virtualKey')
  const modelId = c.req.param('id')
  const clientIp = resolveClientIp(c)
  const userAgent = c.req.header('user-agent') || 'unknown'

  try {
    const models = await fetchAccessibleModels(virtualKey)
    const match = models.find((m) => m.name === modelId)
    const entry = match ? toModelSchema(match) : null

    await logRequest({
      virtualKey,
      modelName: modelId,
      status: entry ? 'success' : 'failure',
      statusCode: entry ? 200 : 404,
      responseTimeMs: Date.now() - startTime,
      clientIp,
      userAgent,
      requestPath: c.req.path,
      requestMethod: 'GET',
      streaming: false,
      incomingProtocol: 'openai',
    })

    if (!entry) {
      return c.json(
        {
          error: {
            message: 'model_not_found',
            type: 'invalid_request_error',
            code: 'model_not_found',
          },
        },
        404,
      )
    }
    return c.json(entry)
  } catch (error) {
    logger.error({ error, modelId }, 'Single model lookup error')
    return c.json(
      {
        error: { message: 'Failed to get model', type: 'internal_error', code: 'internal_error' },
      },
      500,
    )
  }
})

export default gatewayRoutes
