/**
 * i18n React bindings: context, provider, and the `useTranslation` hook.
 *
 * The provider owns two independent preferences — language and timezone — and
 * persists both to `localStorage`. They are separate because a user may want
 * English labels while still reading timestamps in their own zone; conflating
 * them would force a choice that has no reason to exist.
 *
 * No i18n library is involved: the catalogues come from
 * `@xartifact/x-herald-shared` and formatting from `Intl`. This file is the
 * React plumbing around them.
 *
 * @module apps/web/app/i18n/provider
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  getUserTimezone,
  isSupportedLocale,
  translate,
  type MessageKey,
  type MessageParams,
} from '@xartifact/x-herald-shared'

/** `localStorage` keys. Namespaced so they cannot collide with app state. */
const LOCALE_STORAGE_KEY = 'i18n.locale'
const TIMEZONE_STORAGE_KEY = 'i18n.timezone'

/** What `useTranslation` and the switcher need from the context. */
export interface I18nContextValue {
  /** Active locale. */
  readonly locale: string
  /** Active IANA timezone, used by the datetime helpers. */
  readonly timezone: string
  /** Translate a key, interpolating `{name}` placeholders. */
  readonly t: (key: MessageKey, params?: MessageParams) => string
  /** Switch locale; persisted. */
  readonly setLocale: (locale: string) => void
  /** Switch timezone; persisted. */
  readonly setTimezone: (timezone: string) => void
}

const I18nContext = createContext<I18nContextValue | null>(null)

/**
 * Read a persisted preference, tolerating unavailable storage.
 *
 * `localStorage` throws in private-mode Safari and is absent during SSR, so a
 * read failure must degrade to the default rather than break the first render.
 * @param key - storage key.
 * @returns the stored value, or null.
 */
function readStored(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

/**
 * Persist a preference, tolerating unavailable storage.
 * @param key - storage key.
 * @param value - value to store.
 */
function writeStored(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value)
  } catch {
    // Persistence is a convenience; failing it must not break the switch.
  }
}

/**
 * Initial locale: stored preference, else the browser's, else the baseline.
 *
 * An unsupported stored value is discarded rather than trusted — a stale key
 * from an older build must not select a catalogue that does not exist.
 * @returns a supported locale.
 */
function initialLocale(): string {
  const stored = readStored(LOCALE_STORAGE_KEY)
  if (stored !== null && isSupportedLocale(stored)) return stored

  const browser = globalThis.navigator?.language
  if (browser !== undefined) {
    const exact = SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === browser.toLowerCase())
    if (exact !== undefined) return exact
    // Fall back to the base language, matching the server-side negotiation rule:
    // a region we do not carry is not a reason to show a different language.
    const base = browser.split('-')[0]
    const byBase = SUPPORTED_LOCALES.find((locale) => locale.split('-')[0] === base)
    if (byBase !== undefined) return byBase
  }
  return DEFAULT_LOCALE
}

/**
 * Initial timezone: stored preference, else the browser's.
 * @returns an IANA timezone name.
 */
function initialTimezone(): string {
  return readStored(TIMEZONE_STORAGE_KEY) ?? getUserTimezone()
}

/**
 * Provide locale and timezone to the tree.
 *
 * `t` is memoised per locale, so consumers re-render when the language changes
 * and not on unrelated parent renders.
 * @param props - children to wrap.
 * @returns the provider element.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<string>(initialLocale)
  const [timezone, setTimezoneState] = useState<string>(initialTimezone)

  const setLocale = useCallback((next: string) => {
    // Reject an unsupported value rather than letting it select no catalogue.
    if (!isSupportedLocale(next)) return
    setLocaleState(next)
    writeStored(LOCALE_STORAGE_KEY, next)
  }, [])

  const setTimezone = useCallback((next: string) => {
    setTimezoneState(next)
    writeStored(TIMEZONE_STORAGE_KEY, next)
  }, [])

  const t = useCallback(
    (key: MessageKey, params?: MessageParams): string =>
      translate(key, locale, params, (miss) => {
        // A missing translation is a gap in a shipped catalogue, not a crash:
        // the baseline answers, and the gap is reported so it can be fixed.
        console.warn(
          `[i18n] missing ${FALLBACK_LOCALE} fallback for "${miss.key}" in ${miss.locale}`,
        )
      }),
    [locale],
  )

  const value = useMemo<I18nContextValue>(
    () => ({ locale, timezone, t, setLocale, setTimezone }),
    [locale, timezone, t, setLocale, setTimezone],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/**
 * Read the i18n context.
 * @returns locale, timezone, `t`, and the setters.
 * @throws {Error} when used outside {@link I18nProvider} — a silent fallback
 * would render raw keys with no indication of the missing provider.
 */
export function useTranslation(): I18nContextValue {
  const value = useContext(I18nContext)
  if (value === null) {
    throw new Error('useTranslation must be used within <I18nProvider>')
  }
  return value
}
