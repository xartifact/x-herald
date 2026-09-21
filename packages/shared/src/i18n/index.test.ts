import { describe, expect, it } from 'bun:test'

import {
  BASELINE_KEYS,
  CATALOGUES,
  CATALOGUE_LOCALES,
  interpolate,
  missingKeys,
  translate,
  unknownKeys,
} from './index'

/** Flatten a catalogue the same way the module does, for structural assertions. */
function flatten(tree: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = []
  for (const [name, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${name}` : name
    if (typeof value === 'string') out.push(path)
    else out.push(...flatten(value as Record<string, unknown>, path))
  }
  return out
}

describe('catalogues', () => {
  it('parses both shipped catalogues', () => {
    for (const locale of CATALOGUE_LOCALES) {
      expect(Object.keys(CATALOGUES[locale]).length).toBeGreaterThan(0)
    }
  })

  it('has the same key set in every locale', () => {
    // A translation missing a key is allowed at runtime (it falls back to
    // Chinese), but shipping one is a gap worth catching here rather than in
    // production.
    for (const locale of CATALOGUE_LOCALES) {
      expect(missingKeys(locale)).toEqual([])
    }
  })

  it('contains no key the baseline does not define', () => {
    // A typo'd key in a translation would be unreachable dead weight.
    expect(unknownKeys()).toEqual([])
  })

  it('uses only string leaves, never nested arrays', () => {
    for (const locale of CATALOGUE_LOCALES) {
      for (const key of flatten(CATALOGUES[locale] as Record<string, unknown>)) {
        expect(typeof key).toBe('string')
      }
    }
  })
})

describe('interpolate', () => {
  it('substitutes named placeholders', () => {
    expect(interpolate('{count} keys', { count: 3 })).toBe('3 keys')
  })

  it('leaves an unmatched placeholder verbatim rather than blanking it', () => {
    // A visible `{keyCount}` is a bug report; an empty string is a silent one.
    expect(interpolate('{missing} keys', { other: 1 })).toBe('{missing} keys')
    expect(interpolate('{count} keys')).toBe('{count} keys')
  })

  it('substitutes every occurrence', () => {
    expect(interpolate('{a}-{a}', { a: 'x' })).toBe('x-x')
  })
})

describe('translate', () => {
  it('returns the requested locale when the key exists', () => {
    expect(translate('common.save', 'en')).toBe('Save')
    expect(translate('common.save', 'zh-CN')).toBe('保存')
  })

  it('falls back to the baseline locale and reports the miss', () => {
    // Simulate a translation gap by asking for a locale with no catalogue.
    const misses: string[] = []
    const result = translate('common.save', 'fr', undefined, (m) => misses.push(m.locale))
    expect(result).toBe('保存')
    // 'fr' has no catalogue at all, so the miss is not reported as a gap in a
    // shipped translation — the baseline simply answers.
    expect(misses).toEqual([])
  })

  it('interpolates placeholders from the catalogue message', () => {
    expect(translate('errors.PROVIDER_HAS_KEYS', 'en', { keyCount: 2 })).toBe(
      'Cannot delete provider: 2 active key(s) remain',
    )
  })

  it('returns the key itself when no catalogue defines it', () => {
    // Loud rather than blank: an unknown key in the UI should be visible.
    expect(translate('common.nonexistent' as never, 'en')).toBe('common.nonexistent')
  })
})

describe('BASELINE_KEYS', () => {
  it('is derived from the zh-CN catalogue and matches it exactly', () => {
    const expected = flatten(CATALOGUES['zh-CN'] as Record<string, unknown>)
    expect([...BASELINE_KEYS].toSorted()).toEqual(expected.toSorted())
  })

  it('covers every namespace the UI needs', () => {
    const namespaces = new Set(BASELINE_KEYS.map((key) => key.split('.')[0]))
    expect(namespaces.has('common')).toBe(true)
    expect(namespaces.has('nav')).toBe(true)
    expect(namespaces.has('errors')).toBe(true)
  })
})
