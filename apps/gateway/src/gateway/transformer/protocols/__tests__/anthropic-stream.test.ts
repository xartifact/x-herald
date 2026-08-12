/**
 * Anthropic 流式转换测试
 * 测试 Anthropic SSE 与标准格式之间的双向转换
 */

import { describe, it, expect } from 'bun:test'

import type { TransformerContext } from '@xartifact/x-herald-shared'

interface ChatCompletionChunk {
  object?: string
  id?: string
  model?: string
  choices?: Array<{
    index?: number
    delta?: { role?: string; content?: string }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

interface AnthropicEventData {
  type?: string
  message?: {
    role?: string
    usage?: { input_tokens?: number }
  }
  content_block?: { type?: string }
  delta?: {
    type?: string
    text?: string
    stop_reason?: string
  }
  usage?: { output_tokens?: number }
}

const { AnthropicTransformer } = await import('../anthropic?v=1')

// 创建模拟的 TransformerContext
function createMockContext(direction?: 'normalize' | 'adapt'): TransformerContext {
  const state = new Map<string, unknown>()
  if (direction) {
    state.set('streamDirection', direction)
  }

  return {
    state,
    getProvider: () => ({
      id: 'test-provider',
      name: 'Test Provider',
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
      protocol: 'anthropic',
      modelMappings: {},
      enabled: true,
      priority: 1,
      rateLimitPerMinute: null,
      rateLimitPerDay: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  }
}

// 辅助函数：创建 SSE 流
function createSSEStream(events: Array<{ type: string; data: unknown }>): ReadableStream {
  const encoder = new TextEncoder()

  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`event: ${event.type}\n`))
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event.data)}\n\n`))
      }
      controller.close()
    },
  })
}

// 辅助函数：创建标准格式 SSE 流
function createStandardStream(chunks: unknown[]): ReadableStream {
  const encoder = new TextEncoder()

  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
}

// 辅助函数：读取流内容
async function readStream(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let result = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      result += decoder.decode(value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }

  return result
}

// 辅助函数：解析 SSE 流为事件数组
function parseSSE(sseText: string): Array<{ event?: string; data: unknown }> {
  const lines = sseText.split('\n')
  const events: Array<{ event?: string; data: unknown }> = []
  let currentEvent: string | undefined
  let currentData: string | undefined

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7).trim()
    } else if (line.startsWith('data: ')) {
      currentData = line.slice(6).trim()
    } else if (line === '' && currentData) {
      // 事件结束
      try {
        events.push({
          event: currentEvent,
          data: currentData === '[DONE]' ? '[DONE]' : JSON.parse(currentData),
        })
      } catch {
        // 忽略解析错误
      }
      currentEvent = undefined
      currentData = undefined
    }
  }

  return events
}

describe('AnthropicTransformer - Stream Transformation', () => {
  const transformer = new AnthropicTransformer()

  describe('Normalize: Anthropic → Standard', () => {
    it('应该将 message_start 转换为标准格式', async () => {
      const anthropicEvents = [
        {
          type: 'message_start',
          data: {
            type: 'message_start',
            message: {
              id: 'msg_123',
              type: 'message',
              role: 'assistant',
              model: 'claude-3-5-sonnet-20241022',
              content: [],
              usage: { input_tokens: 10, output_tokens: 0 },
            },
          },
        },
      ]

      const stream = createSSEStream(anthropicEvents)
      const ctx = createMockContext('normalize')
      const transformedStream = await transformer.transformStream(stream, ctx)
      const result = await readStream(transformedStream)
      const events = parseSSE(result)

      // 应该有 2 个事件：转换后的 chunk + [DONE]
      expect(events.length).toBeGreaterThanOrEqual(1)

      const firstChunk = events[0].data
      expect(firstChunk).toHaveProperty('object', 'chat.completion.chunk')
      expect(firstChunk).toHaveProperty('id', 'msg_123')
      expect(firstChunk).toHaveProperty('model', 'claude-3-5-sonnet-20241022')
      expect(firstChunk).toHaveProperty('choices')
      expect((firstChunk as ChatCompletionChunk).choices[0].delta).toHaveProperty(
        'role',
        'assistant',
      )
      expect((firstChunk as ChatCompletionChunk).usage).toEqual({
        prompt_tokens: 10,
        completion_tokens: 0,
        total_tokens: 10,
      })
    })

    it('应该将 content_block_delta (文本) 转换为标准格式', async () => {
      const anthropicEvents = [
        {
          type: 'message_start',
          data: {
            type: 'message_start',
            message: {
              id: 'msg_123',
              model: 'claude-3-5-sonnet-20241022',
              usage: { input_tokens: 10, output_tokens: 0 },
            },
          },
        },
        {
          type: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
          },
        },
        {
          type: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: '你好' },
          },
        },
      ]

      const stream = createSSEStream(anthropicEvents)
      const ctx = createMockContext('normalize')
      const transformedStream = await transformer.transformStream(stream, ctx)
      const result = await readStream(transformedStream)
      const events = parseSSE(result)

      // 找到文本增量事件
      const textDelta = events.find(
        (e) => (e.data as ChatCompletionChunk).choices?.[0]?.delta?.content === '你好',
      )
      expect(textDelta).toBeDefined()
      expect((textDelta!.data as ChatCompletionChunk).object).toBe('chat.completion.chunk')
    })

    it('应该将 message_delta 转换为标准格式（带 finish_reason）', async () => {
      const anthropicEvents = [
        {
          type: 'message_delta',
          data: {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn' },
            usage: { output_tokens: 20 },
          },
        },
      ]

      const stream = createSSEStream(anthropicEvents)
      const ctx = createMockContext('normalize')
      const transformedStream = await transformer.transformStream(stream, ctx)
      const result = await readStream(transformedStream)
      const events = parseSSE(result)

      const deltaEvent = events.find((e) => e.data !== '[DONE]')
      expect(deltaEvent).toBeDefined()
      expect((deltaEvent!.data as ChatCompletionChunk).choices[0].finish_reason).toBe('stop')
      expect((deltaEvent!.data as ChatCompletionChunk).usage).toEqual({
        prompt_tokens: 0,
        completion_tokens: 20,
        total_tokens: 20,
      })
    })
  })

  describe('Adapt: Standard → Anthropic', () => {
    it('应该将标准格式转换为 message_start', async () => {
      const standardChunks = [
        {
          id: 'chatcmpl-123',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant' },
              finish_reason: null,
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 0,
            total_tokens: 10,
          },
        },
      ]

      const stream = createStandardStream(standardChunks)
      const ctx = createMockContext('adapt')
      const transformedStream = await transformer.transformStream(stream, ctx)
      const result = await readStream(transformedStream)
      const events = parseSSE(result)

      // 应该包含 message_start 事件
      const messageStart = events.find((e) => e.event === 'message_start')
      expect(messageStart).toBeDefined()
      expect((messageStart!.data as AnthropicEventData).type).toBe('message_start')
      expect((messageStart!.data as AnthropicEventData).message).toHaveProperty('role', 'assistant')
      expect((messageStart!.data as AnthropicEventData).message?.usage?.input_tokens).toBe(10)
    })

    it('应该将标准格式文本增量转换为 Anthropic SSE', async () => {
      const standardChunks = [
        {
          id: 'chatcmpl-123',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-123',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              delta: { content: '你好' },
              finish_reason: null,
            },
          ],
        },
      ]

      const stream = createStandardStream(standardChunks)
      const ctx = createMockContext('adapt')
      const transformedStream = await transformer.transformStream(stream, ctx)
      const result = await readStream(transformedStream)
      const events = parseSSE(result)

      // 应该包含 content_block_start 和 content_block_delta
      const contentStart = events.find((e) => e.event === 'content_block_start')
      expect(contentStart).toBeDefined()
      expect((contentStart!.data as AnthropicEventData).content_block?.type).toBe('text')

      const contentDelta = events.find(
        (e) =>
          e.event === 'content_block_delta' &&
          (e.data as AnthropicEventData).delta?.type === 'text_delta',
      )
      expect(contentDelta).toBeDefined()
      expect((contentDelta!.data as AnthropicEventData).delta?.text).toBe('你好')
    })

    it('应该将 finish_reason 转换为 Anthropic stop_reason', async () => {
      const standardChunks = [
        {
          id: 'chatcmpl-123',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-123',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
          },
        },
      ]

      const stream = createStandardStream(standardChunks)
      const ctx = createMockContext('adapt')
      const transformedStream = await transformer.transformStream(stream, ctx)
      const result = await readStream(transformedStream)
      const events = parseSSE(result)

      // 应该包含 message_delta 事件
      const messageDelta = events.find((e) => e.event === 'message_delta')
      expect(messageDelta).toBeDefined()
      expect((messageDelta!.data as AnthropicEventData).delta?.stop_reason).toBe('end_turn')
      expect((messageDelta!.data as AnthropicEventData).usage?.output_tokens).toBe(20)

      // 应该包含 message_stop 事件
      const messageStop = events.find((e) => e.event === 'message_stop')
      expect(messageStop).toBeDefined()
    })

    it('应该正确映射不同的 finish_reason', async () => {
      const testCases = [
        { input: 'stop', expected: 'end_turn' },
        { input: 'length', expected: 'max_tokens' },
        { input: 'tool_calls', expected: 'tool_use' },
        { input: 'content_filter', expected: 'stop_sequence' }, // Anthropic 没有 content_filter，映射为 stop_sequence
      ]

      for (const { input, expected } of testCases) {
        const standardChunks = [
          {
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: 'gpt-4',
            choices: [
              {
                index: 0,
                delta: { role: 'assistant' },
                finish_reason: null,
              },
            ],
          },
          {
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: 'gpt-4',
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: input,
              },
            ],
          },
        ]

        const stream = createStandardStream(standardChunks)
        const ctx = createMockContext('adapt')
        const transformedStream = await transformer.transformStream(stream, ctx)
        const result = await readStream(transformedStream)
        const events = parseSSE(result)

        const messageDelta = events.find((e) => e.event === 'message_delta')
        expect((messageDelta!.data as AnthropicEventData).delta?.stop_reason).toBe(expected)
      }
    })
  })
})
