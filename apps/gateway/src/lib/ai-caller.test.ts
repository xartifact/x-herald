import { describe, it, expect, beforeAll, afterAll, beforeEach, mock, spyOn } from 'bun:test'

import { setupCrudTest, teardownCrudTest, type CrudTestContext } from '../test/crud-helper'

const mockGetAiModel = mock(async () => ({
  actualModelName: 'gpt-4o',
  apiKey: 'sk-test',
  baseUrl: 'https://api.example.com',
}))

mock.module('./ai-caller', () => {
  const { callAI, AiNotConfiguredError, CONFIG_KEY_AI_MODEL } = require('./ai-caller')
  return {
    callAI,
    AiNotConfiguredError,
    CONFIG_KEY_AI_MODEL,
    getAiModel: mockGetAiModel,
  }
})

const { callAI, AiNotConfiguredError, CONFIG_KEY_AI_MODEL } = await import('./ai-caller')
const { createLLMAdapter } = await import('./llm-adapter')

let ctx: CrudTestContext

beforeAll(async () => {
  ctx = await setupCrudTest()
})

afterAll(async () => {
  await teardownCrudTest()
})

describe('AiNotConfiguredError', () => {
  it('sets the name and message', () => {
    const err = new AiNotConfiguredError()
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('AiNotConfiguredError')
    expect(err.message).toMatch(/AI model/i)
  })
})

describe('callAI', () => {
  let fetchSpy: ReturnType<typeof spyOn>

  beforeAll(() => {
    fetchSpy = spyOn(globalThis, 'fetch')
  })

  afterAll(() => {
    fetchSpy.mockRestore()
  })

  beforeEach(() => {
    mockGetAiModel.mockResolvedValue({
      actualModelName: 'gpt-4o',
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.com',
    })
    fetchSpy.mockReset()
  })

  it('sends a POST to the base URL with the chat completions path', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })),
    )

    await callAI([{ role: 'user', content: 'hi' }])

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.com/chat/completions')
    expect(init.method).toBe('POST')
  })

  it('sends the correct headers including Authorization', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })),
    )

    await callAI([{ role: 'user', content: 'hi' }])

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['Authorization']).toBe('Bearer sk-test')
  })

  it('omits the Authorization header when the API key is null', async () => {
    mockGetAiModel.mockResolvedValueOnce({
      actualModelName: 'gpt-4o',
      apiKey: null,
      baseUrl: 'https://api.example.com',
    })
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })),
    )

    await callAI([{ role: 'user', content: 'hi' }])

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
  })

  it('appends /chat/completions to the base URL', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })),
    )

    await callAI([{ role: 'user', content: 'hi' }])

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.com/chat/completions')
  })

  it('includes the model name and messages in the body', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })),
    )

    await callAI([{ role: 'user', content: 'hello' }])

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('gpt-4o')
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }])
    expect(body.stream).toBe(false)
  })

  it('uses the default max_tokens of 2048', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })),
    )

    await callAI([{ role: 'user', content: 'hi' }])

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.max_tokens).toBe(2048)
  })

  it('honors a custom maxTokens override', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })),
    )

    await callAI([{ role: 'user', content: 'hi' }], { maxTokens: 512 })

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.max_tokens).toBe(512)
  })

  it('includes tools in the body when provided', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })),
    )

    const tools = [
      {
        type: 'function' as const,
        function: { name: 'get_weather', parameters: {} },
      },
    ]
    await callAI([{ role: 'user', content: 'hi' }], { tools })

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body).toHaveProperty('tools')
    expect(body.tools).toHaveLength(1)
    expect(body.tools[0].function.name).toBe('get_weather')
  })

  it('omits the tools field when the tools array is empty', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })),
    )

    await callAI([{ role: 'user', content: 'hi' }], { tools: [] })

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body).not.toHaveProperty('tools')
  })

  it('returns the message content from the response', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'hello back' } }] }),
      ),
    )

    const result = await callAI([{ role: 'user', content: 'hi' }])
    expect(result.content).toBe('hello back')
    expect(result.tool_calls).toBeUndefined()
  })

  it('returns tool_calls from the response when present', async () => {
    const toolCall = {
      id: '1',
      type: 'function' as const,
      function: { name: 'x', arguments: '{}' },
    }
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: null, tool_calls: [toolCall] } }],
        }),
      ),
    )

    const result = await callAI([{ role: 'user', content: 'hi' }])
    expect(result.tool_calls).toEqual([toolCall])
    expect(result.content).toBe('')
  })

  it('throws when the provider returns a non-2xx response', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))

    expect(callAI([{ role: 'user', content: 'hi' }])).rejects.toThrow(/502/)
  })

  it('throws when the response has no content and no tool_calls', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: {} }] })))

    expect(callAI([{ role: 'user', content: 'hi' }])).rejects.toThrow(/empty response/i)
  })
})

describe('createLLMAdapter', () => {
  it('returns an object with a chat method', () => {
    const adapter = createLLMAdapter()
    expect(adapter).toBeDefined()
    expect(typeof adapter.chat).toBe('function')
  })
})
