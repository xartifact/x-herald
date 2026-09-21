import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'

import { I18nProvider, useTranslation } from './provider'

/**
 * Behaviour tests for the i18n provider.
 *
 * These assert what a consumer observes — the rendered string after switching
 * language, the value handed to `Intl`, and what survives a remount — rather
 * than the provider's internal state.
 */

/** A minimal consumer that exposes the context to assertions. */
function Probe() {
  const { t, locale, timezone, setLocale, setTimezone } = useTranslation()
  return (
    <div>
      <span data-testid="save">{t('common.save')}</span>
      <span data-testid="locale">{locale}</span>
      <span data-testid="timezone">{timezone}</span>
      <button data-testid="to-en" onClick={() => setLocale('en')} />
      <button data-testid="to-zh" onClick={() => setLocale('zh-CN')} />
      <button data-testid="to-unsupported" onClick={() => setLocale('fr')} />
      <button data-testid="tz-shanghai" onClick={() => setTimezone('Asia/Shanghai')} />
    </div>
  )
}

function renderProbe() {
  return render(
    <I18nProvider>
      <Probe />
    </I18nProvider>,
  )
}
/**
 * This test environment exposes `window` but no `localStorage` (jsdom here does
 * not install one, and the shared setup file does not add it). The provider is
 * written to tolerate that, but persistence is a behaviour worth testing, so a
 * minimal in-memory Storage stands in — the code under test still runs its real
 * read/write path.
 */
function installStorageStub(): void {
  const store = new Map<string, string>()
  const stub = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: stub,
    configurable: true,
    writable: true,
  })
}

/**
 * Pin the browser language.
 *
 * `initialLocale()` consults `navigator.language`, so without pinning it the
 * default depends on the machine running the suite — the assertions below would
 * mean different things on different hosts.
 * @param language - value to report as the browser's preferred language.
 */
function setBrowserLanguage(language: string): void {
  Object.defineProperty(globalThis, 'navigator', {
    value: { language },
    configurable: true,
    writable: true,
  })
}

beforeEach(() => {
  installStorageStub()
  localStorage.clear()
  // No browser preference: the baseline language is the documented default.
  setBrowserLanguage('')
})

afterEach(() => {
  localStorage.clear()
})

describe('I18nProvider', () => {
  it('translates using the active locale', () => {
    renderProbe()
    // Default locale is Chinese (the baseline), so the Chinese message renders.
    expect(screen.getByTestId('save').textContent).toBe('保存')
  })

  it('re-renders consumers with the new language when the locale changes', () => {
    renderProbe()
    act(() => screen.getByTestId('to-en').click())
    expect(screen.getByTestId('save').textContent).toBe('Save')
    act(() => screen.getByTestId('to-zh').click())
    expect(screen.getByTestId('save').textContent).toBe('保存')
  })

  it('persists the chosen locale and restores it on remount', () => {
    const first = renderProbe()
    act(() => screen.getByTestId('to-en').click())
    expect(localStorage.getItem('i18n.locale')).toBe('en')
    first.unmount()

    renderProbe()
    expect(screen.getByTestId('save').textContent).toBe('Save')
  })

  it('ignores an unsupported locale rather than selecting a missing catalogue', () => {
    renderProbe()
    act(() => screen.getByTestId('to-en').click())
    act(() => screen.getByTestId('to-unsupported').click())
    // Still English: a value with no catalogue must not take effect.
    expect(screen.getByTestId('locale').textContent).toBe('en')
    expect(screen.getByTestId('save').textContent).toBe('Save')
    expect(localStorage.getItem('i18n.locale')).toBe('en')
  })

  it('tracks timezone independently of locale', () => {
    renderProbe()
    act(() => screen.getByTestId('tz-shanghai').click())
    expect(screen.getByTestId('timezone').textContent).toBe('Asia/Shanghai')
    // Changing the language must not disturb the zone, and vice versa: the two
    // preferences are deliberately independent.
    act(() => screen.getByTestId('to-en').click())
    expect(screen.getByTestId('timezone').textContent).toBe('Asia/Shanghai')
    expect(localStorage.getItem('i18n.timezone')).toBe('Asia/Shanghai')
  })

  it('restores a persisted timezone on remount', () => {
    const first = renderProbe()
    act(() => screen.getByTestId('tz-shanghai').click())
    first.unmount()
    renderProbe()
    expect(screen.getByTestId('timezone').textContent).toBe('Asia/Shanghai')
  })

  it('discards a stored locale that is no longer supported', () => {
    // A stale key from an older build must not select a catalogue that is gone.
    localStorage.setItem('i18n.locale', 'fr')
    renderProbe()
    expect(screen.getByTestId('locale').textContent).toBe('zh-CN')
  })
})

describe('useTranslation outside the provider', () => {
  it('throws instead of rendering raw keys with no indication', () => {
    // A silent fallback would show `common.save` in the UI and look like a
    // missing translation rather than a missing provider.
    const silence = console.error
    console.error = () => {}
    try {
      expect(() => render(<Probe />)).toThrow(/I18nProvider/)
    } finally {
      console.error = silence
    }
  })
})
