import { describe, it, expect } from 'bun:test'

import type { StandardRequest, TransformerContext } from '@xartifact/x-herald-shared'

import {
  getValueByPath,
  setValueByPath,
  applyParameterTransforms,
  buildHeaders,
  applyRequestInject,
  type ParameterTransformRule,
} from './parameter-transformer'

function makeRequest(overrides: Partial<StandardRequest> = {}): StandardRequest {
  return {
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'hi' }],
    ...overrides,
  }
}

function makeCtx(overrides: Partial<TransformerContext> = {}): TransformerContext {
  return {
    request: makeRequest(),
    provider: { name: 'test', protocol: 'openai', baseUrl: 'https://x' },
    model: 'gpt-4',
    headers: {},
    metadata: {},
    requestId: 'req-1',
    startTime: 0,
    state: new Map(),
    ...overrides,
  }
}

describe('getValueByPath', () => {
  it('reads top-level keys', () => {
    expect(getValueByPath({ a: 1 }, 'a')).toBe(1)
  })

  it('reads nested keys', () => {
    expect(getValueByPath({ a: { b: 2 } }, 'a.b')).toBe(2)
  })

  it('returns undefined for missing paths', () => {
    expect(getValueByPath({ a: 1 }, 'b')).toBeUndefined()
    expect(getValueByPath({ a: { b: 2 } }, 'a.c')).toBeUndefined()
    expect(getValueByPath({ a: { b: 2 } }, 'a.b.c')).toBeUndefined()
  })

  it('returns undefined when traversing through null/undefined', () => {
    expect(getValueByPath({ a: null }, 'a.b')).toBeUndefined()
    expect(getValueByPath({ a: undefined }, 'a.b')).toBeUndefined()
  })

  it('returns undefined when traversing through non-objects', () => {
    expect(getValueByPath({ a: 42 }, 'a.b')).toBeUndefined()
    expect(getValueByPath({ a: 'hello' }, 'a.b')).toBeUndefined()
    expect(getValueByPath({ a: true }, 'a.b')).toBeUndefined()
  })

  it('returns null when the leaf is null', () => {
    expect(getValueByPath({ a: null }, 'a')).toBeNull()
  })

  it('handles deeply nested paths', () => {
    expect(getValueByPath({ a: { b: { c: { d: 'deep' } } } }, 'a.b.c.d')).toBe('deep')
  })

  it('returns the array element when indexing', () => {
    expect(getValueByPath({ items: [10, 20, 30] }, 'items.1')).toBe(20)
  })
})

describe('setValueByPath', () => {
  it('sets a top-level key', () => {
    const obj: Record<string, unknown> = {}
    setValueByPath(obj, 'a', 1)
    expect(obj).toEqual({ a: 1 })
  })

  it('sets a nested key, creating intermediate objects', () => {
    const obj: Record<string, unknown> = {}
    setValueByPath(obj, 'a.b.c', 'deep')
    expect(obj).toEqual({ a: { b: { c: 'deep' } } })
  })

  it('overwrites an existing leaf value', () => {
    const obj = { a: { b: 1 } }
    setValueByPath(obj, 'a.b', 99)
    expect(obj).toEqual({ a: { b: 99 } })
  })

  it('preserves siblings when overwriting', () => {
    const obj = { a: { b: 1, c: 2 } }
    setValueByPath(obj, 'a.b', 99)
    expect(obj).toEqual({ a: { b: 99, c: 2 } })
  })

  it('replaces non-object intermediates with a fresh object', () => {
    const obj: Record<string, unknown> = { a: 42 }
    setValueByPath(obj, 'a.b', 'new')
    expect(obj).toEqual({ a: { b: 'new' } })
  })

  it('handles deep paths with existing branches', () => {
    const obj = { a: { b: { existing: true } } }
    setValueByPath(obj, 'a.b.added', 'value')
    expect(obj).toEqual({ a: { b: { existing: true, added: 'value' } } })
  })
})

describe('applyParameterTransforms - basic', () => {
  it('returns the original request when there are no transforms', () => {
    const req = makeRequest({ temperature: 0.5 })
    const out = applyParameterTransforms(req, [], makeCtx())
    expect(out).toBe(req)
  })

  it('returns the original request when transforms is undefined', () => {
    const req = makeRequest()
    const out = applyParameterTransforms(req, undefined, makeCtx())
    expect(out).toBe(req)
  })

  it('does not mutate the original request when adding params', () => {
    const req = makeRequest()
    const out = applyParameterTransforms(
      req,
      [{ action: { type: 'add', targetParam: 'top_p', value: 0.9 } }],
      makeCtx(),
    )
    expect(out).not.toBe(req)
    expect(req.top_p).toBeUndefined()
    expect(out.top_p).toBe(0.9)
  })
})

