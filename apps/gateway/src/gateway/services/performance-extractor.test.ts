import { describe, it, expect } from 'bun:test'
import {
  extractPerformanceMetrics,
  extractErrorInfo,
  extractBusinessTags,
} from './performance-extractor'

describe('extractPerformanceMetrics', () => {
  it('returns fast tier for responseTimeMs < 1000', () => {
    const result = extractPerformanceMetrics({ responseTimeMs: 500 })
    expect(result).toEqual({
      responseTimeTier: 'fast',
      gatewayOverheadMs: undefined,
      providerTtfbMs: undefined,
      streamDurationMs: undefined,
    })
  })

  it('returns normal tier for responseTimeMs = 1000', () => {
    const result = extractPerformanceMetrics({ responseTimeMs: 1000 })
    expect(result?.responseTimeTier).toBe('normal')
  })

  it('returns normal tier for responseTimeMs < 5000', () => {
    const result = extractPerformanceMetrics({ responseTimeMs: 2500 })
    expect(result?.responseTimeTier).toBe('normal')
  })

  it('returns slow tier for responseTimeMs >= 5000', () => {
    const result = extractPerformanceMetrics({ responseTimeMs: 5000 })
    expect(result?.responseTimeTier).toBe('slow')
  })

  it('returns slow tier for very large responseTimeMs', () => {
    const result = extractPerformanceMetrics({ responseTimeMs: 30000 })
    expect(result?.responseTimeTier).toBe('slow')
  })

  it('includes all timing fields when provided', () => {
    const result = extractPerformanceMetrics({
      responseTimeMs: 1500,
      gatewayOverheadMs: 50,
      providerTtfbMs: 300,
      streamDurationMs: 1150,
    })
    expect(result).toEqual({
      responseTimeTier: 'normal',
      gatewayOverheadMs: 50,
      providerTtfbMs: 300,
      streamDurationMs: 1150,
    })
  })

  it('handles null/undefined optional fields', () => {
    const result = extractPerformanceMetrics({
      responseTimeMs: 800,
      gatewayOverheadMs: undefined,
      providerTtfbMs: null as unknown as undefined,
      streamDurationMs: undefined,
    })
    expect(result!).toEqual({
      responseTimeTier: 'fast',
      gatewayOverheadMs: undefined,
      providerTtfbMs: null,
      streamDurationMs: undefined,
    } as unknown)
  })

  it('computes tokensPerSecond from streamDurationMs when available', () => {
    const result = extractPerformanceMetrics({
      responseTimeMs: 5000,
      streamDurationMs: 2000,
      outputTokens: 100,
    })
    expect(result?.tokensPerSecond).toBe(50)
  })

  it('falls back to responseTimeMs - gatewayOverheadMs - providerTtfbMs when streamDurationMs is absent', () => {
    const result = extractPerformanceMetrics({
      responseTimeMs: 3000,
      gatewayOverheadMs: 100,
      providerTtfbMs: 900,
      outputTokens: 40,
    })
    // genMs = 3000 - 100 - 900 = 2000ms -> 40 / 2s = 20 tokens/s
    expect(result?.tokensPerSecond).toBe(20)
  })

  it('returns undefined tokensPerSecond when outputTokens is missing', () => {
    const result = extractPerformanceMetrics({
      responseTimeMs: 2000,
      streamDurationMs: 1000,
    })
    expect(result?.tokensPerSecond).toBeUndefined()
  })

  it('returns undefined tokensPerSecond when derived generation duration is not positive', () => {
    const result = extractPerformanceMetrics({
      responseTimeMs: 500,
      gatewayOverheadMs: 300,
      providerTtfbMs: 400,
      outputTokens: 10,
    })
    // genMs = 500 - 300 - 400 = -200ms -> not representative, must not be reported
    expect(result?.tokensPerSecond).toBeUndefined()
  })

  it('still computes tokensPerSecond when content was genuinely streamed, even with a short streamDurationMs', () => {
    const result = extractPerformanceMetrics({
      responseTimeMs: 5030,
      providerTtfbMs: 5000,
      streamDurationMs: 30,
      outputTokens: 15,
      hasStreamedContent: true,
    })
    // 15 tokens / 0.03s = 500 tokens/s：短但真实的流式尾段，不应被拦截
    expect(result?.tokensPerSecond).toBe(500)
  })

  it('does not fabricate tokensPerSecond for tool_calls-only turns with no streamed content (production repro)', () => {
    // 生产实测：finish_reason=tool_calls, contentChunks/thinkingBlocks 均为空，
    // outputTokens 反映的是 TTFB 阶段生成 tool_calls 参数的 token 数，
    // streamDurationMs 只是已生成好的 payload 传输耗时——两者不是同一阶段
    const result = extractPerformanceMetrics({
      responseTimeMs: 26959,
      providerTtfbMs: 26902,
      streamDurationMs: 30,
      outputTokens: 446,
      hasStreamedContent: false,
    })
    expect(result?.tokensPerSecond).toBeUndefined()
  })

  it('treats hasStreamedContent as unset (e.g. non-streaming responses) the same as before — no behavior change', () => {
    const result = extractPerformanceMetrics({
      responseTimeMs: 26959,
      providerTtfbMs: 26902,
      streamDurationMs: 30,
      outputTokens: 446,
    })
    expect(result?.tokensPerSecond).toBe(14866.7)
  })
})

