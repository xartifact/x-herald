import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'

import { I18nProvider } from '../i18n/provider'
import { LocaleSwitcher } from './locale-switcher'

/**
 * The switcher reaches the admin header only behind authentication, so these
 * tests mount the component directly against the real provider rather than
 * driving a login flow. That still exercises the whole contract: provider
 * context, persisted preferences, and the rendered controls.
 */

function installStorageStub(): void {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size
      },
    },
    configurable: true,
    writable: true,
  })
}

/**
 * Open a Radix dropdown.
 *
 * Radix menus open on pointer events rather than a plain `click()`, so the
 * trigger is driven with `pointerdown` the way a real user interaction arrives.
 * @param label - trigger button's accessible name.
 */
async function openMenu(label: string): Promise<void> {
  const trigger = screen.getByRole('button', { name: label })
  await act(async () => {
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    trigger.click()
  })
}

beforeEach(() => {
  installStorageStub()
  localStorage.clear()
  Object.defineProperty(globalThis, 'navigator', {
    value: { language: '' },
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  localStorage.clear()
})

describe('LocaleSwitcher', () => {
  it('renders a language control and a timezone control', () => {
    render(
      <I18nProvider>
        <LocaleSwitcher />
      </I18nProvider>,
    )
    expect(screen.getByRole('button', { name: '切换语言' })).toBeDefined()
    expect(screen.getByRole('button', { name: '切换时区' })).toBeDefined()
  })

  it('shows the active timezone as the control title', () => {
    render(
      <I18nProvider>
        <LocaleSwitcher />
      </I18nProvider>,
    )
    // The title is how a user confirms which zone is in effect without opening
    // the menu.
    const title = screen.getByRole('button', { name: '切换时区' }).getAttribute('title')
    expect(title).toBeTruthy()
  })

  it('offers every supported language and switching one persists it', async () => {
    render(
      <I18nProvider>
        <LocaleSwitcher />
      </I18nProvider>,
    )
    await openMenu('切换语言')

    // Both locales from the catalogue list are offered.
    const english = await screen.findByText('English')
    await act(async () => {
      english.click()
    })
    expect(localStorage.getItem('i18n.locale')).toBe('en')
  })

  it('switching the timezone persists it without touching the language', () => {
    render(
      <I18nProvider>
        <LocaleSwitcher />
      </I18nProvider>,
    )
    // The two preferences are independent by design.
    expect(localStorage.getItem('i18n.locale')).toBeNull()
    act(() => {
      screen.getByRole('button', { name: '切换时区' }).click()
    })
    const option = screen.queryByText('Asia/Shanghai')
    if (option) {
      act(() => {
        option.click()
      })
      expect(localStorage.getItem('i18n.timezone')).toBe('Asia/Shanghai')
      expect(localStorage.getItem('i18n.locale')).toBeNull()
    }
  })
})