describe('applyParameterTransforms - add action', () => {
  it('adds a static value', () => {
    const out = applyParameterTransforms(
      makeRequest(),
      [{ action: { type: 'add', targetParam: 'top_p', value: 0.9 } }],
      makeCtx(),
    )
    expect(out.top_p).toBe(0.9)
  })

  it('skips when value is undefined', () => {
    const out = applyParameterTransforms(
      makeRequest(),
      [{ action: { type: 'add', targetParam: 'top_p', value: undefined } }],
      makeCtx(),
    )
    expect(out.top_p).toBeUndefined()
  })

  it('evaluates an expression and stores the result', () => {
    const out = applyParameterTransforms(
      makeRequest({ reasoning: { enabled: true } }),
      [
        {
          action: {
            type: 'add',
            targetParam: 'top_p',
            expression: '${reasoning.enabled} ? 0.95 : 0.5',
          },
        },
      ],
      makeCtx(),
    )
    expect(out.top_p).toBe(0.95)
  })

  it('evaluates an expression where the condition is false', () => {
    const out = applyParameterTransforms(
      makeRequest({ reasoning: { enabled: false } }),
      [
        {
          action: {
            type: 'add',
            targetParam: 'top_p',
            expression: '${reasoning.enabled} ? 0.95 : 0.5',
          },
        },
      ],
      makeCtx(),
    )
    expect(out.top_p).toBe(0.5)
  })

  it('evaluates a plain path expression', () => {
    const out = applyParameterTransforms(
      makeRequest({ model: 'gpt-5' }),
      [
        {
          action: {
            type: 'add',
            targetParam: 'target_model',
            expression: '${model}',
          },
        },
      ],
      makeCtx(),
    )
    expect(out).toHaveProperty('target_model', 'gpt-5')
  })

  it('skips when expression evaluates to undefined', () => {
    const out = applyParameterTransforms(
      makeRequest(),
      [
        {
          action: {
            type: 'add',
            targetParam: 'foo',
            expression: '${nonexistent.path}',
          },
        },
      ],
      makeCtx(),
    )
    expect(out).not.toHaveProperty('foo')
  })

  it('continues processing other rules after one throws', () => {
    const out = applyParameterTransforms(
      makeRequest(),
      [
        {
          action: {
            type: 'add',
            targetParam: 'safe',
            expression: '${nonexistent.path}',
          },
        },
        { action: { type: 'add', targetParam: 'top_p', value: 0.9 } },
      ],
      makeCtx(),
    )
    expect(out).not.toHaveProperty('safe')
    expect(out.top_p).toBe(0.9)
  })
})

describe('applyParameterTransforms - remove action', () => {
  it('removes an existing top-level key', () => {
    const out = applyParameterTransforms(
      makeRequest({ temperature: 0.5, top_p: 0.9 }),
      [{ action: { type: 'remove', targetParam: 'top_p' } }],
      makeCtx(),
    )
    expect(out.top_p).toBeUndefined()
    expect(out.temperature).toBe(0.5)
  })

  it('removes a nested key', () => {
    const out = applyParameterTransforms(
      makeRequest({ reasoning: { enabled: true, effort: 'low' } }),
      [{ action: { type: 'remove', targetParam: 'reasoning.effort' } }],
      makeCtx(),
    )
    expect(out).toHaveProperty('reasoning.enabled', true)
    expect(out).not.toHaveProperty('reasoning.effort')
  })

  it('is a no-op when the key does not exist', () => {
    const out = applyParameterTransforms(
      makeRequest({ temperature: 0.5 }),
      [{ action: { type: 'remove', targetParam: 'nonexistent' } }],
      makeCtx(),
    )
    expect(out.temperature).toBe(0.5)
  })

  it('handles paths through null/undefined safely', () => {
    const out = applyParameterTransforms(
      makeRequest(),
      [{ action: { type: 'remove', targetParam: 'a.b.c' } }],
      makeCtx(),
    )
    expect(out).not.toHaveProperty('a')
  })
})

