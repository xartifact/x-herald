import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { openaiChatCompletionChunks, anthropicMessagesChunks } from '../test/mock-upstream'
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
    } catch {
      void 0
    }
  }
  return content
}

interface AnthropicDelta {
  type: string
  delta?: { text?: string; stop_reason?: string }
}

function parseAnthropicStream(text: string): { content: string; hasStop: boolean } {
  let content = ''
  let hasStop = false
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.startsWith('event:')) continue
    const event = line.slice(6).trim()
    if (event === 'message_stop') hasStop = true
    const dataLine = lines[i + 1]
    if (!dataLine?.startsWith('data:')) continue
    try {
      const data = JSON.parse(dataLine.slice(5).trim()) as AnthropicDelta
      if (data.type === 'content_block_delta') {
        content += data.delta?.text ?? ''
      }
    } catch {
      void 0
    }
  }
  return { content, hasStop }
}

describe('OpenAI SSE streaming passthrough', () => {
  let env: ProxyTestEnv

  beforeAll(async () => {
    env = await createProxyTestEnv({ protocol: 'openai' })
  })

  afterAll(async () => {
    await env.close()
  })

  it('proxies stream: true to an OpenAI upstream and returns SSE', async () => {
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
    const content = parseOpenAIContent(body)
    expect(content).toBe('Hello world')
  })
})

describe('Anthropic SSE streaming passthrough', () => {
  let env: ProxyTestEnv

  beforeAll(async () => {
    env = await createProxyTestEnv({ protocol: 'anthropic' })
  })

  afterAll(async () => {
    await env.close()
  })

  it('proxies stream: true to an Anthropic upstream and returns SSE', async () => {
    env.upstream.setStreamResponse(anthropicMessagesChunks({ content: 'Hi there' }))

    const res = await env.proxyMessages({
      model: env.accessModelName,
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 100,
      stream: true,
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/i)

    const body = await readSSEStream(res)
    expect(body).toContain('event:')
    expect(body).toContain('data:')
    const { content, hasStop } = parseAnthropicStream(body)
    expect(hasStop).toBe(true)
    expect(content).toBe('Hi there')
  })
})

describe('OpenAI → Anthropic cross-protocol streaming', () => {
  let env: ProxyTestEnv

  beforeAll(async () => {
    env = await createProxyTestEnv({ protocol: 'anthropic' })
  })

  afterAll(async () => {
    await env.close()
  })

  it('converts Anthropic upstream SSE into OpenAI SSE format', async () => {
    env.upstream.setStreamResponse(anthropicMessagesChunks({ content: 'Cross-protocol' }))

    const res = await env.proxyChat({
      model: env.accessModelName,
      messages: [{ role: 'user', content: 'Hi' }],
      stream: true,
    })

    expect(res.status).toBe(200)

    const body = await readSSEStream(res)
    expect(body).toContain('data:')
    expect(body).toContain('chat.completion.chunk')
    expect(body).toContain('[DONE]')
    const content = parseOpenAIContent(body)
    expect(content).toBe('Cross-protocol')
  })
})

describe('Anthropic → OpenAI cross-protocol streaming', () => {
  let env: ProxyTestEnv

  beforeAll(async () => {
    env = await createProxyTestEnv({ protocol: 'openai', accessModelName: 'claude-test' })
  })

  afterAll(async () => {
    await env.close()
  })

  it('converts OpenAI upstream SSE into Anthropic SSE format', async () => {
    env.upstream.setStreamResponse(openaiChatCompletionChunks({ content: 'Reverse convert' }))

    const res = await env.proxyMessages({
      model: env.accessModelName,
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 100,
      stream: true,
    })

    expect(res.status).toBe(200)

    const body = await readSSEStream(res)
    expect(body).toContain('event:')
    expect(body).toContain('data:')
    expect(body).toContain('message_start')
    const { content, hasStop } = parseAnthropicStream(body)
    expect(hasStop).toBe(true)
    expect(content).toBe('Reverse convert')
  })
})