describe('extractErrorInfo', () => {
  it('returns null when no errorMessage and no errorType', () => {
    const result = extractErrorInfo({ responseTimeMs: 100, statusCode: 200 })
    expect(result).toBeNull()
  })

  it('returns null when both error fields are undefined', () => {
    expect(extractErrorInfo({ responseTimeMs: 100 })).toBeNull()
  })

  it('categorizes status 429 as rate_limit and recoverable', () => {
    const result = extractErrorInfo({
      responseTimeMs: 100,
      statusCode: 429,
      errorMessage: 'Rate limited',
    })
    expect(result).toEqual({ category: 'rate_limit', recoverable: true })
  })

  it('categorizes status 401 as authentication and not recoverable', () => {
    const result = extractErrorInfo({
      responseTimeMs: 100,
      statusCode: 401,
      errorMessage: 'Unauthorized',
    })
    expect(result).toEqual({ category: 'authentication', recoverable: false })
  })

  it('categorizes status 403 as authentication and not recoverable', () => {
    const result = extractErrorInfo({
      responseTimeMs: 100,
      statusCode: 403,
      errorMessage: 'Forbidden',
    })
    expect(result).toEqual({ category: 'authentication', recoverable: false })
  })

  it('categorizes status 400 as invalid_request and not recoverable', () => {
    const result = extractErrorInfo({
      responseTimeMs: 100,
      statusCode: 400,
      errorMessage: 'Bad request',
    })
    expect(result).toEqual({ category: 'invalid_request', recoverable: false })
  })

  it('categorizes status 500 as server_error and not recoverable', () => {
    const result = extractErrorInfo({
      responseTimeMs: 100,
      statusCode: 500,
      errorMessage: 'Internal error',
    })
    expect(result).toEqual({ category: 'server_error', recoverable: false })
  })

  it('categorizes status 503 as server_error but recoverable', () => {
    const result = extractErrorInfo({
      responseTimeMs: 100,
      statusCode: 503,
      errorMessage: 'Service unavailable',
    })
    expect(result).toEqual({ category: 'server_error', recoverable: true })
  })

  it('categorizes errorType containing "timeout" as timeout and recoverable', () => {
    const result = extractErrorInfo({
      responseTimeMs: 100,
      errorType: 'timeout',
      errorMessage: 'Request timed out',
    })
    expect(result).toEqual({ category: 'timeout', recoverable: true })
  })

  it('categorizes errorType containing "network" as network and recoverable', () => {
    const result = extractErrorInfo({
      responseTimeMs: 100,
      errorType: 'network_error',
      errorMessage: 'Connection lost',
    })
    expect(result).toEqual({ category: 'network', recoverable: true })
  })

  it('categorizes errorType containing "rate" as rate_limit but not recoverable', () => {
    const result = extractErrorInfo({ responseTimeMs: 100, errorType: 'rate_limit_exceeded' })
    expect(result).toEqual({ category: 'rate_limit', recoverable: false })
  })

  it('categorizes unknown errorType as unknown and not recoverable', () => {
    const result = extractErrorInfo({
      responseTimeMs: 100,
      errorType: 'internal_error',
      errorMessage: 'Something broke',
    })
    expect(result).toEqual({ category: 'unknown', recoverable: false })
  })
})

describe('extractBusinessTags', () => {
  it('returns null when all fields are null/undefined', () => {
    const result = extractBusinessTags({ responseTimeMs: 100 })
    expect(result).toBeNull()
  })

  it('returns null when userId and organizationId are undefined and tags is empty', () => {
    const result = extractBusinessTags({
      responseTimeMs: 100,
      userId: undefined,
      organizationId: undefined,
      tags: [],
    })
    expect(result).toBeNull()
  })

  it('returns data with only userId', () => {
    const result = extractBusinessTags({ responseTimeMs: 100, userId: 'user-abc' })
    expect(result).toEqual({
      userId: 'user-abc',
      organizationId: undefined,
      tags: undefined,
    })
  })

  it('returns data with only organizationId', () => {
    const result = extractBusinessTags({ responseTimeMs: 100, organizationId: 'org-123' })
    expect(result).toEqual({
      userId: undefined,
      organizationId: 'org-123',
      tags: undefined,
    })
  })

  it('returns data with only tags', () => {
    const result = extractBusinessTags({ responseTimeMs: 100, tags: ['production', 'critical'] })
    expect(result).toEqual({
      userId: undefined,
      organizationId: undefined,
      tags: ['production', 'critical'],
    })
  })

  it('returns data with all fields present', () => {
    const result = extractBusinessTags({
      responseTimeMs: 100,
      userId: 'user-abc',
      organizationId: 'org-123',
      tags: ['beta'],
    })
    expect(result).toEqual({
      userId: 'user-abc',
      organizationId: 'org-123',
      tags: ['beta'],
    })
  })
})
