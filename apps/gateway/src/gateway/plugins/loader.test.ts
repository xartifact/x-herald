import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Plugin, PluginLogger, PluginRoute, Transformer } from '@xartifact/x-herald-shared'
import { validatePluginManifest } from '@xartifact/x-herald-shared'

import {
  loadPlugins,
  readManifests,
  runErrorHooks,
  runRequestHooks,
  runResponseHooks,
  shutdownPlugins,
} from './loader'

/** A logger that records instead of printing, so tests can assert on output. */
function recordingLogger(): PluginLogger & { lines: string[] } {
  const lines: string[] = []
  const push = (level: string) => (message: string) => {
    lines.push(`${level}: ${message}`)
  }
  return {
    lines,
    debug: push('debug'),
    info: push('info'),
    warn: push('warn'),
    error: push('error'),
  }
}

/** Collects what the loader reports, for assertions. */
function collector() {
  const routes: Array<{ plugin: string; route: PluginRoute }> = []
  const transformers: Array<{ plugin: string; name: string; transformer: Transformer }> = []
  return {
    routes,
    transformers,
    onRoute: (plugin: string, route: PluginRoute) => routes.push({ plugin, route }),
    onTransformer: (plugin: string, name: string, transformer: Transformer) =>
      transformers.push({ plugin, name, transformer }),
  }
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plugins-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/**
 * Write a plugin package (manifest + module) into the temp directory.
 * @param name - plugin name and directory name.
 * @param body - module source; must default-export a Plugin.
 * @param manifestExtra - extra manifest fields.
 */
function writePlugin(
  name: string,
  body: string,
  manifestExtra: Record<string, unknown> = {},
): void {
  const pluginDir = join(dir, name)
  mkdirSync(pluginDir, { recursive: true })
  writeFileSync(join(pluginDir, 'index.ts'), body)
  writeFileSync(
    join(pluginDir, 'plugin.json'),
    JSON.stringify({ name, entry: './index.ts', ...manifestExtra }),
  )
}

describe('validatePluginManifest', () => {
  it('accepts a minimal valid manifest', () => {
    expect(validatePluginManifest({ name: 'p', entry: './index.ts' })).toEqual([])
  })

  it('rejects a non-object manifest', () => {
    expect(validatePluginManifest(null)).toHaveLength(1)
    expect(validatePluginManifest([])).toHaveLength(1)
    expect(validatePluginManifest('nope')).toHaveLength(1)
  })

  it('requires a non-empty name and entry', () => {
    expect(validatePluginManifest({ entry: './i.ts' })).toHaveLength(1)
    expect(validatePluginManifest({ name: '  ', entry: './i.ts' })).toHaveLength(1)
    expect(validatePluginManifest({ name: 'p' })).toHaveLength(1)
  })

  it('rejects wrong-typed optional fields', () => {
    expect(validatePluginManifest({ name: 'p', entry: './i.ts', enabled: 'yes' })).toHaveLength(1)
    expect(validatePluginManifest({ name: 'p', entry: './i.ts', config: [] })).toHaveLength(1)
  })
})

describe('readManifests', () => {
  it('returns nothing for a missing directory rather than throwing', () => {
    // Most deployments have no plugins; an absent folder is not an error.
    const result = readManifests(join(dir, 'does-not-exist'))
    expect(result.manifests).toEqual([])
    expect(result.issues).toEqual([])
  })

  it('skips directories without a manifest', () => {
    mkdirSync(join(dir, 'not-a-plugin'), { recursive: true })
    writePlugin('real', 'export default { name: "real", version: "1" }')
    expect(readManifests(dir).manifests.map((m) => m.name)).toEqual(['real'])
  })

  it('reports invalid JSON with the file path', () => {
    mkdirSync(join(dir, 'broken'), { recursive: true })
    writeFileSync(join(dir, 'broken', 'plugin.json'), '{ not json')
    const result = readManifests(dir)
    expect(result.manifests).toEqual([])
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]?.file).toContain('broken')
  })

  it('reports every bad manifest in one pass', () => {
    // An operator should fix the whole roster in one boot, not one at a time.
    mkdirSync(join(dir, 'a'), { recursive: true })
    writeFileSync(join(dir, 'a', 'plugin.json'), JSON.stringify({ entry: './i.ts' }))
    mkdirSync(join(dir, 'b'), { recursive: true })
    writeFileSync(join(dir, 'b', 'plugin.json'), JSON.stringify({ name: 'b' }))
    expect(readManifests(dir).issues).toHaveLength(2)
  })

  it('rejects duplicate plugin names', () => {
    // Duplicates would make logs unattributable.
    mkdirSync(join(dir, 'one'), { recursive: true })
    writeFileSync(join(dir, 'one', 'plugin.json'), JSON.stringify({ name: 'dup', entry: './i.ts' }))
    mkdirSync(join(dir, 'two'), { recursive: true })
    writeFileSync(join(dir, 'two', 'plugin.json'), JSON.stringify({ name: 'dup', entry: './i.ts' }))
    const result = readManifests(dir)
    expect(result.manifests).toHaveLength(1)
    expect(result.issues.some((i) => i.reason.includes('duplicate'))).toBe(true)
  })
})

