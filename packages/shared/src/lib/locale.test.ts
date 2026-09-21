import { describe, expect, it } from 'bun:test'

import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  LOCALE_METADATA,
  SUPPORTED_LOCALES,
  getLocaleDisplayName,
  isSupportedLocale,
  negotiateLocale,
  parseAcceptLanguage,
} from './locale'

describe('parseAcceptLanguage', () => {
  it('orders by quality, not header order', () => {
    const parsed = parseAcceptLanguage('en;q=0.8, zh-CN;q=0.9')
    expect(parsed.map((p) => p.tag)).toEqual(['zh-cn', 'en'])
  })

  it('defaults missing q to 1 and keeps header order for ties', () => {
    const parsed = parseAcceptLanguage('zh-CN, en')
    expect(parsed.map((p) => p.quality)).toEqual([1, 1])
    expect(parsed.map((p) => p.tag)).toEqual(['zh-cn', 'en'])
  })

  it('drops q=0 entries, which mean explicitly unacceptable', () => {
    const parsed = parseAcceptLanguage('en;q=0, zh-CN;q=0.5')
    expect(parsed.map((p) => p.tag)).toEqual(['zh-cn'])
  })

  it('ignores malformed input instead of throwing', () => {
    // A header is untrusted client input; a bad one must not fail the request.
    expect(parseAcceptLanguage('')).toEqual([])
    expect(parseAcceptLanguage(null)).toEqual([])
    expect(parseAcceptLanguage(undefined)).toEqual([])
    expect(parseAcceptLanguage(',,,;q=;')).toEqual([])
  })
})

describe('negotiateLocale', () => {
  it('matches an exact supported tag', () => {
    expect(negotiateLocale('zh-CN,zh;q=0.9,en;q=0.8')).toBe('zh-CN')
    expect(negotiateLocale('en-US,en;q=0.9')).toBe('en')
  })

  it('falls back to the base language for an unsupported region', () => {
    // Only one Chinese catalogue ships, so any zh-* region must resolve to it
    // rather than falling through to English.
    expect(negotiateLocale('zh-TW')).toBe('zh-CN')
    expect(negotiateLocale('zh-Hans-CN')).toBe('zh-CN')
    expect(negotiateLocale('en-GB')).toBe('en')
  })

  it('uses the default locale when nothing matches', () => {
    expect(negotiateLocale('fr-FR,de;q=0.8')).toBe(DEFAULT_LOCALE)
    expect(negotiateLocale(null)).toBe(DEFAULT_LOCALE)
  })

  it('skips an unacceptable entry and takes the next one', () => {
    expect(negotiateLocale('zh-CN;q=0, en;q=0.5')).toBe('en')
  })

  it('respects quality order over header order', () => {
    expect(negotiateLocale('en;q=0.3, zh-CN;q=0.9')).toBe('zh-CN')
  })
})

describe('locale metadata', () => {
  it('describes every supported locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const metadata = LOCALE_METADATA[locale]
      expect(metadata.code).toBe(locale)
      expect(metadata.displayName.length).toBeGreaterThan(0)
      expect(metadata.englishName.length).toBeGreaterThan(0)
      expect(['ltr', 'rtl']).toContain(metadata.direction)
    }
  })

  it('uses Chinese as both the default and the fallback (baseline language)', () => {
    expect(DEFAULT_LOCALE).toBe('zh-CN')
    expect(FALLBACK_LOCALE).toBe('zh-CN')
    expect(isSupportedLocale(FALLBACK_LOCALE)).toBe(true)
  })

  it('names supported locales and passes unknown ones through', () => {
    expect(getLocaleDisplayName('zh-CN')).toBe('简体中文')
    expect(getLocaleDisplayName('en')).toBe('English')
    expect(getLocaleDisplayName('ja')).toBe('ja')
  })

  it('rejects unsupported tags', () => {
    expect(isSupportedLocale('zh-CN')).toBe(true)
    expect(isSupportedLocale('fr')).toBe(false)
    expect(isSupportedLocale('')).toBe(false)
  })
})
