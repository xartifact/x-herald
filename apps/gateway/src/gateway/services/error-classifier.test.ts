import { describe, it, expect } from 'bun:test'
import {
  extractProviderErrorMessageFromBody,
  normalizeProviderErrorMessage,
  parseProviderError,
  extractProviderResponseHeaders,
} from './error-classifier'
import { consoleLogBus, type ConsoleLogEntry } from '../../lib/console-log-bus'

// ---------------------------------------------------------------------------
// normalizeProviderErrorMessage()
// ---------------------------------------------------------------------------
describe('normalizeProviderErrorMessage', () => {
  // -- context_length_exceeded --
  it('detects total message size exceeded pattern', () => {
    const msg = 'Total message size 1500000 exceeds limit 1000000'
    const result = normalizeProviderErrorMessage(msg)
    expect(result.code).toBe('context_length_exceeded')
    expect(result.message).toContain('1.4 MB')
    expect(result.message).toContain('1.0 MB')
    // 1500000 / 1024 / 1024 ≈ 1.4305 → rounded to 1.4
    // 1000000 / 1024 / 1024 ≈ 0.9537 → rounded to 1.0
  })

  it('handles larger size values (edge: exact MB boundary)', () => {
    const msg = 'total message size 1048576 exceeds limit 524288'
    const result = normalizeProviderErrorMessage(msg)
    expect(result.code).toBe('context_length_exceeded')
    // 1048576 / 1024 / 1024 = 1.0 → rounded to 1.0
    expect(result.message).toContain('1.0 MB')
    // 524288 / 1024 / 1024 = 0.5 → 0.5
    expect(result.message).toContain('0.5 MB')
  })

  // -- provider_service_unavailable --
  it('detects "Cannot connect to host" pattern', () => {
    const msg = 'Cannot connect to host api.anthropic.com:443'
    const result = normalizeProviderErrorMessage(msg)
    expect(result.code).toBe('provider_service_unavailable')
    expect(result.message).toBe(
      'Provider service is temporarily unavailable. Please try again later.',
    )
  })

  it('detects "Connect call failed" pattern', () => {
    const msg = 'Connect call failed to endpoint'
    const result = normalizeProviderErrorMessage(msg)
    expect(result.code).toBe('provider_service_unavailable')
  })

  // -- request_too_large --
  it('detects request body size exceeded pattern', () => {
    const msg = 'Exceeded limit on max bytes to request body: 5000000'
    const result = normalizeProviderErrorMessage(msg)
    expect(result.code).toBe('request_too_large')
    // 5000000 / 1024 / 1024 ≈ 4.8 MB
    expect(result.message).toContain('4.8 MB')
  })

  it('detects request body size exceeded with different spacing', () => {
    const msg = 'Exceeded limit on max bytes to request body : 1000000'
    const result = normalizeProviderErrorMessage(msg)
    expect(result.code).toBe('request_too_large')
    // 1000000 / 1024 / 1024 ≈ 1.0 MB
    expect(result.message).toContain('1.0 MB')
  })

  // -- invalid_tool_call_format --
  it('detects tool call format error with missing IDs', () => {
    const msg =
      "An assistant message with 'tool_calls' must be followed by tool messages. tool_call_ids did not have response messages: call_abc, call_def"
    const result = normalizeProviderErrorMessage(msg)
    expect(result.code).toBe('invalid_tool_call_format')
    expect(result.message).toContain('Missing IDs: call_abc, call_def')
  })

  it('detects tool call format error without missing IDs', () => {
    const msg = "An assistant message with 'tool_calls' must be followed by tool messages"
    const result = normalizeProviderErrorMessage(msg)
    expect(result.code).toBe('invalid_tool_call_format')
    expect(result.message).not.toContain('Missing IDs:')
    expect(result.message).toContain('tool_call responses are missing.')
  })

  // -- Default / fallback --
  it('returns provider_error for unrecognized messages', () => {
    const msg = 'Some random error occurred'
    const result = normalizeProviderErrorMessage(msg)
    expect(result.code).toBe('provider_error')
    expect(result.message).toBe('Some random error occurred')
  })

  it('returns provider_error for empty string', () => {
    const result = normalizeProviderErrorMessage('')
    expect(result.code).toBe('provider_error')
    expect(result.message).toBe('')
  })

  // -- Case insensitivity --
  it('is case-insensitive for the pattern matches', () => {
    const msg = 'CONNECT CALL FAILED to upstream'
    const result = normalizeProviderErrorMessage(msg)
    expect(result.code).toBe('provider_service_unavailable')
  })
})

