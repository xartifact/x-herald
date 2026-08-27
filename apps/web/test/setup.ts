/**
 * bun test setup for apps/web (UI tests *.ui.test.ts*)
 *
 * Why this exists:
 *   - monaco-editor reads `window` at module-load time
 *   - bun test ships its own `vi` that lacks `vi.mocked`
 *   - @testing-library/react's renderHook needs a real DOM container
 *
 * Strategy:
 *   1. mock.module() to stub monaco-editor / @monaco-editor/react so
 *      JsonViewer / JsonDiffViewer are no-ops at import time.
 *   2. Add `mocked` to bun's `vi` shim.
 *   3. Install jsdom as the global DOM environment — needed for
 *      renderHook / React 19's createRoot.
 *
 * jsdom is a runtime dependency of vitest, so it's already in the
 * monorepo node_modules tree.
 */

import { mock, vi } from 'bun:test'

// vi.mocked shim — bun:test's vi doesn't ship `mocked`.
;(vi as unknown as { mocked?: unknown }).mocked = <T>(fn: T): T => fn

mock.module('monaco-editor', () => ({
  editor: { defineTheme: () => {}, create: () => ({}) },
  languages: { register: () => {}, setMonarchTokensProvider: () => {} },
  MarkerSeverity: { Hint: 1, Info: 2, Warning: 3, Error: 4 },
  Range: class {
    constructor(
      public sl: number,
      public sc: number,
      public el: number,
      public ec: number,
    ) {}
  },
  default: {},
}))

mock.module('@monaco-editor/react', () => ({
  default: () => null,
  Editor: () => null,
  DiffEditor: () => null,
  loader: { config: () => {}, init: () => Promise.resolve() },
  useMonaco: () => null,
  onChange: () => {},
  onValidate: () => {},
}))

// Install jsdom for DOM globals (window, document, navigator, etc.).
// Doing this BEFORE any test code runs avoids the monaco
// "window is not defined" crash even when vi.mock doesn't intercept.
const { JSDOM } = await import('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})
const g = globalThis as unknown as Record<string, unknown>

// Install only the globals if not already present.
const install = (key: string, value: unknown) => {
  if (g[key] === undefined) g[key] = value
}
install('window', dom.window)
install('document', dom.window.document)
install('navigator', dom.window.navigator)
install('HTMLElement', dom.window.HTMLElement)
install('Element', dom.window.Element)
install('Node', dom.window.Node)
install('getComputedStyle', dom.window.getComputedStyle.bind(dom.window))
install('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(cb, 16))
install('cancelAnimationFrame', (id: number) => clearTimeout(id))
install('HTMLFormElement', dom.window.HTMLFormElement)
install('HTMLInputElement', dom.window.HTMLInputElement)
install('HTMLTextAreaElement', dom.window.HTMLTextAreaElement)
install('HTMLSelectElement', dom.window.HTMLSelectElement)
install('HTMLButtonElement', dom.window.HTMLButtonElement)
install('HTMLDivElement', dom.window.HTMLDivElement)
install('CustomEvent', dom.window.CustomEvent)
install('Event', dom.window.Event)
install('KeyboardEvent', dom.window.KeyboardEvent)
install('MouseEvent', dom.window.MouseEvent)
install('PointerEvent', dom.window.PointerEvent)
install('FocusEvent', dom.window.FocusEvent)
install('MutationObserver', dom.window.MutationObserver)
install('CSSStyleSheet', dom.window.CSSStyleSheet)
// ResizeObserver polyfill (Radix UI deps)
if (g['ResizeObserver'] === undefined) {
  g['ResizeObserver'] = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
}

// matchMedia polyfill
if (typeof g['matchMedia'] === 'undefined') {
  g['matchMedia'] = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

// IntersectionObserver polyfill
if (g['IntersectionObserver'] === undefined) {
  g['IntersectionObserver'] = class IntersectionObserver {
    readonly root: Element | null = null
    readonly rootMargin = '0px'
    readonly thresholds: ReadonlyArray<number> = []
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  }
}

// queryCommandSupported — required by monaco (defensive)
const doc = g['document'] as { queryCommandSupported?: (cmd: string) => boolean } | undefined
if (doc && typeof doc.queryCommandSupported !== 'function') {
  doc.queryCommandSupported = () => false
}
