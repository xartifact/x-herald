/**
 * Regression: Anthropic count_tokens must not double the API version segment.
 *
 * Provider base URLs are user-supplied and very often already end in `/v1`
 * (`https://api.anthropic.com/v1`). The route used to concatenate
 * `${baseUrl}/v1/messages/count_tokens`, producing `/v1/v1/...` — a path no
 * upstream serves, so every count_tokens call failed with 404 while the
 * messages path (which goes through joinUrl) kept working.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import { eq } from '@xartifact/x-herald-db'
import { providers } from '@xartifact/x-herald-db'

import { getDatabase } from '../db/client'
import { createProxyTestEnv, type ProxyTestEnv } from '../test/proxy-test-helpers'

describe('Anthropic count_tokens upstream path', () => {
  let env: ProxyTestEnv

  beforeAll(async () => {
    env = await createProxyTestEnv({ protocol: 'anthropic' })
    // 真实上游几乎都自带版本段；这正是触发 `/v1/v1` 的配置形态。
    await getDatabase()
      .update(providers)
      .set({
        protocols: {
          anthropic: { baseUrl: `${env.upstream.url}/v1`, enabled: true },
        },
      })
      .where(eq(providers.id, env.providerId))
  })

  afterAll(async () => {
    await env.close()
  })

  it('hits the upstream at a single /v1 and forwards the token count', async () => {
    env.upstream.setResponse(200, { input_tokens: 42 })

    const res = await env.proxyCountTokens(
      { model: env.accessModelName, messages: [{ role: 'user', content: 'hello world' }] },
      { 'anthropic-version': '2023-06-01' },
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ input_tokens: 42 })

    const upstreamUrl = new URL(env.upstream.lastRequest().url)
    expect(upstreamUrl.pathname).toBe('/v1/messages/count_tokens')

    // 模型名必须换成上游真实名，否则上游会把它当成不存在的模型。
    const upstreamBody = env.upstream.lastRequest().body as { model: string }
    expect(upstreamBody.model).toBe('claude-3-5-sonnet-20241022')
  })

  it('keeps a bare host base URL working (no version segment to dedupe)', async () => {
    await getDatabase()
      .update(providers)
      .set({ protocols: { anthropic: { baseUrl: env.upstream.url, enabled: true } } })
      .where(eq(providers.id, env.providerId))
    env.upstream.setResponse(200, { input_tokens: 7 })

    const res = await env.proxyCountTokens({
      model: env.accessModelName,
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(res.status).toBe(200)
    expect(new URL(env.upstream.lastRequest().url).pathname).toBe('/v1/messages/count_tokens')
  })
})
