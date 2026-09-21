/**
 * Plugin contract for the gateway's ecosystem layer.
 *
 * A plugin extends the gateway without modifying it: the roadmap's second
 * principle is that AI helps users extend the product (writing plugins,
 * adapting providers) rather than editing product code. Plugins are ordinary
 * TypeScript modules loaded at boot, not WASM — the roadmap rules out WASM
 * self-modification as too risky, so the interface stays in-process and typed.
 *
 * Hooks are all optional: a plugin that only wants to observe requests
 * implements `onRequest` and nothing else. Every hook is awaited, so a plugin
 * may do async work (a DB write, an upstream call) before the request proceeds.
 *
 * Types here reference the gateway's real request/response shapes
 * (`StandardRequest` / `StandardResponse`) rather than inventing parallel ones,
 * so a plugin manipulates exactly what the transformers do.
 *
 * @module @xartifact/x-herald-shared/types/plugin
 */

import type { StandardRequest, StandardResponse, Transformer } from './llm'

/** Severity levels a plugin may log at. */
export type PluginLogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * Logger handed to a plugin.
 *
 * Scoped by the host so every line a plugin emits is attributable to it, which
 * is what makes a misbehaving plugin diagnosable.
 */
export interface PluginLogger {
  debug(message: string, fields?: Record<string, unknown>): void
  info(message: string, fields?: Record<string, unknown>): void
  warn(message: string, fields?: Record<string, unknown>): void
  error(message: string, fields?: Record<string, unknown>): void
}

/** A route a plugin contributes to the gateway. */
export interface PluginRoute {
  /** Path the route is mounted at, e.g. `/plugins/hello`. */
  readonly path: string
  /**
   * Request handler. Receives the raw `Request` and returns a `Response`, the
   * same contract the gateway's own routes use.
   */
  readonly handler: (request: Request) => Response | Promise<Response>
}

/**
 * What the host injects into a plugin.
 *
 * Deliberately narrow: a plugin gets configuration, a logger, and two
 * registration seats. It does not get the database handle or the router
 * directly — a plugin that could reach into those could not be unloaded
 * cleanly, which the lifecycle below depends on.
 */
export interface PluginContext {
  /** The plugin's own config, from its manifest's `config` field. */
  readonly config: Readonly<Record<string, unknown>>
  /** Plugin-scoped logger. */
  readonly logger: PluginLogger
  /** Register an HTTP route; the host owns the mount point. */
  readonly registerRoute: (route: PluginRoute) => void
  /** Register a protocol transformer by name. */
  readonly registerTransformer: (name: string, transformer: Transformer) => void
  /** Gateway version, so a plugin can refuse to run against an incompatible host. */
  readonly gatewayVersion: string
}

/** Error shape handed to `onError`. */
export interface PluginError {
  /** Error message. */
  readonly message: string
  /** Error class name, when the value was an `Error`. */
  readonly name?: string
  /** HTTP status the gateway intends to return, when known. */
  readonly statusCode?: number
  /** Request path the error occurred on, when known. */
  readonly path?: string
}

/**
 * A gateway plugin.
 *
 * `name` + `version` identify it in logs and in the manifest; they must match
 * the manifest entry, so a plugin cannot report an identity other than the one
 * the operator configured.
 */
export interface Plugin {
  /** Unique plugin name, matching its manifest entry. */
  readonly name: string
  /** Plugin version, for diagnostics. */
  readonly version: string
  /**
   * Called once after load, before any request is served. Use it to validate
   * config and register routes/transformers.
   */
  onInit?(ctx: PluginContext): Promise<void> | void
  /**
   * Called before a request is forwarded upstream.
   * @returns the request to forward — either the one passed in, or a replacement.
   */
  onRequest?(request: StandardRequest): Promise<StandardRequest> | StandardRequest
  /**
   * Called after an upstream response is normalized.
   * @returns the response to hand back to the client.
   */
  onResponse?(response: StandardResponse): Promise<StandardResponse> | StandardResponse
  /**
   * Called when the gateway is about to return an error.
   * @returns the error to surface; a plugin may enrich or replace it.
   */
  onError?(error: PluginError): Promise<PluginError> | PluginError
  /** Called on graceful shutdown, after routes stop accepting requests. */
  onShutdown?(): Promise<void> | void
}

/** A plugin module's default export shape. */
export interface PluginModule {
  /** The plugin implementation. */
  readonly default: Plugin
}

/**
 * `plugin.json` manifest: how an operator declares a plugin to load.
 *
 * Separate from the plugin code so the roster is inspectable without executing
 * anything — the loader reads manifests first, then imports only what they name.
 */
export interface PluginManifest {
  /** Plugin name; must match the loaded plugin's `name`. */
  readonly name: string
  /** Module specifier to import, resolved relative to the manifest. */
  readonly entry: string
  /** Whether to load this plugin. Lets an operator disable without deleting. */
  readonly enabled?: boolean
  /** Arbitrary config handed to the plugin's `PluginContext.config`. */
  readonly config?: Readonly<Record<string, unknown>>
}

/** A manifest that failed validation, with the reason. */
export interface PluginManifestIssue {
  /** Manifest file the issue was found in. */
  readonly file: string
  /** Human-readable reason. */
  readonly reason: string
}

/**
 * Validate a parsed `plugin.json`.
 *
 * Returns reasons rather than throwing: the loader reports every bad manifest in
 * one pass, so an operator fixes them together instead of one boot at a time.
 * @param value - parsed JSON, of unknown shape.
 * @param file - manifest path, used in the reasons.
 * @returns the issues found; empty when the manifest is valid.
 */
export function validatePluginManifest(
  value: unknown,
  file = 'plugin.json',
): PluginManifestIssue[] {
  const issues: PluginManifestIssue[] = []
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [{ file, reason: 'manifest must be a JSON object' }]
  }
  const manifest = value as Record<string, unknown>

  if (typeof manifest.name !== 'string' || manifest.name.trim() === '') {
    issues.push({ file, reason: 'name must be a non-empty string' })
  }
  if (typeof manifest.entry !== 'string' || manifest.entry.trim() === '') {
    issues.push({ file, reason: 'entry must be a non-empty string' })
  }
  if (manifest.enabled !== undefined && typeof manifest.enabled !== 'boolean') {
    issues.push({ file, reason: 'enabled must be a boolean when present' })
  }
  if (
    manifest.config !== undefined &&
    (typeof manifest.config !== 'object' ||
      manifest.config === null ||
      Array.isArray(manifest.config))
  ) {
    issues.push({ file, reason: 'config must be an object when present' })
  }
  return issues
}