describe('loadPlugins', () => {
  it('loads an enabled plugin and runs its onInit', async () => {
    writePlugin(
      'alpha',
      `export default { name: 'alpha', version: '1', onInit(ctx) { ctx.logger.info('inited') } }`,
    )
    const sink = collector()
    const logger = recordingLogger()
    const result = await loadPlugins({
      pluginsDir: dir,
      gatewayVersion: '1.0.0',
      createLogger: () => logger,
      ...sink,
    })
    expect(result.loaded).toEqual(['alpha'])
    expect(result.failed).toEqual([])
    expect(logger.lines).toContain('info: inited')
  })

  it('skips a plugin disabled by its manifest', async () => {
    writePlugin('off', `export default { name: 'off', version: '1' }`, { enabled: false })
    const result = await loadPlugins({
      pluginsDir: dir,
      gatewayVersion: '1',
      createLogger: () => recordingLogger(),
      ...collector(),
    })
    expect(result.loaded).toEqual([])
    expect(result.failed).toEqual([])
  })

  it('collects routes and transformers registered during onInit', async () => {
    writePlugin(
      'reg',
      `export default {
        name: 'reg', version: '1',
        onInit(ctx) {
          ctx.registerRoute({ path: '/plugins/reg/x', handler: () => new Response('ok') })
          ctx.registerTransformer('custom', { name: 'custom' })
        },
      }`,
    )
    const sink = collector()
    await loadPlugins({
      pluginsDir: dir,
      gatewayVersion: '1',
      createLogger: () => recordingLogger(),
      ...sink,
    })
    expect(sink.routes.map((r) => r.route.path)).toEqual(['/plugins/reg/x'])
    expect(sink.transformers.map((t) => t.name)).toEqual(['custom'])
  })

  it('isolates a plugin whose onInit throws, loading the others', async () => {
    // One bad plugin must not take the gateway down.
    writePlugin(
      'good',
      `export default { name: 'good', version: '1', onInit(ctx) { ctx.logger.info('ok') } }`,
    )
    writePlugin(
      'bad',
      `export default { name: 'bad', version: '1', onInit() { throw new Error('boom') } }`,
    )
    const result = await loadPlugins({
      pluginsDir: dir,
      gatewayVersion: '1',
      createLogger: () => recordingLogger(),
      ...collector(),
    })
    expect(result.loaded).toEqual(['good'])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]?.name).toBe('bad')
    expect(result.failed[0]?.reason).toContain('boom')
  })

  it('does not register routes from a plugin whose onInit failed', async () => {
    // A half-initialized plugin would run hooks against missing state.
    writePlugin(
      'half',
      `export default {
        name: 'half', version: '1',
        onInit(ctx) { ctx.registerRoute({ path: '/plugins/half/x', handler: () => new Response('') }); throw new Error('late failure') },
      }`,
    )
    const sink = collector()
    const result = await loadPlugins({
      pluginsDir: dir,
      gatewayVersion: '1',
      createLogger: () => recordingLogger(),
      ...sink,
    })
    expect(result.loaded).toEqual([])
    expect(sink.routes).toEqual([])
  })

  it('rejects a plugin whose reported name disagrees with its manifest', async () => {
    // Logs must attribute behaviour to the name the operator configured.
    writePlugin('manifest-name', `export default { name: 'different', version: '1' }`)
    const result = await loadPlugins({
      pluginsDir: dir,
      gatewayVersion: '1',
      createLogger: () => recordingLogger(),
      ...collector(),
    })
    expect(result.loaded).toEqual([])
    expect(result.failed[0]?.reason).toContain('different')
  })

  it('reports a module with no default export', async () => {
    writePlugin('no-default', `export const notDefault = 1`)
    const result = await loadPlugins({
      pluginsDir: dir,
      gatewayVersion: '1',
      createLogger: () => recordingLogger(),
      ...collector(),
    })
    expect(result.failed[0]?.reason).toContain('default export')
  })
})

