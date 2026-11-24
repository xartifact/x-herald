import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

import { Window } from 'happy-dom'

/**
 * 让 Radix 的卸载回调在本文件的生命周期内跑完。
 *
 * FocusScope 的 cleanup 里排了一个 `setTimeout(..., 0)`：它构造
 * `CustomEvent` 并 dispatch。若测试文件在定时器触发前就结束，jsdom 环境已被
 * 拆解，事件构造抛 "parameter 1 is not of type 'Event'"，成为未捕获异常——
 * 测试全绿但 vitest 判整次失败，表现为随机红。
 *
 * 这里主动等一个宏任务，把那批 0 延迟回调放完，再让测试文件收尾。
 * 比 `vi.clearAllTimers()` 可靠：后者只对 fake timers 生效，对真实定时器是空操作。
 *
 * 注：这是针对该时序的**定向缓解**，不是已被复现验证的修复——原 flake 依赖真实
 * Radix 组件与文件结束时机，用合成组件无法稳定重现。若后续再见到同类未捕获异常，
 * 应从这里继续查，而不是另加一层等待。
 */
function flushRadixUnmountCallbacks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

afterEach(async () => {
  cleanup()
  await flushRadixUnmountCallbacks()
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
