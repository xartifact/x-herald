import { afterAll, describe, expect, it, mock } from 'bun:test'

import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent'

import { registerXGateCommand } from './commands.ts'
import type { GatewayModelEntry } from './types.ts'

// ── mocks ────────────────────────────────────────────────────────────────────
// mock.module 跨测试文件持久（同 worker 顺序执行时污染后续文件），
// afterAll 用官方 mock.restore() 还原真实模块。

afterAll(() => {
  mock.restore()
})
let currentApiKey: string | undefined = 'sk-test'
mock.module('./config.ts', () => ({
  resolveProviderConfig: mock(async () => ({
    runtime: 'pi' as const,
    baseUrl: 'http://localhost:5005/api/v1',
    apiKey: currentApiKey,
    api: 'openai-completions',
  })),
}))

let fetchResult: () => Promise<GatewayModelEntry[]> = async () => []
mock.module('./gateway.ts', () => ({
  fetchGatewayModels: mock(async () => fetchResult()),
}))

// ── harness ──────────────────────────────────────────────────────────────────

let handler: ((args: string, ctx: ExtensionCommandContext) => void | Promise<void>) | null = null
const fakePi: ExtensionAPI = {
  registerCommand: (_name, opts) => {
    handler = opts.handler
  },
  registerProvider: () => {},
  unregisterProvider: () => {},
  on: () => {},
  sendUserMessage: () => {},
}

registerXGateCommand(fakePi)

function makeCtx() {
  const notifications: Array<[string, string | undefined]> = []
  const widgets = new Map<string, string[]>()
  const ctx: ExtensionCommandContext = {
    ui: {
      notify: (message, level) => notifications.push([message, level]),
      setWidget: (key, content) => widgets.set(key, content ?? []),
      setStatus: () => {},
    },
    cwd: '/tmp',
    hasUI: true,
  }
  return { ctx, notifications, widgets }
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('/x-gate models', () => {
  it('lists models in a widget with a notification summary', async () => {
    fetchResult = async () => [
      {
        id: 'Explorer',
        context_window: 1048576,
        max_output_tokens: 131072,
        capabilities: { vision: true, reasoning: false, streaming: true },
      },
      {
        id: 'Plan',
        context_window: 8192,
        max_output_tokens: 4096,
        capabilities: { vision: false, reasoning: true },
      },
    ]
    const { ctx, notifications, widgets } = makeCtx()
    await handler!('models', ctx)

    const widget = widgets.get('x-gate-models') ?? []
    expect(widget[0]).toBe('x-gate models — http://localhost:5005/api/v1')
    expect(widget[1]).toBe('models: 2')
    expect(widget.join('\n')).toContain('Explorer')
    expect(widget.join('\n')).toMatch(/ctx\s+1048576/)
    expect(widget.join('\n')).toMatch(/max\s+131072/)
    expect(widget.join('\n')).toContain('vision, streaming')
    expect(notifications).toEqual([
      ['Models: 2 from http://localhost:5005/api/v1 — see widget above editor', 'info'],
    ])
  })

  it('warns on an empty catalogue without setting a widget', async () => {
    fetchResult = async () => []
    const { ctx, notifications, widgets } = makeCtx()
    await handler!('models', ctx)

    expect(notifications).toEqual([['Gateway returned an empty list.', 'warning']])
    expect(widgets.has('x-gate-models')).toBe(false)
  })

  it('notifies an error when the fetch fails', async () => {
    fetchResult = async () => {
      throw new Error('HTTP 500 from http://localhost:5005/api/v1/models')
    }
    const { ctx, notifications } = makeCtx()
    await handler!('models', ctx)

    expect(notifications).toEqual([
      ['Models fetch failed: HTTP 500 from http://localhost:5005/api/v1/models', 'error'],
    ])
  })

  it('requires an api key', async () => {
    currentApiKey = undefined
    try {
      const { ctx, notifications, widgets } = makeCtx()
      await handler!('models', ctx)
      expect(notifications).toEqual([['No API key configured.', 'error']])
      expect(widgets.has('x-gate-models')).toBe(false)
    } finally {
      currentApiKey = 'sk-test'
    }
  })
})
