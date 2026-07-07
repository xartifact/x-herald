import { Hono } from 'hono'

import type { VirtualKey } from '@xartifact/x-llm-gateway-db'

import { fetchAccessibleModels } from '../services/model-list'

const actuatorRoutes = new Hono<{
  Variables: {
    virtualKey: VirtualKey
  }
}>()

/**
 * GET /v1/actuator
 * 网关能力自描述端点，类似 Spring Boot Actuator
 * 返回当前网关支持的协议、端点、特性
 */
actuatorRoutes.get('/actuator', (c) => {
  return c.json({
    gateway: {
      name: 'x-llm-gateway',
      description: 'Unified LLM Gateway with multi-protocol support',
    },
    protocols: [
      {
        name: 'openai',
        description: 'OpenAI-compatible API',
        endpoints: [
          { method: 'GET', path: '/v1/models', description: 'List accessible models' },
          {
            method: 'POST',
            path: '/v1/chat/completions',
            description: 'Chat completion (streaming supported)',
          },
          { method: 'POST', path: '/v1/responses', description: 'Responses API (OpenAI beta)' },
        ],
      },
      {
        name: 'anthropic',
        description: 'Anthropic-compatible API',
        endpoints: [
          { method: 'GET', path: '/v1/models', description: 'List accessible models' },
          {
            method: 'POST',
            path: '/v1/messages',
            description: 'Messages API (streaming supported)',
          },
          {
            method: 'POST',
            path: '/v1/messages/count_tokens',
            description: 'Count tokens (proxied to provider)',
          },
        ],
      },
    ],
    features: {
      streaming: true,
      toolUse: true,
      vision: true,
      retries: true,
      virtualModels: true,
      routingRules: true,
      protocolBridge: true,
    },
    introspection: {
      endpoints: [
        { method: 'GET', path: '/v1/actuator', description: 'This endpoint' },
        {
          method: 'GET',
          path: '/v1/actuator/models',
          description: 'Accessible models for current key',
        },
      ],
    },
  })
})

/**
 * GET /v1/actuator/models
 * 列出当前 virtualKey 可访问的模型（含元数据）
 */
actuatorRoutes.get('/actuator/models', async (c) => {
  const virtualKey = c.get('virtualKey')

  try {
    const models = await fetchAccessibleModels(virtualKey)

    return c.json({
      count: models.length,
      models: models.map((m) => ({
        name: m.name,
        displayName: m.displayName,
        createdAt: new Date(m.createdAt).toISOString(),
      })),
    })
  } catch {
    return c.json({ error: 'Failed to fetch models' }, 500)
  }
})

export default actuatorRoutes
