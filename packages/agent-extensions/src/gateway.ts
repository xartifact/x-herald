/**
 * HTTP client for x-llm-gateway's OpenAI-compatible `/models` endpoint.
 * Pure logic — same code under pi (Node) and omp (Bun).
 */

import type { ProviderModelConfig } from '@earendil-works/pi-coding-agent'

import { resolveProviderConfig } from './config.ts'
import { toPiModel } from './model-mapping.ts'
import { detectRuntime } from './runtime.ts'
import { FETCH_TIMEOUT_MS, type GatewayModelEntry, type GatewayModelsResponse } from './types.ts'

export async function fetchGatewayModels(
  baseUrl: string,
  apiKey: string,
): Promise<GatewayModelEntry[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/models`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} from ${url}`)
    }

    const body = (await res.json()) as Partial<GatewayModelsResponse>
    if (!body || !Array.isArray(body.data)) {
      throw new Error(`/models response did not include a \`data\` array (got: ${url})`)
    }
    return body.data
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Resolve config, fetch the live catalogue, and map it to runtime models.
 * Shared by the startup seed and the runtime refresh hooks
 * (`refreshModels` under pi, `fetchDynamicModels` under omp).
 *
 * `apiKey` overrides the resolved key — omp passes its own resolved
 * credential into `fetchDynamicModels`; pi re-resolves from config.
 * Throws on missing key, fetch failure, or an empty catalogue; the caller
 * decides whether to surface the error or keep cached models.
 */
export async function discoverModels(apiKey?: string): Promise<ProviderModelConfig[]> {
  const config = await resolveProviderConfig()
  const key = apiKey ?? config.apiKey
  if (!key) {
    throw new Error('no apiKey configured (models file, auth.json, or $X_LLM_GATEWAY_API_KEY)')
  }
  const entries = await fetchGatewayModels(config.baseUrl, key)
  if (entries.length === 0) {
    throw new Error('/models returned an empty list')
  }
  return entries.map(toPiModel)
}

export interface GatewayProviderOptions {
  name: string
  baseUrl: string
  apiKey: string
  api: string
  models: ProviderModelConfig[]
}

/**
 * Provider registration payload with the runtime-appropriate dynamic
 * discovery mechanism wired in.
 *
 * pi (0.83+): eager seed `models` + `refreshModels` hook (invoked when the
 * model selector opens; the returned list replaces the seed).
 *
 * omp: `fetchDynamicModels` hook ONLY — passing non-empty `models` makes
 * omp's registerProvider early-return before wiring the hook, silently
 * disabling auto-discovery. omp caches the fetched catalog in its SQLite
 * model cache (default 24 h TTL) and owns the catalogue from then on.
 *
 * Each runtime ignores the key it does not recognize, so registering the
 * other's key is harmless; this builder emits the right shape per runtime.
 */
export function buildProviderConfig(opts: GatewayProviderOptions): Record<string, unknown> {
  const base = {
    name: opts.name,
    baseUrl: opts.baseUrl,
    apiKey: opts.apiKey,
    api: opts.api,
  }
  if (detectRuntime().name === 'omp') {
    return {
      ...base,
      fetchDynamicModels: (apiKey?: string) => discoverModels(apiKey),
    }
  }
  return {
    ...base,
    models: opts.models,
    refreshModels: async () => discoverModels(),
  }
}

/** Path to the bundled v1 JSON Schema, useful for diagnostic tooling. */
export function v1SchemaPath(): string {
  const url = new URL('../schemas/v1-models.schema.json', import.meta.url)
  return url.pathname
}
