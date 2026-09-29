import { afterEach, describe, expect, it } from 'bun:test'

import { createProxyTestEnv, type ProxyTestEnv } from '../test/proxy-test-helpers'

describe('JEV System One proxy', () => {
  let env: ProxyTestEnv | undefined

  afterEach(async () => {
    await env?.close()
    env = undefined
  })

  it('routes and transparently forwards a System One request', async () => {
    env = await createProxyTestEnv({ protocol: 'jev', accessModelName: 'jev-router' })
    env.upstream.setResponse(200, {
      model: 'jev-latest',
      answers: {
        route: {
          type: 'choice',
          choice: 'technical',
          probabilities: { technical: 0.92, billing: 0.08 },
          confidence: 0.92,
        },
      },
      usage: { input_tokens: 24, output_tokens: 0 },
      metadata: { inference_ms: 9 },
    })

    const response = await env.proxySystemOne({
      model: 'jev-router',
      state: 'The checkout page returns 500.',
      questions: {
        route: {
          type: 'choice',
          instructions: 'Select the responsible team.',
          criteria: { technical: 'Technical incident', billing: 'Billing issue' },
        },
      },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ answers: { route: { choice: 'technical' } } })
    const upstreamRequest = env.upstream.lastRequest()
    expect(new URL(upstreamRequest.url).pathname).toBe('/v1/systemone')
    expect(upstreamRequest.headers.authorization).toBe('Bearer sk-test-upstream-key')
    expect(upstreamRequest.body).toMatchObject({
      model: 'jev-latest',
      state: 'The checkout page returns 500.',
    })
  })

  it('does not route a JEV request through a chat model group', async () => {
    env = await createProxyTestEnv({
      protocol: 'jev',
      accessModelName: 'jev-router',
      category: 'chat',
    })

    const response = await env.proxySystemOne({
      model: 'jev-router',
      state: 'The checkout page returns 500.',
      questions: { route: { type: 'noul', instructions: 'Is this technical?' } },
    })

    expect(response.status).toBe(404)
    expect(env.upstream.receivedRequests).toHaveLength(0)
  })
})
