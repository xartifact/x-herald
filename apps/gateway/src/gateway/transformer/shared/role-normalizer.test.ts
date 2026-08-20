import { describe, expect, it } from 'bun:test'

import type { StandardRequest } from '@xartifact/x-herald-shared'

import { applyRoleMapping } from './role-normalizer'

function req(messages: { role: string; content?: string }[]): StandardRequest {
  return {
    model: 'm',
    messages: messages.map((m) => ({
      role: m.role as StandardRequest['messages'][number]['role'],
      content: m.content ?? 'x',
    })) as StandardRequest['messages'],
  }
}

describe('applyRoleMapping', () => {
  it('returns the request unchanged when no mapping is provided', () => {
    const r = req([
      { role: 'developer', content: 'd' },
      { role: 'user', content: 'u' },
    ])
    const out = applyRoleMapping(r, undefined)
    expect(out).toBe(r)
  })

  it('returns the request unchanged when mapping is empty', () => {
    const r = req([{ role: 'developer', content: 'd' }])
    const out = applyRoleMapping(r, {})
    expect(out).toBe(r)
  })

  it('rewrites only configured roles and returns a new request when any change occurs', () => {
    const r = req([
      { role: 'developer', content: 'd1' },
      { role: 'user', content: 'u1' },
      { role: 'developer', content: 'd2' },
      { role: 'assistant', content: 'a1' },
    ])
    const out = applyRoleMapping(r, { developer: 'system' })
    expect(out).not.toBe(r)
    expect(out.messages.map((m) => m.role)).toEqual(['system', 'user', 'system', 'assistant'])
    expect(out.messages.map((m) => m.content)).toEqual(['d1', 'u1', 'd2', 'a1'])
    expect(out.messages.every((m) => m !== r.messages[0])).toBe(true)
  })

  it('does not mutate the original request', () => {
    const r = req([
      { role: 'developer', content: 'd' },
      { role: 'user', content: 'u' },
    ])
    const before = r.messages.map((m) => m.role)
    applyRoleMapping(r, { developer: 'system' })
    expect(r.messages.map((m) => m.role)).toEqual(before)
  })

  it('returns the same reference when no message role is hit (no rewrite happened)', () => {
    const r = req([
      { role: 'user', content: 'u' },
      { role: 'assistant', content: 'a' },
    ])
    const out = applyRoleMapping(r, { developer: 'system' })
    expect(out).toBe(r)
  })

  it('supports mapping multiple roles', () => {
    const r = req([
      { role: 'developer', content: 'd' },
      { role: 'tool', content: 't' },
    ])
    const out = applyRoleMapping(r, { developer: 'system', tool: 'user' })
    expect(out.messages.map((m) => m.role)).toEqual(['system', 'user'])
  })

  it('passes through unknown roles untouched', () => {
    const r = req([{ role: 'developer', content: 'd' }])
    const out = applyRoleMapping(r, { totally_other: 'system' })
    expect(out.messages[0]?.role).toBe('developer')
  })
})
