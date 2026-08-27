import { describe, expect, it } from 'bun:test'

import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent'

import { registerXGateCommand, type CommandDeps } from './commands.ts'
import type { GatewayModelEntry } from './types.ts'

// ── harness ──────────────────────────────────────────────────────────────────
// Dependencies are injected (registerXGateCommand's second arg) instead of
// mock.module — bun's mock.module leaks across test files in the same worker
// and mock.restore() does not undo it. This keeps commands tests isolated.

let currentApiKey: string | undefined = 'sk-test'
let fetchResult: () => Promise<GatewayModelEntry[]> = async () => []

const deps: CommandDeps = {
  resolveProviderConfig: async () => ({
    runtime: 'pi' as const,
    baseUrl: 'http://localhost:5005/api/v1',
    apiKey: currentApiKey,
    api: 'openai-completions',
  }),
  fetchGatewayModels: async () => fetchResult(),
  discoverModels: async () => [
    {
      id: 'Explorer',
      name: 'Explorer',
      reasoning: false,
      input: ['text', 'image'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 1048576,
      maxTokens: 131072,
    },
  ],
  buildProviderConfig: (opts) => ({ ...opts }),
  diagnoseEntries: (entries, baseUrl) => ({
    total: entries.length,
    pass: entries.length,
    fail: 0,
    lines: entries.map((e) => `ok ${e.id}`),
  }),
}

let handler: ((args: string, ctx: ExtensionCommandContext) => void | Promise<void>) | null = null
const fakePi: ExtensionAPI = {
  registerCommand: (_name, opts) => {
    handler = opts.handler
  },
  registerProvider: () => {},
  unregisterProvider: () => {},
  on: () => {},
  sendUserMessage: () => {},
  exec: async () => ({ stdout: '', stderr: '', code: 0, killed: false }),
}

registerXGateCommand(fakePi, deps)

function makeCtx() {
  const notifications: Array<[string, string | undefined]> = []
  const widgets = new Map<string, string[]>()
  const ctx: ExtensionCommandContext = {
    ui: {
      notify: (msg, level) => {
        notifications.push([msg, level])
      },
      setWidget: (key, content) => {
        widgets.set(key, content ?? [])
      },
      setStatus: () => {},
    },
    cwd: '/tmp',
    hasUI: true,
  }
  return { ctx, notifications, widgets }
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('/x-herald models', () => {
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

    const widget = widgets.get('x-herald-models') ?? []
    expect(widget[0]).toBe('x-herald models — http://localhost:5005/api/v1')
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
    expect(widgets.has('x-herald-models')).toBe(false)
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
      expect(widgets.has('x-herald-models')).toBe(false)
    } finally {
      currentApiKey = 'sk-test'
    }
  })
})
describe('/x-herald setup', () => {
  it('renders modelRoles with all :xhigh onto the x-herald-setup widget', async () => {
    fetchResult = async () => [
      { id: 'Explorer', context_window: 1048576, max_output_tokens: 131072 },
      { id: 'Architect', context_window: 1048576, max_output_tokens: 131072 },
      { id: 'Designer', context_window: 1048576, max_output_tokens: 131072 },
      { id: 'Plan', context_window: 1048576, max_output_tokens: 131072 },
      { id: 'DomainExpert', context_window: 1048576, max_output_tokens: 131072 },
    ]
    const { ctx, notifications, widgets } = makeCtx()
    await handler!('setup', ctx)

    const widget = widgets.get('x-herald-setup') ?? []
    const body = widget.join('\n')
    expect(body).toContain('modelRoles:')
    expect(body).toContain('  smol: x-herald/Explorer:xhigh')
    expect(body).toContain('  slow: x-herald/Architect:xhigh')
    expect(body).toContain('  plan: x-herald/Plan:xhigh')
    expect(body).toContain('  advisor: x-herald/DomainExpert:xhigh')
    // every rendered role carries the :xhigh suffix
    for (const line of widget.filter(
      (l) => l.trim().startsWith('default:') || l.trim().includes(': x-'),
    )) {
      if (line.startsWith('  ')) expect(line).toMatch(/:xhigh$/)
    }
    expect(notifications).toEqual([['Setup: 10 roles mapped (all :xhigh) — see widget', 'info']])
  })

  it('reports missing roles when candidates are absent from the catalogue', async () => {
    fetchResult = async () => [
      { id: 'Explorer', context_window: 1048576, max_output_tokens: 131072 },
      { id: 'Plan', context_window: 1048576, max_output_tokens: 131072 },
    ]
    const { ctx, notifications, widgets } = makeCtx()
    await handler!('setup', ctx)

    const widget = widgets.get('x-herald-setup') ?? []
    const body = widget.join('\n')
    expect(body).toContain('⚠ missing from catalogue: slow, vision, designer, advisor')
    expect(notifications).toEqual([['Setup: 6 roles mapped, 4 missing — see widget', 'info']])
  })

  it('warns on an empty catalogue without setting a widget', async () => {
    fetchResult = async () => []
    const { ctx, notifications, widgets } = makeCtx()
    await handler!('setup', ctx)

    expect(notifications).toEqual([['Gateway returned an empty list.', 'warning']])
    expect(widgets.has('x-herald-setup')).toBe(false)
  })

  it('notifies an error when the fetch fails', async () => {
    fetchResult = async () => {
      throw new Error('HTTP 500 from http://localhost:5005/api/v1/models')
    }
    const { ctx, notifications } = makeCtx()
    await handler!('setup', ctx)

    expect(notifications).toEqual([
      ['Setup failed: HTTP 500 from http://localhost:5005/api/v1/models', 'error'],
    ])
  })
})
