import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'

import { CATALOGUES } from '../i18n'
import type { MessageKey } from './i18n'

/**
 * Drift guard for the hand-written key union.
 *
 * `MessageKey` is written by hand rather than derived from the JSON, because
 * TypeScript widens imported JSON leaves to `string` — a derived type would
 * accept any string and make `t('commom.save')` compile. The cost of that choice
 * is that the union can fall out of step with the catalogues, so the two are
 * asserted against each other here in both directions.
 */

/** Flatten a catalogue into dotted leaf paths. */
function flatten(tree: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = []
  for (const [name, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${name}` : name
    if (typeof value === 'string') out.push(path)
    else out.push(...flatten(value as Record<string, unknown>, path))
  }
  return out
}

/**
 * The declared key literals, read from the interface body.
 *
 * Scoped to `interface MessageKeyTree { … }` rather than the whole file: the
 * file's doc comments also quote key-shaped strings (the `'commom.save'` typo
 * example), and matching those would make this guard report phantom keys.
 * A union type has no runtime representation, so reading the source is the only
 * way to compare a type-level list against a value-level one.
 * @returns every distinct `namespace.key` literal the interface declares.
 */
function declaredKeys(): string[] {
  const source = readFileSync(new URL('./i18n.ts', import.meta.url).pathname, 'utf8')
  const body = /interface MessageKeyTree \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? ''
  const literals = [...body.matchAll(/'([a-zA-Z]+(?:\.[a-zA-Z_]+)+)'/g)].map((m) => m[1]!)
  return [...new Set(literals)]
}

describe('MessageKey union vs catalogues', () => {
  const declared = declaredKeys()
  const catalogue = flatten(CATALOGUES['zh-CN'] as Record<string, unknown>)

  it('extracts a non-trivial union, so the assertions below mean something', () => {
    // Without this, a regex that matched nothing would make both comparisons
    // pass vacuously.
    expect(declared.length).toBeGreaterThan(10)
  })

  it('declares a key for every catalogue entry', () => {
    const declaredSet = new Set(declared)
    const missing = catalogue.filter((key) => !declaredSet.has(key))
    expect(missing, `in the catalogue but not in MessageKey: ${missing.join(', ')}`).toEqual([])
  })

  it('declares no key the catalogue lacks', () => {
    const catalogueSet = new Set(catalogue)
    const extra = declared.filter((key) => !catalogueSet.has(key))
    expect(extra, `in MessageKey but not the catalogue: ${extra.join(', ')}`).toEqual([])
  })

  it('rejects a key that is not in the union', () => {
    // The compile-time guarantee, asserted at the type level: a typo must not be
    // assignable to MessageKey, while a real key must be.
    type IsAssignable<K extends string> = K extends MessageKey ? true : false
    const typoIsValid: IsAssignable<'commom.save'> = false
    const realIsValid: IsAssignable<'common.save'> = true
    expect(typoIsValid).toBe(false)
    expect(realIsValid).toBe(true)
  })
})
