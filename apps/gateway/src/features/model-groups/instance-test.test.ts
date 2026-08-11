import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import { modelInstances, providers } from '@xartifact/x-llm-gateway-db'

import { getDatabase } from '../../db/client'
import { createMockUpstream, openaiChatCompletion } from '../../test/mock-upstream'
import { createTestEngine, destroyTestEngine } from '../../test/setup'
import { testInstanceConnectivity } from './service'

describe('testInstanceConnectivity', () => {
  let upstream: ReturnType<typeof createMockUpstream>
  const providerId = crypto.randomUUID()
  const instanceId = crypto.randomUUID()
  const disabledInstanceId = crypto.randomUUID()

  beforeAll(async () => {
    await createTestEngine()
    upstream = createMockUpstream()
    const db = getDatabase()
    await db.insert(providers).values({
      id: providerId,
      name: 'Test Provider',
      apiKey: 'sk-test',
      protocols: { openai: { baseUrl: upstream.url, enabled: true } },
      enabled: true,
    })
    await db.insert(modelInstances).values([
      {
        id: instanceId,
        providerId,
        name: 'deepseek-v4-flash',
        actualModelName: 'deepseek-v4-flash',
        enabled: true,
      },
      {
        id: disabledInstanceId,
        providerId,
        name: 'disabled-model',
        actualModelName: 'disabled-model',
        enabled: false,
      },
    ])
  })

  afterAll(async () => {
    upstream.close()
    await destroyTestEngine()
  })

  it('200 上游响应 → ok, latency, model, snippet', async () => {
    upstream.setResponse(200, openaiChatCompletion({ content: 'pong', model: 'deepseek-v4-flash' }))
    const r = await testInstanceConnectivity(instanceId)
    expect(r.ok).toBe(true)
    expect(r.statusCode).toBe(200)
    expect(r.model).toBe('deepseek-v4-flash')
    expect(r.snippet).toBe('pong')
    expect(r.latencyMs).toBeGreaterThanOrEqual(0)
    expect(r.message).toContain('连通正常')
  })

  it('上游 404 → ok=false，携带 statusCode 与上游 message', async () => {
    upstream.setResponse(404, { error: { message: 'model not found' } })
    const r = await testInstanceConnectivity(instanceId)
    expect(r.ok).toBe(false)
    expect(r.statusCode).toBe(404)
    expect(r.message).toContain('model not found')
  })

  it('实例不存在 → ok=false', async () => {
    const r = await testInstanceConnectivity(crypto.randomUUID())
    expect(r.ok).toBe(false)
    expect(r.message).toBe('实例不存在')
  })

  it('实例已禁用 → ok=false', async () => {
    const r = await testInstanceConnectivity(disabledInstanceId)
    expect(r.ok).toBe(false)
    expect(r.message).toBe('实例已被禁用，无法测试')
  })
})