describe('hooks', () => {
  const base = { name: 'p', version: '1' }

  it('runs request hooks in load order and chains the result', async () => {
    const seen: string[] = []
    const a: Plugin = {
      ...base,
      name: 'a',
      async onRequest(request) {
        seen.push('a')
        return { ...request, model: `${request.model}+a` }
      },
    }
    const b: Plugin = {
      ...base,
      name: 'b',
      async onRequest(request) {
        seen.push('b')
        return { ...request, model: `${request.model}+b` }
      },
    }
    const result = await runRequestHooks([a, b], { model: 'm', messages: [] })
    expect(seen).toEqual(['a', 'b'])
    expect(result.model).toBe('m+a+b')
  })

  it('continues past a throwing request hook', async () => {
    // A plugin observing traffic must not be able to break request handling.
    const boom: Plugin = {
      ...base,
      name: 'boom',
      onRequest() {
        throw new Error('hook exploded')
      },
    }
    const after: Plugin = {
      ...base,
      name: 'after',
      onRequest: (request) => ({ ...request, model: 'touched' }),
    }
    const logs: string[] = []
    const result = await runRequestHooks([boom, after], { model: 'm', messages: [] }, (m) =>
      logs.push(m),
    )
    expect(result.model).toBe('touched')
    expect(logs.some((l) => l.includes('boom'))).toBe(true)
  })

  it('runs response and error hooks', async () => {
    const plugin: Plugin = {
      ...base,
      name: 'r',
      onResponse: (response) => ({ ...response, id: 'rewritten' }),
      onError: (error) => ({ ...error, message: `wrapped: ${error.message}` }),
    }
    const response = await runResponseHooks([plugin], { id: 'original' } as never)
    expect((response as { id: string }).id).toBe('rewritten')

    const error = await runErrorHooks([plugin], { message: 'fail' })
    expect(error.message).toBe('wrapped: fail')
  })

  it('shuts plugins down in reverse load order', async () => {
    // A plugin that depended on one loaded before it must tear down first.
    const order: string[] = []
    const make = (name: string): Plugin => ({
      ...base,
      name,
      onShutdown() {
        order.push(name)
      },
    })
    await shutdownPlugins([make('first'), make('second'), make('third')])
    expect(order).toEqual(['third', 'second', 'first'])
  })

  it('continues shutting down after one plugin fails', async () => {
    const order: string[] = []
    const bad: Plugin = {
      ...base,
      name: 'bad',
      onShutdown() {
        throw new Error('cannot stop')
      },
    }
    const good: Plugin = {
      ...base,
      name: 'good',
      onShutdown() {
        order.push('good')
      },
    }
    const logs: string[] = []
    await shutdownPlugins([good, bad], (m) => logs.push(m))
    expect(order).toEqual(['good'])
    expect(logs.some((l) => l.includes('bad'))).toBe(true)
  })
})