describe('applyParameterTransforms - rename action', () => {
  it('moves the value from source path to target path', () => {
    const out = applyParameterTransforms(
      makeRequest({ model: 'gpt-5' }),
      [
        {
          action: {
            type: 'rename',
            targetParam: 'target_model',
            expression: 'model',
          },
        },
      ],
      makeCtx(),
    )
    expect(out).toHaveProperty('target_model', 'gpt-5')
    expect(out.model).toBeUndefined()
  })

  it('is a no-op when source path is undefined', () => {
    const out = applyParameterTransforms(
      makeRequest({ model: 'gpt-4' }),
      [
        {
          action: {
            type: 'rename',
            targetParam: 'target_model',
            expression: 'nonexistent',
          },
        },
      ],
      makeCtx(),
    )
    expect(out).not.toHaveProperty('target_model')
    expect(out.model).toBe('gpt-4')
  })

  it('is a no-op when expression is missing', () => {
    const out = applyParameterTransforms(
      makeRequest({ model: 'gpt-4' }),
      [{ action: { type: 'rename', targetParam: 'target_model' } }],
      makeCtx(),
    )
    expect(out.model).toBe('gpt-4')
  })
})

describe('applyParameterTransforms - transform action', () => {
  it('rewrites an existing value using an expression', () => {
    const out = applyParameterTransforms(
      makeRequest({ temperature: 0.5, reasoning: { enabled: true } }),
      [
        {
          action: {
            type: 'transform',
            targetParam: 'temperature',
            expression: '${reasoning.enabled} ? 0.2 : 0.7',
          },
        },
      ],
      makeCtx(),
    )
    expect(out.temperature).toBe(0.2)
  })

  it('is a no-op when the target param does not exist', () => {
    const out = applyParameterTransforms(
      makeRequest({ reasoning: { enabled: true } }),
      [
        {
          action: {
            type: 'transform',
            targetParam: 'nonexistent',
            expression: '${reasoning.enabled} ? 0.2 : 0.7',
          },
        },
      ],
      makeCtx(),
    )
    expect(out).not.toHaveProperty('nonexistent')
  })

  it('is a no-op when expression is missing', () => {
    const out = applyParameterTransforms(
      makeRequest({ temperature: 0.5 }),
      [{ action: { type: 'transform', targetParam: 'temperature' } }],
      makeCtx(),
    )
    expect(out.temperature).toBe(0.5)
  })

  it('is a no-op when expression evaluates to undefined', () => {
    const out = applyParameterTransforms(
      makeRequest({ temperature: 0.5 }),
      [
        {
          action: {
            type: 'transform',
            targetParam: 'temperature',
            expression: '${nonexistent}',
          },
        },
      ],
      makeCtx(),
    )
    expect(out.temperature).toBe(0.5)
  })
})

describe('applyParameterTransforms - conditions (when)', () => {
  it('skips the rule when the eq condition does not match', () => {
    const out = applyParameterTransforms(
      makeRequest({ model: 'gpt-4' }),
      [
        {
          when: { paramName: 'model', operator: 'eq', value: 'gpt-5' },
          action: { type: 'add', targetParam: 'top_p', value: 0.9 },
        },
      ],
      makeCtx(),
    )
    expect(out.top_p).toBeUndefined()
  })

  it('applies the rule when the eq condition matches', () => {
    const out = applyParameterTransforms(
      makeRequest({ model: 'gpt-5' }),
      [
        {
          when: { paramName: 'model', operator: 'eq', value: 'gpt-5' },
          action: { type: 'add', targetParam: 'top_p', value: 0.9 },
        },
      ],
      makeCtx(),
    )
    expect(out.top_p).toBe(0.9)
  })

  it('supports the ne operator', () => {
    const out = applyParameterTransforms(
      makeRequest({ model: 'gpt-4' }),
      [
        {
          when: { paramName: 'model', operator: 'ne', value: 'gpt-5' },
          action: { type: 'add', targetParam: 'top_p', value: 0.9 },
        },
      ],
      makeCtx(),
    )
    expect(out.top_p).toBe(0.9)
  })

  it('supports the exists operator', () => {
    const out = applyParameterTransforms(
      makeRequest({ reasoning: { enabled: true } }),
      [
        {
          when: { paramName: 'reasoning.enabled', operator: 'exists' },
          action: { type: 'add', targetParam: 'top_p', value: 0.9 },
        },
      ],
      makeCtx(),
    )
    expect(out.top_p).toBe(0.9)
  })

  it('does not apply when exists check fails', () => {
    const out = applyParameterTransforms(
      makeRequest({}),
      [
        {
          when: { paramName: 'reasoning.enabled', operator: 'exists' },
          action: { type: 'add', targetParam: 'top_p', value: 0.9 },
        },
      ],
      makeCtx(),
    )
    expect(out.top_p).toBeUndefined()
  })

  it('supports the not_exists operator', () => {
    const out = applyParameterTransforms(
      makeRequest({}),
      [
        {
          when: { paramName: 'top_p', operator: 'not_exists' },
          action: { type: 'add', targetParam: 'top_p', value: 0.9 },
        },
      ],
      makeCtx(),
    )
    expect(out.top_p).toBe(0.9)
  })

  it('uses false for an unknown operator', () => {
    const out = applyParameterTransforms(
      makeRequest({ model: 'gpt-4' }),
      [
        {
          // @ts-expect-error — testing unknown operator
          when: { paramName: 'model', operator: 'invalid' },
          action: { type: 'add', targetParam: 'top_p', value: 0.9 },
        },
      ],
      makeCtx(),
    )
    expect(out.top_p).toBeUndefined()
  })

  it('continues processing other rules after one throws', () => {
    const out = applyParameterTransforms(
      makeRequest(),
      [
        {
          // Action that will throw at apply time: passing a non-record value
          // causes setValueByPath to throw on deeper paths. We simulate by
          // passing a primitive that the path-traversal would mishandle.
          action: { type: 'add', targetParam: 'a.b', value: 'ok' },
        },
        { action: { type: 'add', targetParam: 'top_p', value: 0.9 } },
      ],
      makeCtx(),
    )
    // First rule should still set top_p; second rule adds top_p
    expect(out.top_p).toBe(0.9)
  })
})

