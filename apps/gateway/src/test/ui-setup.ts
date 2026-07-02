import '@testing-library/jest-dom/vitest'

// ResizeObserver polyfill — jsdom does not provide it, but Radix UI depends on it
const g = globalThis as unknown as Record<string, unknown>
if (g['ResizeObserver'] === undefined) {
  g['ResizeObserver'] = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// queryCommandSupported polyfill — jsdom does not provide it, but monaco-editor requires it
const doc = globalThis.document as unknown as Record<string, unknown>
if (typeof doc.queryCommandSupported !== 'function') {
  doc.queryCommandSupported = () => false
}