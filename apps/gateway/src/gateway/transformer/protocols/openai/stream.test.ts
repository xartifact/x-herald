import { describe, it, expect } from 'bun:test'

import type { TransformerContext } from '@xartifact/x-herald-shared'

import { transformOpenAIStream } from './stream'

function createMockContext(): TransformerContext {
  return {
    request: { model: 'test-model', messages: [] },
    provider: {
      id: 'test-provider',
      name: 'Test Provider',
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
      protocol: 'openai',
      modelMappings: {},
      enabled: true,
      priority: 1,
      rateLimitPerMinute: null,
      rateLimitPerDay: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    model: 'test-model',
    headers: {},
    metadata: {},
    requestId: 'test-request-id',
    startTime: Date.now(),
    state: new Map<string, unknown>(),
  }
}

// 创建一个永不自然结束、但能记录 cancel(reason) 调用的上游流。
function createCancellableStream(onCancel: (reason: unknown) => void): ReadableStream {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            id: 'chatcmpl-1',
            created: 0,
            model: 'gpt-4',
            choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
          })}\n\n`,
        ),
      )
    },
    cancel(reason) {
      onCancel(reason)
    },
  })
}

describe('transformOpenAIStream - 取消传播', () => {
  it('下游 cancel() 必须转发给上游 reader.cancel()，否则 provider 侧连接不会被中止', async () => {
    let cancelReason: unknown
    const stream = createCancellableStream((reason) => {
      cancelReason = reason
    })
    const ctx = createMockContext()
    const transformedStream = transformOpenAIStream(stream, ctx)

    const reader = transformedStream.getReader()
    await reader.read() // 确保 start() 已经拿到 upstream reader
    await reader.cancel('client_disconnect')

    expect(cancelReason).toBe('client_disconnect')
  })
})
