import { describe, it, expect } from 'bun:test'
import type { StandardMessage } from '@xartifact/x-herald-shared'

import type { OpenAIMessage } from '../types'
import { convertMessages, convertToOpenAIMessages } from './message-converter'

describe('convertMessages (OpenAI -> Standard ingress)', () => {
  it('carries reasoning_content into the top-level StandardMessage field', () => {
    const messages: OpenAIMessage[] = [
      { role: 'assistant', content: 'the answer', reasoning_content: 'let me think...' },
    ]
    const result = convertMessages(messages)
    expect(result[0]?.reasoning_content).toBe('let me think...')
    expect(result[0]?.metadata).toBeUndefined()
  })

  it('leaves reasoning_content undefined when the source message has none', () => {
    const messages: OpenAIMessage[] = [{ role: 'user', content: 'hi' }]
    const result = convertMessages(messages)
    expect(result[0]?.reasoning_content).toBeUndefined()
  })
})

describe('convertToOpenAIMessages (Standard -> OpenAI egress)', () => {
  it('forwards the top-level reasoning_content field to the OpenAI wire format', () => {
    const messages: StandardMessage[] = [
      { role: 'assistant', content: 'the answer', reasoning_content: 'let me think...' },
    ]
    const result = convertToOpenAIMessages(messages)
    expect(result[0]?.reasoning_content).toBe('let me think...')
  })

  it('does not emit reasoning_content when the StandardMessage has none', () => {
    const messages: StandardMessage[] = [{ role: 'user', content: 'hi' }]
    const result = convertToOpenAIMessages(messages)
    expect(result[0]?.reasoning_content).toBeUndefined()
  })

  it('regression: reasoning_content produced by a cross-protocol ingress (top-level field, not metadata) survives egress', () => {
    // 复现跨协议丢失场景：上游history的 reasoning_content 曾经只有 convertMessages 写进
    // msg.metadata.reasoning_content 才能被 convertToOpenAIMessages 读到；Anthropic ingress
    // 写的是顶层字段，导致 Anthropic 协议 client -> OpenAI 协议 provider 的历史消息里
    // reasoning_content 被静默丢弃。这里只用顶层字段构造，模拟 Anthropic ingress 的产出。
    const messageFromAnthropicIngress: StandardMessage = {
      role: 'assistant',
      content: 'the answer',
      reasoning_content: 'thought from a prior turn',
      // 故意不设置 metadata.reasoning_content，验证不再依赖旧的旁路字段
    }
    const result = convertToOpenAIMessages([messageFromAnthropicIngress])
    expect(result[0]?.reasoning_content).toBe('thought from a prior turn')
  })
})
