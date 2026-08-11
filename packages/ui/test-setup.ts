/**
 * Test preload: 在任何模块加载前建立最小 DOM 全局对象
 *
 * monaco-editor 等大型库会在 import 阶段访问 `window` 等浏览器 API,
 * bun:test 默认在 Node 环境运行,会因 window 未定义而崩溃。
 * 这里用 happy-dom 提供一个轻量级 DOM 仿真,在测试模块加载前注入。
 */
import { Window } from 'happy-dom'

const window = new Window({ url: 'http://localhost' })

const g = globalThis as Record<string, unknown>

g.window = window
g.document = window.document
g.navigator = window.navigator
g.location = window.location
g.history = window.history
g.localStorage = window.localStorage
g.sessionStorage = window.sessionStorage

// Element / Node hierarchy
g.HTMLElement = window.HTMLElement
g.HTMLInputElement = window.HTMLInputElement
g.HTMLButtonElement = window.HTMLButtonElement
g.HTMLFormElement = window.HTMLFormElement
g.HTMLSelectElement = window.HTMLSelectElement
g.HTMLTextAreaElement = window.HTMLTextAreaElement
g.HTMLDivElement = window.HTMLDivElement
g.HTMLSpanElement = window.HTMLSpanElement
g.HTMLAnchorElement = window.HTMLAnchorElement
g.Node = window.Node
g.Element = window.Element
g.Document = window.Document
g.DocumentFragment = window.DocumentFragment
g.Text = window.Text
g.Comment = window.Comment
g.SVGElement = window.SVGElement

// Events — React 19 / Testing Library 需要这些构造函数
g.Event = window.Event
g.CustomEvent = window.CustomEvent
g.UIEvent = window.UIEvent
g.MouseEvent = window.MouseEvent
g.KeyboardEvent = window.KeyboardEvent
g.FocusEvent = window.FocusEvent
g.InputEvent = window.InputEvent
g.PointerEvent = window.PointerEvent
g.WheelEvent = window.WheelEvent
g.TouchEvent = window.TouchEvent
g.ClipboardEvent = window.ClipboardEvent
g.DragEvent = window.DragEvent
g.SubmitEvent = window.SubmitEvent
g.MessageEvent = window.MessageEvent
g.ErrorEvent = window.ErrorEvent
g.ProgressEvent = window.ProgressEvent
g.AnimationEvent = window.AnimationEvent
g.TransitionEvent = window.TransitionEvent
g.CompositionEvent = window.CompositionEvent

// Misc browser APIs
g.DOMParser = window.DOMParser
g.XMLSerializer = window.XMLSerializer
g.MutationObserver = window.MutationObserver
g.ResizeObserver = window.ResizeObserver
g.IntersectionObserver = window.IntersectionObserver
g.getComputedStyle = window.getComputedStyle.bind(window)
g.getSelection = window.getSelection.bind(window)
g.matchMedia =
  window.matchMedia?.bind(window) ??
  ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))

g.requestAnimationFrame = (cb: FrameRequestCallback) =>
  setTimeout(() => cb(performance.now()), 16) as unknown as number
g.cancelAnimationFrame = (id: number) => clearTimeout(id)

// React 有时会检查这些
if (typeof g.IS_REACT_ACT_ENVIRONMENT === 'undefined') {
  g.IS_REACT_ACT_ENVIRONMENT = true
}
