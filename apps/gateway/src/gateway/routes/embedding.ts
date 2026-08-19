import { Hono } from 'hono'

import type { VirtualKey } from '@xartifact/x-herald-db'

import { handleEmbeddingRequest } from '../handlers/openai/embedding-handler'

const embeddingRoutes = new Hono<{
  Variables: {
    virtualKey: VirtualKey
  }
}>()

/**
 * OpenAI Embeddings 兼容端点（透传，无转换）
 */
embeddingRoutes.post('/embeddings', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  return handleEmbeddingRequest(c, body)
})

export default embeddingRoutes
