import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

import { Window } from 'happy-dom'

afterEach(() => {
  cleanup()
})

const window = new Window({ url: 'http://localhost' })

const g = globalThis as Record<string, unknown>

g.NodeFilter = window.NodeFilter

if (!g.ResizeObserver) {
  g.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

if (!g.IntersectionObserver) {
  g.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
}

if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {}
}

if (typeof document !== 'undefined' && !document.queryCommandSupported) {
  document.queryCommandSupported = () => true
}

if (typeof document !== 'undefined' && !document.execCommand) {
  document.execCommand = () => false
}
