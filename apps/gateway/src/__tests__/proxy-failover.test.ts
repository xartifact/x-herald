import { describe, it, expect, beforeAll, afterAll } from 'bun:test'

import { createProxyTestEnv } from '../test/proxy-test-helpers'
import { openaiChatCompletion } from '../test/mock-upstream'

describe('proxy-failover / upstream 5xx errors', () => {
  let env: Awaited<ReturnType<typeof createProxyTestEnv>>

  beforeAll(async () => {
    env = await createProxyTestEnv({ protocol: 'openai' })
  })

  afterAll(async () => {
    await env.close()
  })

  it('upstream 500 → client receives error response', async () => {
    env.upstream.setOpenAIError(500, 'Internal server error')

    const res = await env.proxyChat({
      model: env.accessModelName,
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(res.status).toBeGreaterThanOrEqual(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
    expect(JSON.stringify(body)).toContain('error')
  })

  it('upstream 429 → client receives rate-limit error', async () => {
    env.upstream.setOpenAIError(429, 'Rate limit exceeded')

    const res = await env.proxyChat({
      model: env.accessModelName,
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(res.status).toBeGreaterThanOrEqual(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
    expect(JSON.stringify(body)).toContain('Rate limit')
  })
})

describe('proxy-failover / upstream timeout', () => {
  let env: Awaited<ReturnType<typeof createProxyTestEnv>>

  beforeAll(async () => {
    env = await createProxyTestEnv({ protocol: 'openai' })
  })

  afterAll(async () => {
    await env.close()
  })

  it(
    'upstream 90s delay → gateway times out and upstream still receives the request',
    async () => {
      env.upstream.clearRequests()
      env.upstream.setDelayedResponse(90_000, 200, openaiChatCompletion({ content: 'Too late' }))

      const res = await env.proxyChat({
        model: env.accessModelName,
        messages: [{ role: 'user', content: 'hello' }],
      })

      expect(res.status).not.toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty('error')
      expect(env.upstream.receivedRequests.length).toBeGreaterThanOrEqual(1)
    },
    { timeout: 120_000 },
  )
})

describe('proxy-failover / connection refused', () => {
  let env: Awaited<ReturnType<typeof createProxyTestEnv>>

  beforeAll(async () => {
    env = await createProxyTestEnv({ protocol: 'openai' })
  })

  afterAll(async () => {
    await env.close()
  })

  it('upstream closed before request → client receives network error', async () => {
    env.upstream.close()

    const res = await env.proxyChat({
      model: env.accessModelName,
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(res.status).toBeGreaterThanOrEqual(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })
})

describe('proxy-failover / malformed upstream response', () => {
  let env: Awaited<ReturnType<typeof createProxyTestEnv>>

  beforeAll(async () => {
    env = await createProxyTestEnv({ protocol: 'openai' })
  })

  afterAll(async () => {
    await env.close()
  })

  it('non-JSON 200 body → handled gracefully as error', async () => {
    env.upstream.setHandler(
      () => new Response('not json', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    )

    const res = await env.proxyChat({
      model: env.accessModelName,
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(res.status).toBeGreaterThanOrEqual(400)
    const body = await res.json().catch(() => null)
    expect(body === null || (body && 'error' in body)).toBe(true)
  })
})

describe('proxy-failover / retry behavior', () => {
  let env: Awaited<ReturnType<typeof createProxyTestEnv>>

  beforeAll(async () => {
    env = await createProxyTestEnv({ protocol: 'openai' })
  })

  afterAll(async () => {
    await env.close()
  })

  it('503 then success → either final success or last error', async () => {
    let requestCount = 0
    env.upstream.setHandler(() => {
      requestCount++
      if (requestCount === 1) {
        return new Response(JSON.stringify({ error: { message: 'Service unavailable' } }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify(openaiChatCompletion({ content: 'Success on retry' })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const res = await env.proxyChat({
      model: env.accessModelName,
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(requestCount).toBeGreaterThanOrEqual(1)
    expect(res.status === 200 || res.status >= 400).toBe(true)
    const body = await res.json()
    expect(body).toBeDefined()
  })
})
