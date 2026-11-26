import { describe, expect, it } from 'bun:test'

import type { StandardRequest, TransformerContext } from '@xartifact/x-herald-shared'

import { adaptOpenAIRequest } from './egress'

/**
 * 输出长度参数名必须能按实例配置切换。
 *
 * `gpt-6.2` 系列只接受 `max_completion_tokens`，发 `max_tokens` 会 400
 * `Unsupported parameter`。此前 egress 写死 `max_tokens`，等于网关对所有
 * 新模型都失效——连通性检查能复现，但真实代理请求同样会失败。
 */
function ctxWith(instanceConfig?: Record<string, unknown>): TransformerContext {
  return {
    request: { model: 'm', messages: [] } as unknown as StandardRequest,
    provider: { id: 'p', name: 'p', protocols: {} },
    model: 'm',
    headers: {},
    metadata: {},
    requestId: 'r1',
    startTime: Date.now(),
    state: new Map(),
    ...(instanceConfig && { instanceConfig }),
  } as unknown as TransformerContext
}

const request = {
  model: 'gpt-6.2-sol',
  messages: [{ role: 'user', content: 'hi' }],
  max_tokens: 1234,
} as unknown as StandardRequest

describe('openai egress / max tokens field', () => {
  it('sends max_tokens by default (backward compatible)', async () => {
    const { body } = await adaptOpenAIRequest(request, ctxWith())
    const sent = body as Record<string, unknown>
    expect(sent.max_tokens).toBe(1234)
    expect(sent.max_completion_tokens).toBeUndefined()
  })

  it('sends max_completion_tokens when the instance declares it', async () => {
    const { body } = await adaptOpenAIRequest(
      request,
      ctxWith({ maxTokensField: 'max_completion_tokens' }),
    )
    const sent = body as Record<string, unknown>
    expect(sent.max_completion_tokens).toBe(1234)
    // 两个都发会让上游仍然报 unsupported parameter
    expect(sent.max_tokens).toBeUndefined()
  })

  it('ignores unrecognized maxTokensField values', async () => {
    // 拼错（如 max_completion_token）不能让网关发出上游不认识的字段
    const { body } = await adaptOpenAIRequest(request, ctxWith({ maxTokensField: 'bogus' }))
    const sent = body as Record<string, unknown>
    expect(sent.max_tokens).toBe(1234)
    expect(sent.bogus).toBeUndefined()
  })

  it('omits the field entirely when the request has no max_tokens', async () => {
    const noLimit = {
      model: 'gpt-6.2-sol',
      messages: [{ role: 'user', content: 'hi' }],
    } as unknown as StandardRequest
    const { body } = await adaptOpenAIRequest(
      noLimit,
      ctxWith({ maxTokensField: 'max_completion_tokens' }),
    )
    const sent = body as Record<string, unknown>
    expect(sent.max_completion_tokens).toBeUndefined()
  })
})