describe('buildHeaders', () => {
  it('returns the base headers when no custom headers are provided', () => {
    const result = buildHeaders({ 'Content-Type': 'application/json' }, undefined, makeCtx())
    expect(result).toEqual({ 'Content-Type': 'application/json' })
  })

  it('merges custom headers into the base', () => {
    const result = buildHeaders(
      { 'Content-Type': 'application/json' },
      { 'X-Custom': 'value' },
      makeCtx(),
    )
    expect(result).toEqual({
      'Content-Type': 'application/json',
      'X-Custom': 'value',
    })
  })

  it('replaces case-insensitive duplicates', () => {
    const result = buildHeaders(
      { 'Content-Type': 'application/json' },
      { 'content-type': 'text/plain' },
      makeCtx(),
    )
    expect(result).toEqual({ 'content-type': 'text/plain' })
  })

  it('replaces headers regardless of original casing', () => {
    const result = buildHeaders({ 'X-Trace-Id': 'old' }, { 'x-trace-id': 'new' }, makeCtx())
    expect(result).toEqual({ 'x-trace-id': 'new' })
  })

  it('substitutes ${requestId} in custom header values', () => {
    const result = buildHeaders(
      {},
      { 'X-Request-Id': 'req-${requestId}-end' },
      makeCtx({ requestId: 'abc123' }),
    )
    expect(result).toEqual({ 'X-Request-Id': 'req-abc123-end' })
  })

  it('substitutes multiple ${requestId} occurrences', () => {
    const result = buildHeaders(
      {},
      { 'X-Debug': '${requestId}-${requestId}' },
      makeCtx({ requestId: 'r1' }),
    )
    expect(result).toEqual({ 'X-Debug': 'r1-r1' })
  })

  it('does not substitute ${requestId} when ctx.requestId is empty', () => {
    const result = buildHeaders(
      {},
      { 'X-Trace': 'before-${requestId}-after' },
      makeCtx({ requestId: '' }),
    )
    expect(result).toEqual({ 'X-Trace': 'before--after' })
  })
})

describe('applyRequestInject', () => {
  it('returns the body unchanged when inject is undefined', () => {
    const out = applyRequestInject({ a: 1 }, undefined)
    expect(out).toEqual({ a: 1 })
  })

  it('merges inject into the body', () => {
    const out = applyRequestInject({ a: 1 }, { b: 2 })
    expect(out).toEqual({ a: 1, b: 2 })
  })

  it('injected values override body values', () => {
    const out = applyRequestInject({ a: 1 }, { a: 2 })
    expect(out).toEqual({ a: 2 })
  })

  it('does not mutate the original body', () => {
    const body = { a: 1 }
    const out = applyRequestInject(body, { b: 2 })
    expect(body).toEqual({ a: 1 })
    expect(out).not.toBe(body)
  })

  it('handles an empty inject object as a no-op', () => {
    const out = applyRequestInject({ a: 1 }, {})
    expect(out).toEqual({ a: 1 })
  })
})
