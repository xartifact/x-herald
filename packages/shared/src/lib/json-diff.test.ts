import { describe, expect, it } from 'bun:test'

import { applyJsonDiff, createJsonDiff, type JsonValue } from './json-diff'

describe('JSON diff', () => {
  it('round-trips nested objects, arrays, additions, and removals', () => {
    const source: JsonValue = {
      keep: 'same',
      nested: { remove: true, update: 1 },
      items: [1, { old: 'value' }, 3],
    }
    const target: JsonValue = {
      keep: 'same',
      nested: { update: 2, added: ['x'] },
      items: [1, { old: 'new' }, 4, 5],
    }

    expect(applyJsonDiff(source, createJsonDiff(source, target))).toEqual(target)
    expect(source).toEqual({
      keep: 'same',
      nested: { remove: true, update: 1 },
      items: [1, { old: 'value' }, 3],
    })
  })

  it('handles JSON Pointer escaping and root replacements', () => {
    const source: JsonValue = { 'a/b': { 'tilde~key': null } }
    const target: JsonValue = { 'a/b': { 'tilde~key': false } }
    expect(applyJsonDiff(source, createJsonDiff(source, target))).toEqual(target)

    expect(applyJsonDiff(source, createJsonDiff(source, null))).toBeNull()
    expect(applyJsonDiff(null, createJsonDiff(null, [1, 'two']))).toEqual([1, 'two'])
  })

  it('returns no operations for equal values', () => {
    const value: JsonValue = { values: [true, null, 3] }
    expect(createJsonDiff(value, value)).toEqual([])
  })
})
