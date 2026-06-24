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