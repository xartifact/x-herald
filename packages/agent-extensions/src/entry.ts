/**
 * Extension entrypoint.
 *
 * Runs identically under both pi-coding-agent and oh-my-pi. The runtime
 * injects `pi: ExtensionAPI` and we never import either @earendil-works/
 * pi-coding-agent or @oh-my-pi/pi-coding-agent statically here — see
 * src/agent-shim.d.ts for the type alias both packages satisfy.
 *
 * Behaviour:
 *   1. Resolve config from runtime-appropriate dir + files.
 *   2. Register the provider with the runtime's dynamic-discovery
 *      mechanism — pi: eager seed + `refreshModels` (model selector open);
 *      omp: `fetchDynamicModels` (SQLite model cache, 24 h TTL). New models
 *      added on the gateway appear without a restart.
 *   3. Register /x-gate admin commands.
 *
 * The /x-gate handlers in src/commands.ts re-resolve config + re-fetch on
 * each invocation so they always reflect the latest env / file state.
 */

import type { ExtensionAPI, ProviderModelConfig } from '@earendil-works/pi-coding-agent'

import { registerXGateCommand } from './commands.ts'
import { resolveProviderConfig } from './config.ts'
import { buildProviderConfig, discoverModels } from './gateway.ts'
import { detectRuntime } from './runtime.ts'
import { PROVIDER_ID, PROVIDER_NAME } from './types.ts'

export default async function (pi: ExtensionAPI): Promise<void> {
  // Always register the command — even if /models fails, /x-gate help is useful.
  registerXGateCommand(pi)

  const { baseUrl, apiKey, api } = await resolveProviderConfig()
  if (!apiKey) {
    process.stderr.write(
      `[${PROVIDER_ID}] no apiKey configured (set one in models.{json,yml}, ` +
        `auth.json [pi only], or $X_LLM_GATEWAY_API_KEY); leaving runtime's models in place.\n`,
    )
    return
  }

  // omp: the discovery hook owns the catalogue (cached in SQLite); skip
  // the eager fetch — omp fetches itself right after extension load.
  // pi: seed the provider immediately so models exist before the first
  // async refresh, and surface startup failures loudly.
  let models: ProviderModelConfig[] = []
  if (detectRuntime().name !== 'omp') {
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
