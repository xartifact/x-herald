import { describe, it, expect, beforeAll, afterAll } from 'bun:test'

import {
  openaiChatCompletion,
  openaiChatCompletionChunks,
  anthropicMessages,
} from '../test/mock-upstream'
import { createProxyTestEnv } from '../test/proxy-test-helpers'
import type { ProxyTestEnv } from '../test/proxy-test-helpers'

async function readSSEStream(res: Response): Promise<string> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let result = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value, { stream: true })
  }
  return result
}

interface OpenAIChunk {
  object?: string
  choices?: Array<{ delta?: { content?: string; role?: string }; finish_reason?: string | null }>
}

function parseOpenAIContent(text: string): string {
  let content = ''
  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue
    const data = line.slice(5).trim()
    if (data === '[DONE]') continue
    try {
      const chunk = JSON.parse(data) as OpenAIChunk
      content += chunk.choices?.[0]?.delta?.content ?? ''
    } catch {}
  }
  return content
}

function enableSameProtocolPassthrough() {
  process.env.GATEWAY_SAME_PROTOCOL_PASSTHROUGH = 'true'
}

function disableSameProtocolPassthrough() {
  delete process.env.GATEWAY_SAME_PROTOCOL_PASSTHROUGH
}

describe('OpenAI proxy passthrough', () => {
  let env: ProxyTestEnv

  beforeAll(async () => {
    enableSameProtocolPassthrough()
    env = await createProxyTestEnv({ protocol: 'openai', providerApiKey: 'sk-test-upstream-key' })
  })

  afterAll(async () => {
    disableSameProtocolPassthrough()
    await env.close()
  })

  it('non-streaming chat completion returns OpenAI response', async () => {
    env.upstream.setResponse(200, openaiChatCompletion({ content: 'Hello from OpenAI' }))

    const res = await env.proxyChat({
      model: env.accessModelName,
      messages: [{ role: 'user', content: 'Hi' }],
    })

    expect(res.status).toBe(200)

    const body = (await res.json()) as Record<string, unknown>
    expect(Array.isArray(body.choices)).toBe(true)
    expect((body.choices as Array<{ message: { content: string } }>)[0].message.content).toBe(
      'Hello from OpenAI',
    )

    const upstreamReq = env.upstream.lastRequest()
    expect((upstreamReq.body as { model: string }).model).toBe('gpt-4-turbo')
    expect(upstreamReq.headers['authorization']).toBe('Bearer sk-test-upstream-key')
  })

  it('streaming chat completion returns SSE', async () => {
    env.upstream.setStreamResponse(openaiChatCompletionChunks({ content: 'Hello world' }))

    const res = await env.proxyChat({
      model: env.accessModelName,
      messages: [{ role: 'user', content: 'Hi' }],
      stream: true,
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/i)

    const body = await readSSEStream(res)
    expect(body).toContain('data:')
    expect(body).toContain('[DONE]')
    expect(parseOpenAIContent(body)).toBe('Hello world')
  })
})

describe('OpenAI → Anthropic cross-protocol conversion', () => {
  let env: ProxyTestEnv

  beforeAll(async () => {
    env = await createProxyTestEnv({ protocol: 'anthropic' })
  })

  afterAll(async () => {
    await env.close()
  })

  it('converts OpenAI client format to Anthropic upstream and back', async () => {
    env.upstream.setResponse(200, anthropicMessages({ content: 'Hello from Anthropic' }))

    const res = await env.proxyChat({
      model: env.accessModelName,
      messages: [{ role: 'user', content: 'Hi' }],
    })

    expect(res.status).toBe(200)

    const body = (await res.json()) as Record<string, unknown>
    expect(Array.isArray(body.choices)).toBe(true)
    expect((body.choices as Array<{ message: { content: string } }>)[0].message.content).toBe(
      'Hello from Anthropic',
    )
    expect(body).not.toHaveProperty('content')

    const upstreamReq = env.upstream.lastRequest()
    const upstreamBody = upstreamReq.body as { model: string; messages: unknown[] }
    expect(upstreamBody.model).toBe('claude-3-5-sonnet-20241022')
    expect(Array.isArray(upstreamBody.messages)).toBe(true)
    expect(upstreamReq.headers['anthropic-version']).toBeDefined()
  })
})

describe('Anthropic proxy passthrough', () => {
  let env: ProxyTestEnv

  beforeAll(async () => {
    enableSameProtocolPassthrough()
    env = await createProxyTestEnv({ protocol: 'anthropic' })
  })

  afterAll(async () => {
    disableSameProtocolPassthrough()
    await env.close()
  })

  it('non-streaming messages returns Anthropic response', async () => {
    env.upstream.setResponse(200, anthropicMessages({ content: 'Hello from Anthropic' }))

    const res = await env.proxyMessages({
      model: env.accessModelName,
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 100,
    })

    expect(res.status).toBe(200)

    const body = (await res.json()) as Record<string, unknown>
    expect(Array.isArray(body.content)).toBe(true)
    expect((body.content as Array<{ type: string; text: string }>)[0].type).toBe('text')
    expect((body.content as Array<{ type: string; text: string }>)[0].text).toBe(
      'Hello from Anthropic',
    )

    const upstreamReq = env.upstream.lastRequest()
    const upstreamBody = upstreamReq.body as { model: string; messages: unknown[] }
    expect(upstreamBody.model).toBe('claude-3-5-sonnet-20241022')
    expect(Array.isArray(upstreamBody.messages)).toBe(true)
  })
})

describe('Anthropic → OpenAI cross-protocol conversion', () => {
  let env: ProxyTestEnv

  beforeAll(async () => {
    env = await createProxyTestEnv({ protocol: 'openai', accessModelName: 'claude-3-5-sonnet' })
  })

  afterAll(async () => {
    await env.close()
  })

  it('converts Anthropic client format to OpenAI upstream and back', async () => {
    env.upstream.setResponse(200, openaiChatCompletion({ content: 'Hello from OpenAI' }))

    const res = await env.proxyMessages({
      model: env.accessModelName,
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 100,
    })

    expect(res.status).toBe(200)

    const body = (await res.json()) as Record<string, unknown>
    expect(Array.isArray(body.content)).toBe(true)
    expect((body.content as Array<{ type: string; text: string }>)[0].type).toBe('text')
    expect((body.content as Array<{ type: string; text: string }>)[0].text).toBe(
      'Hello from OpenAI',
    )
    expect(body).not.toHaveProperty('choices')

    const upstreamReq = env.upstream.lastRequest()
    const upstreamBody = upstreamReq.body as { model: string; messages: unknown[] }
    expect(upstreamBody.model).toBe('gpt-4-turbo')
    expect(Array.isArray(upstreamBody.messages)).toBe(true)
  })
})

describe('virtual key authentication', () => {
  let env: ProxyTestEnv

  beforeAll(async () => {
    env = await createProxyTestEnv({ protocol: 'openai' })
  })

  afterAll(async () => {
    await env.close()
  })

  it('returns 401 without Authorization header', async () => {
    const res = await env.app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.accessModelName,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    })

    expect(res.status).toBe(401)
  })

  it('returns 401 with invalid key', async () => {
    const res = await env.proxyChat(
      {
        model: env.accessModelName,
        messages: [{ role: 'user', content: 'Hi' }],
      },
      { Authorization: 'Bearer invalid-key' },
    )

    expect(res.status).toBe(401)
  })
})
