import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AppearanceProvider, useAppearance } from './appearance-controls'

function PaletteConsumer() {
  const { palette, setPalette } = useAppearance()
  return <button onClick={() => setPalette('jade')}>{palette}</button>
}

describe('appearance preferences', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      clear: () => values.clear(),
    })
  })
  afterEach(() => vi.unstubAllGlobals())
  it('falls back for invalid palettes and persists changes without changing the mode', () => {
    localStorage.setItem('xartifact.palette', 'invalid')
    localStorage.setItem('theme', 'system')
    render(
      <AppearanceProvider>
        <PaletteConsumer />
      </AppearanceProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'iris' }))
    expect(document.documentElement.dataset.xartifactPalette).toBe('jade')
    expect(localStorage.getItem('xartifact.palette')).toBe('jade')
    expect(localStorage.getItem('theme')).toBe('system')
  })
  it('restores the saved palette', () => {
    localStorage.setItem('xartifact.palette', 'clay')
    render(
      <AppearanceProvider>
        <PaletteConsumer />
      </AppearanceProvider>,
    )
    expect(screen.getByRole('button', { name: 'clay' })).toBeInTheDocument()
    expect(document.documentElement.dataset.xartifactPalette).toBe('clay')
  })
})
