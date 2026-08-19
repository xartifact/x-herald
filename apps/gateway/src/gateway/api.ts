import { Hono } from 'hono'

import logger from '../lib/logger'
import type { VirtualKey } from '@xartifact/x-herald-db'

import { virtualKeyMiddleware } from '../middleware/virtual-key'
import actuatorRoutes from './routes/actuator'
import anthropicRoutes from './routes/anthropic'
import embeddingRoutes from './routes/embedding'
import openaiRoutes from './routes/openai'
import { logRequest } from './services/log-service'
import { fetchAccessibleModels, type AccessibleModel } from './services/model-list'
import type { ModelSchema } from '@xartifact/x-herald-shared'

const ID_PATTERN = /^[A-Za-z0-9._:/\\-]+$/

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
    entry.reasoning = caps.reasoning
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
  const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
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
  const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
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
