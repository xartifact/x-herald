import { Hono } from 'hono'

import logger from '../lib/logger'
import type { VirtualKey } from '@xartifact/x-llm-gateway-db'

import { virtualKeyMiddleware } from '../middleware/virtual-key'
import actuatorRoutes from './routes/actuator'
import anthropicRoutes from './routes/anthropic'
import openaiRoutes from './routes/openai'
import { logRequest } from './services/log-service'
import { fetchAccessibleModels } from './services/model-list'

const gatewayRoutes = new Hono<{
  Variables: {
    virtualKey: VirtualKey
  }
}>()

gatewayRoutes.use('*', virtualKeyMiddleware)

gatewayRoutes.route('/', actuatorRoutes)
gatewayRoutes.route('/', openaiRoutes)
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

    if (protocol === 'anthropic') {
      const data = models.map((m) => {
        const entry: Record<string, unknown> = {
          type: 'model' as const,
          id: m.name,
          display_name: m.displayName || m.name,
          created_at: new Date(m.createdAt).toISOString(),
        }
        if (m.capabilities) {
          if (m.capabilities.contextWindow) entry.context_window = m.capabilities.contextWindow
          if (m.capabilities.maxOutputTokens)
            entry.max_output_tokens = m.capabilities.maxOutputTokens
        }
        return entry
      })
      return c.json({
        data,
        has_more: false,
        first_id: data[0]?.id ?? null,
        last_id: data[data.length - 1]?.id ?? null,
      })
    }

    const data = models.map((m) => {
      const entry: Record<string, unknown> = {
        id: m.name,
        object: 'model' as const,
        created: Math.floor(new Date(m.createdAt).getTime() / 1000),
        owned_by: 'x-llm-gateway',
      }
      if (m.capabilities) {
        if (m.capabilities.contextWindow) entry.context_window = m.capabilities.contextWindow
        if (m.capabilities.maxOutputTokens) entry.max_output_tokens = m.capabilities.maxOutputTokens
        entry.capabilities = {
          streaming: m.capabilities.streaming,
          function_calling: m.capabilities.functionCalling,
          vision: m.capabilities.vision,
          json_mode: m.capabilities.jsonMode,
          reasoning: m.capabilities.reasoning,
        }
      }
      return entry
    })
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

export default gatewayRoutes
