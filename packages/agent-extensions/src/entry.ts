/**
 * Extension entrypoint.
 *
 * Runs identically under pi-coding-agent, oh-my-pi, and prime-agent (a
 * renamed fork of pi sharing the same extension ABI). The runtime injects
 * `pi: ExtensionAPI` and we never import any runtime package statically
 * here — see src/agent-shim.d.ts for the type aliases they satisfy.
 *
 * Behaviour:
 *   1. Resolve config from runtime-appropriate dir + files.
 *   2. Resolve + cache the host's own `--version` (process-level; see
 *      runtime.ts) so User-Agent fingerprinting in model-mapping.ts can
 *      report the runtime's real version instead of the changelog-marker
 *      fallback.
 *   3. Register the provider with the runtime's dynamic-discovery
 *      mechanism — pi/prime: eager seed + `refreshModels` (model selector
 *      open); omp: `fetchDynamicModels` (SQLite model cache, 24 h TTL).
 *      New models added on the gateway appear without a restart.
 *   4. Register /x-herald admin commands.
 *
 * The /x-herald handlers in src/commands.ts re-resolve config + re-fetch on
 * each invocation so they always reflect the latest env / file state.
 */

import type { ExtensionAPI, ProviderModelConfig } from '@earendil-works/pi-coding-agent'

import { registerXGateCommand } from './commands.ts'
import { resolveProviderConfig } from './config.ts'
import { buildProviderConfig, discoverModels } from './gateway.ts'
import {
  cacheHostVersion,
  detectRuntime,
  parseVersionFromOutput,
  RUNTIME_BINARY,
  type Runtime,
} from './runtime.ts'
import { PROVIDER_ID, PROVIDER_NAME } from './types.ts'

/**
 * Best-effort: exec the host's own `--version` once at startup and cache the
 * result. Never throws — any failure just leaves the cache resolved to
 * undefined, and readHostVersion() falls back to the changelog-marker file.
 */
async function resolveHostVersion(pi: ExtensionAPI, runtime: Runtime): Promise<void> {
  try {
    const result = await pi.exec(RUNTIME_BINARY[runtime.name], ['--version'], { timeout: 3000 })
    cacheHostVersion(result.code === 0 ? parseVersionFromOutput(result.stdout) : undefined)
  } catch {
    cacheHostVersion(undefined)
  }
}

export default async function (pi: ExtensionAPI): Promise<void> {
  const runtime = detectRuntime()
  await resolveHostVersion(pi, runtime)

  // Always register the command — even if /models fails, /x-herald help is useful.
  registerXGateCommand(pi)

  const { baseUrl, apiKey, api } = await resolveProviderConfig()
  if (!apiKey) {
    process.stderr.write(
      `[${PROVIDER_ID}] no apiKey configured (set one in models.{json,yml}, ` +
        `auth.json [pi only], or $X_HERALD_API_KEY); leaving runtime's models in place.\n`,
    )
    return
  }

  // omp: the discovery hook owns the catalogue (cached in SQLite); skip
  // the eager fetch — omp fetches itself right after extension load.
  // pi/prime: seed the provider immediately so models exist before the
  // first async refresh, and surface startup failures loudly.
  let models: ProviderModelConfig[] = []
  if (runtime.name !== 'omp') {
    try {
      models = await discoverModels(apiKey)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(
        `[${PROVIDER_ID}] failed to fetch ${baseUrl}/models (${msg}); ` +
          `leaving runtime's models in place.\n`,
      )
      return
    }
  }

  pi.registerProvider(
    PROVIDER_ID,
    buildProviderConfig({
      name: PROVIDER_NAME,
      baseUrl,
      apiKey,
      api,
      models,
    }),
  )
}
