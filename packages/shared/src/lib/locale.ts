/**
 * Locale metadata and negotiation.
 *
 * Baseline language is Chinese (`zh-CN`): it is the source language of the
 * message catalogues and the fallback for every other locale. English is a
 * translation on top of it. Adding a locale means adding one row here and one
 * JSON catalogue; nothing else in the codebase branches on a locale name.
 *
 * No i18n library is involved — `Intl` covers the formatting, and the
 * negotiation below is small enough to own outright. See
 * `docs/i18n-architecture.md`.
 *
 * @module @xartifact/x-herald-shared/lib/locale
 */

/** Locales the application ships catalogues for. */
export const SUPPORTED_LOCALES = ['zh-CN', 'en'] as const

/** A locale the application can render. */
export type Locale = (typeof SUPPORTED_LOCALES)[number]

/** Locale used when the caller expresses no usable preference. */
export const DEFAULT_LOCALE: Locale = 'zh-CN'

/** Locale whose catalogue is complete and authoritative; other locales fall back to it. */
export const FALLBACK_LOCALE: Locale = 'zh-CN'

/** One locale's presentation metadata. */
export interface LocaleMetadata {
  /** BCP 47 tag, also the catalogue file name. */
  readonly code: Locale
  /** Name shown in the locale switcher, in the locale's own language. */
  readonly displayName: string
  /** Name shown in English, for logs and diagnostics. */
  readonly englishName: string
  /** Writing direction, for the document element. */
  readonly direction: 'ltr' | 'rtl'
}

/** Presentation metadata for every supported locale. */
export const LOCALE_METADATA: Readonly<Record<Locale, LocaleMetadata>> = {
  'zh-CN': {
    code: 'zh-CN',
    displayName: '简体中文',
    englishName: 'Simplified Chinese',
    direction: 'ltr',
  },
  en: {
    code: 'en',
    displayName: 'English',
    englishName: 'English',
    direction: 'ltr',
  },
}

/** One parsed `Accept-Language` entry. */
interface LanguagePreference {
  /** Lowercased tag as sent by the client. */
  readonly tag: string
  /** Quality value; defaults to 1 when the client omits `q`. */
  readonly quality: number
}

/**
 * Parse an `Accept-Language` header into ordered preferences.
 *
 * Malformed entries are dropped rather than throwing: a header is untrusted
 * client input, and a bad one must not fail the request.
 * @param header - raw header value, or null/undefined when absent.
 * @returns preferences ordered by descending quality (ties keep header order).
 */
export function parseAcceptLanguage(header: string | null | undefined): LanguagePreference[] {
  if (!header) return []
  const parsed: LanguagePreference[] = []
  for (const part of header.split(',')) {
    const [rawTag, ...params] = part.trim().split(';')
    const tag = rawTag?.trim().toLowerCase()
    if (!tag) continue
    let quality = 1
    for (const param of params) {
      const [key, value] = param.trim().split('=')
      if (key?.trim().toLowerCase() !== 'q') continue
      const parsedQuality = Number.parseFloat(value ?? '')
      if (Number.isFinite(parsedQuality)) quality = parsedQuality
    }
    // q=0 means "explicitly not acceptable" — drop it.
    if (quality > 0) parsed.push({ tag, quality })
  }
  return parsed
    .map((entry, index) => ({ entry, index }))
    .toSorted((a, b) => b.entry.quality - a.entry.quality || a.index - b.index)
    .map(({ entry }) => entry)
}

/**
 * Match one requested tag against the supported locales.
 *
 * Matching is deliberately two-tiered: an exact tag wins, otherwise the base
 * language matches (`zh-Hans-CN` and `zh-TW` both resolve to `zh-CN`, which is
 * the only Chinese catalogue shipped). A region the catalogues do not carry is
 * not a reason to show English.
 * @param tag - lowercased tag from the header.
 * @returns the matching supported locale, or undefined.
 */
function matchLocale(tag: string): Locale | undefined {
  const exact = SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === tag)
  if (exact) return exact
  const base = tag.split('-')[0]
  if (!base) return undefined
  return SUPPORTED_LOCALES.find((locale) => locale.split('-')[0] === base)
}

/**
 * Choose the locale to render for a client's stated preferences.
 * @param header - raw `Accept-Language` header, or null/undefined.
 * @returns the best supported locale, or {@link DEFAULT_LOCALE} when nothing matches.
 */
export function negotiateLocale(header: string | null | undefined): Locale {
  for (const preference of parseAcceptLanguage(header)) {
    const matched = matchLocale(preference.tag)
    if (matched) return matched
  }
  return DEFAULT_LOCALE
}

/**
 * Display name for a locale, for UI and logs.
 * @param locale - a supported locale, or any string to fall back gracefully.
 * @returns the locale's own-language name, or the input when unsupported.
 */
export function getLocaleDisplayName(locale: string): string {
  const metadata = LOCALE_METADATA[locale as Locale]
  return metadata?.displayName ?? locale
}

/**
 * Whether a string is a locale the application can render.
 * @param value - candidate locale tag.
 * @returns true when the value is supported.
 */
export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}