// ---------------------------------------------------------------------------
// parseProviderError()
// ---------------------------------------------------------------------------
describe('parseProviderError', () => {
  it('parses SSE data: lines with JSON content', async () => {
    const body = 'data: {"error":{"message":"Rate limited"}}\n'
    const response = new Response(body, {
      headers: { 'content-type': 'text/event-stream' },
    })
    const result = await parseProviderError(response)
    expect(result).toEqual({ error: { message: 'Rate limited' } })
  })

  it('skips [DONE] lines and parses next data: line', async () => {
    const body = 'data: [DONE]\ndata: {"error":{"message":"Overloaded"}}\n'
    const response = new Response(body, {
      headers: { 'content-type': 'text/event-stream' },
    })
    const result = await parseProviderError(response)
    expect(result).toEqual({ error: { message: 'Overloaded' } })
  })

  it('falls back to raw text when SSE has no valid JSON', async () => {
    const body = 'data: not-json\ndata: also-not-json\n'
    const response = new Response(body, {
      headers: { 'content-type': 'text/event-stream' },
    })
    const result = await parseProviderError(response)
    expect(result).toEqual({ error: { message: 'data: not-json\ndata: also-not-json\n' } })
  })

  it('detects SSE by data: prefix when no event-stream content-type', async () => {
    const body = 'data: {"error":{"message":"Oops"}}\n'
    const response = new Response(body)
    const result = await parseProviderError(response)
    expect(result).toEqual({ error: { message: 'Oops' } })
  })

  it('parses regular JSON response', async () => {
    const response = new Response(JSON.stringify({ error: { message: 'Bad request' } }), {
      headers: { 'content-type': 'application/json' },
    })
    const result = await parseProviderError(response)
    expect(result).toEqual({ error: { message: 'Bad request' } })
  })

  it('wraps plain text in error object', async () => {
    const response = new Response('Service Unavailable', {
      headers: { 'content-type': 'text/plain' },
    })
    const result = await parseProviderError(response)
    expect(result).toEqual({ error: { message: 'Service Unavailable' } })
  })

  it('returns "Provider request failed" for empty response body', async () => {
    const response = new Response('', {
      headers: { 'content-type': 'text/plain' },
    })
    const result = await parseProviderError(response)
    expect(result).toEqual({ error: { message: 'Provider request failed' } })
  })

  it('logs a warning (not silence) when the body read itself throws', async () => {
    const brokenBody = new ReadableStream({
      start(controller) {
        controller.error(new Error('terminated'))
      },
    })
    const response = new Response(brokenBody, {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })

    const entries: ConsoleLogEntry[] = []
    const unsubscribe = consoleLogBus.subscribe((entry) => entries.push(entry))
    let result: unknown
    try {
      result = await parseProviderError(response)
    } finally {
      unsubscribe()
    }

    // 行为不变：读取失败仍然安全兜底，不抛异常、不污染上层调用方
    expect(result).toEqual({ error: { message: 'Provider request failed' } })

    // 但必须留下可区分的日志，而不是和"上游真的返回空 body"表现一样
    const warnEntry = entries.find(
      (e) => e.level === 'warn' && e.fields.module === 'error-classifier',
    )
    expect(warnEntry).toBeDefined()
    expect(warnEntry?.msg).toContain('Failed to read provider error response body')
    expect(warnEntry?.fields.status).toBe(404)
  })

  it('handles multiple data: lines where only one is valid JSON', async () => {
    const body = 'data: invalid json\ndata: {"error":{"message":"Valid one"}}\n'
    const response = new Response(body, {
      headers: { 'content-type': 'text/event-stream' },
    })
    const result = await parseProviderError(response)
    expect(result).toEqual({ error: { message: 'Valid one' } })
  })
})

// ---------------------------------------------------------------------------
// extractProviderResponseHeaders()
// ---------------------------------------------------------------------------
describe('extractProviderResponseHeaders', () => {
  it('extracts headers into a plain object', () => {
    const response = new Response(null, {
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req-123',
        'x-rate-limit-remaining': '42',
      },
    })
    const result = extractProviderResponseHeaders(response)
    expect(result['content-type']).toBe('application/json')
    expect(result['x-request-id']).toBe('req-123')
    expect(result['x-rate-limit-remaining']).toBe('42')
  })

  it('returns empty object for response with no headers', () => {
    const response = new Response(null)
    const result = extractProviderResponseHeaders(response)
    expect(result).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// extractProviderErrorMessageFromBody()
// ---------------------------------------------------------------------------
describe('extractProviderErrorMessageFromBody', () => {
  it('extracts OpenAI-style nested error message', () => {
    expect(extractProviderErrorMessageFromBody({ error: { message: 'quota exceeded' } })).toBe(
      'quota exceeded',
    )
  })

  it('extracts flat wrapper message (X-AIO style)', () => {
    expect(extractProviderErrorMessageFromBody({ code: 500, message: '系统异常', data: {} })).toBe(
      '系统异常',
    )
  })

  it('extracts from JSON string body', () => {
    expect(extractProviderErrorMessageFromBody('{"message":"boom"}')).toBe('boom')
  })

  it('falls back to trimmed text for non-JSON string', () => {
    expect(extractProviderErrorMessageFromBody('  plain error text  ')).toBe('plain error text')
  })

  it('truncates long messages to 300 chars', () => {
    const long = 'x'.repeat(500)
    const result = extractProviderErrorMessageFromBody({ message: long })
    expect(result).toHaveLength(300)
  })

  it('returns null for null, empty object, or empty message', () => {
    expect(extractProviderErrorMessageFromBody(null)).toBeNull()
    expect(extractProviderErrorMessageFromBody({})).toBeNull()
    expect(extractProviderErrorMessageFromBody({ message: '   ' })).toBeNull()
    expect(extractProviderErrorMessageFromBody('   ')).toBeNull()
  })
})
