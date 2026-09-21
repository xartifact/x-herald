/**
 * Plugin loader: discovers manifests, loads plugins, and drives their lifecycle.
 *
 * The loader is intentionally small and synchronous in its control flow: it
 * reads every manifest, reports *all* problems at once, then loads the enabled
 * plugins in a deterministic order. An operator fixing a broken roster should
 * see every mistake in one boot, not discover them one at a time.
 *
 * Lifecycle guarantees:
 *  - A plugin whose `onInit` throws is unloaded and excluded from the registry;
 *    the rest still load. One bad plugin must not take the gateway down.
 *  - Hooks run in load order and are awaited, so ordering is deterministic.
 *  - `onShutdown` runs in reverse load order (last in, first out), matching the
 *    usual teardown convention.
 *
 * @module apps/gateway/src/gateway/plugins/loader
 */

import { readFileSync, readdirSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

import {
  validatePluginManifest,
  type Plugin,
  type PluginContext,
  type PluginError,
  type PluginLogLevel,
  type PluginLogger,
  type PluginManifest,
  type PluginManifestIssue,
  type PluginRoute,
  type StandardRequest,
  type StandardResponse,
  type Transformer,
} from '@xartifact/x-herald-shared'

/** One loaded plugin and what it registered. */
interface LoadedPlugin {
  readonly manifest: PluginManifest
  readonly plugin: Plugin
  readonly routes: PluginRoute[]
  readonly transformers: Array<{ name: string; transformer: Transformer }>
}

/** Outcome of a load pass. */
export interface PluginLoadResult {
  /** Names of plugins that loaded and initialized successfully. */
  readonly loaded: readonly string[]
  /**
   * Plugins that failed, with the reason. They are not in the registry and their
   * hooks will not run.
   */
  readonly failed: readonly { readonly name: string; readonly reason: string }[]
  /** Manifest problems found before any import was attempted. */
  readonly manifestIssues: readonly PluginManifestIssue[]
}

/** Inputs the loader needs from the host. */
export interface PluginLoaderOptions {
  /** Directory holding each plugin's `plugin.json`. */
  readonly pluginsDir: string
  /** Gateway version reported to plugins. */
  readonly gatewayVersion: string
  /** Host logger factory; the loader scopes one per plugin. */
  readonly createLogger: (pluginName: string) => PluginLogger
  /** Called when a plugin registers a route. */
  readonly onRoute: (pluginName: string, route: PluginRoute) => void
  /** Called when a plugin registers a transformer. */
  readonly onTransformer: (pluginName: string, name: string, transformer: Transformer) => void
}

/**
 * Read and validate every manifest in the plugins directory.
 *
 * A missing directory is not an error: most deployments have no plugins, and
 * requiring an empty folder would be busywork.
 * @param dir - directory to scan.
 * @returns the valid manifests plus any issues found.
 */
export function readManifests(dir: string): {
  manifests: PluginManifest[]
  issues: PluginManifestIssue[]
} {
  const manifests: PluginManifest[] = []
  const issues: PluginManifestIssue[] = []

  let entries: string[]
  try {
    entries = readdirSync(dir).toSorted()
  } catch {
    return { manifests, issues }
  }

  for (const entry of entries) {
    const manifestPath = join(dir, entry, 'plugin.json')
    let raw: string
    try {
      raw = readFileSync(manifestPath, 'utf8')
    } catch {
      // A directory without a manifest is not a plugin; skip it silently.
      continue
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      issues.push({
        file: manifestPath,
        reason: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      })
      continue
    }

    const found = validatePluginManifest(parsed, manifestPath)
    if (found.length > 0) {
      issues.push(...found)
      continue
    }
    manifests.push(parsed as PluginManifest)
  }

  // Duplicate names would make the registry ambiguous and logs unattributable.
  const seen = new Set<string>()
  const unique: PluginManifest[] = []
  for (const manifest of manifests) {
    if (seen.has(manifest.name)) {
      issues.push({ file: manifest.name, reason: 'duplicate plugin name' })
      continue
    }
    seen.add(manifest.name)
    unique.push(manifest)
  }

  return { manifests: unique, issues }
}

/**
 * Resolve a manifest's `entry` to an importable specifier.
 * @param pluginsDir - directory the manifest lives in.
 * @param manifest - the manifest.
 * @returns an absolute path or bare specifier.
 */
function resolveEntry(pluginsDir: string, manifest: PluginManifest): string {
  if (isAbsolute(manifest.entry) || manifest.entry.startsWith('.')) {
    return resolve(pluginsDir, manifest.name, manifest.entry)
  }
  return manifest.entry
}

/**
 * Load and initialize every enabled plugin.
 *
 * @param options - host inputs.
 * @returns what loaded, what failed, and any manifest problems.
 */
export async function loadPlugins(options: PluginLoaderOptions): Promise<PluginLoadResult> {
  const { manifests, issues } = readManifests(options.pluginsDir)
  const loaded: LoadedPlugin[] = []
  const failed: Array<{ name: string; reason: string }> = []

  for (const manifest of manifests) {
    // `enabled: false` is how an operator parks a plugin without deleting it.
    if (manifest.enabled === false) continue

    const logger = options.createLogger(manifest.name)
    let plugin: Plugin
    try {
      const module = (await import(resolveEntry(options.pluginsDir, manifest))) as {
        default?: Plugin
      }
      if (module.default === undefined) {
        throw new Error('module has no default export')
      }
      plugin = module.default
    } catch (error) {
      failed.push({
        name: manifest.name,
        reason: `import failed: ${error instanceof Error ? error.message : String(error)}`,
      })
      continue
    }

    // The plugin reports its own identity; a mismatch means the manifest and the
    // code disagree, and logs would attribute behaviour to the wrong name.
    if (plugin.name !== manifest.name) {
      failed.push({
        name: manifest.name,
        reason: `plugin reports name "${plugin.name}", manifest says "${manifest.name}"`,
      })
      continue
    }

    const routes: PluginRoute[] = []
    const transformers: Array<{ name: string; transformer: Transformer }> = []
    const context: PluginContext = {
      config: manifest.config ?? {},
      logger,
      gatewayVersion: options.gatewayVersion,
      registerRoute: (route) => {
        routes.push(route)
      },
      registerTransformer: (name, transformer) => {
        transformers.push({ name, transformer })
      },
    }

    try {
      await plugin.onInit?.(context)
    } catch (error) {
      // A failed init leaves the plugin unusable; drop it rather than keep a
      // half-initialized plugin whose hooks would run against missing state.
      failed.push({
        name: manifest.name,
        reason: `onInit failed: ${error instanceof Error ? error.message : String(error)}`,
      })
      continue
    }

    for (const route of routes) options.onRoute(manifest.name, route)
    for (const entry of transformers) {
      options.onTransformer(manifest.name, entry.name, entry.transformer)
    }
    loaded.push({ manifest, plugin, routes, transformers })
  }

  return {
    loaded: loaded.map((entry) => entry.plugin.name),
    failed,
    manifestIssues: issues,
  }
}

/**
 * Run every loaded plugin's `onRequest` hook in load order.
 *
 * A throwing hook is logged and skipped: a plugin observing requests must not be
 * able to break request handling, so the request continues unchanged.
 * @param plugins - the loaded plugins.
 * @param request - the request being forwarded.
 * @param log - sink for a hook failure.
 * @returns the request after every hook.
 */
export async function runRequestHooks(
  plugins: readonly Plugin[],
  request: StandardRequest,
  log: (message: string, fields?: Record<string, unknown>) => void = () => {},
): Promise<StandardRequest> {
  let current = request
  for (const plugin of plugins) {
    if (plugin.onRequest === undefined) continue
    try {
      current = await plugin.onRequest(current)
    } catch (error) {
      log(`plugin "${plugin.name}" onRequest failed`, {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return current
}

/**
 * Run every loaded plugin's `onResponse` hook in load order.
 * @param plugins - the loaded plugins.
 * @param response - the normalized upstream response.
 * @param log - sink for a hook failure.
 * @returns the response after every hook.
 */
export async function runResponseHooks(
  plugins: readonly Plugin[],
  response: StandardResponse,
  log: (message: string, fields?: Record<string, unknown>) => void = () => {},
): Promise<StandardResponse> {
  let current = response
  for (const plugin of plugins) {
    if (plugin.onResponse === undefined) continue
    try {
      current = await plugin.onResponse(current)
    } catch (error) {
      log(`plugin "${plugin.name}" onResponse failed`, {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return current
}

/**
 * Run every loaded plugin's `onError` hook in load order.
 * @param plugins - the loaded plugins.
 * @param error - the error about to be returned.
 * @param log - sink for a hook failure.
 * @returns the error after every hook.
 */
export async function runErrorHooks(
  plugins: readonly Plugin[],
  error: PluginError,
  log: (message: string, fields?: Record<string, unknown>) => void = () => {},
): Promise<PluginError> {
  let current = error
  for (const plugin of plugins) {
    if (plugin.onError === undefined) continue
    try {
      current = await plugin.onError(current)
    } catch (hookError) {
      log(`plugin "${plugin.name}" onError failed`, {
        error: hookError instanceof Error ? hookError.message : String(hookError),
      })
    }
  }
  return current
}

/**
 * Shut every plugin down in reverse load order.
 *
 * Reverse order so a plugin that depended on one loaded before it tears down
 * first. A failing `onShutdown` is logged and does not stop the others.
 * @param plugins - the loaded plugins, in load order.
 * @param log - sink for a shutdown failure.
 */
export async function shutdownPlugins(
  plugins: readonly Plugin[],
  log: (message: string, fields?: Record<string, unknown>) => void = () => {},
): Promise<void> {
  for (const plugin of plugins.toReversed()) {
    if (plugin.onShutdown === undefined) continue
    try {
      await plugin.onShutdown()
    } catch (error) {
      log(`plugin "${plugin.name}" onShutdown failed`, {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

/** Re-exported so a plugin author needs only this module. */
export type { Plugin, PluginContext, PluginError, PluginLogLevel, PluginLogger }
