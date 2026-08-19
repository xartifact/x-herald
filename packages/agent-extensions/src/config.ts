/**
 * Configuration resolution.
 *
 * Order of precedence (first non-empty wins):
 *   1. Per-runtime provider file (models.json under pi OR models.yml under omp)
 *      → $ENV_VAR references are resolved here.
 *   2. Per-runtime auth file (auth.json under pi ONLY — omp uses SQLite AuthStorage).
 *   3. Process env (X_HERALD_BASE_URL, X_HERALD_API_KEY).
 *   4. Built-in defaults.
 *
 * Format handling:
 *   - JSON for files ending in .json (pi's models.json, pi's auth.json)
 *   - YAML for files ending in .yml/.yaml (omp's models.yml)
 *   - YAML parsing uses the bundled js-yaml (works under both Node and Bun)
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import YAML from 'js-yaml'

import { detectRuntime } from './runtime.ts'
import { DEFAULT_BASE_URL, PROVIDER_ID, type AuthFile, type ModelsFile } from './types.ts'

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

async function readConfigFile<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    return null
  }
  if (path.endsWith('.json')) {
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }
  // .yml / .yaml — use js-yaml (bundled, works under both Node and Bun)
  try {
    return YAML.load(raw) as T
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Loaders (per-runtime paths)
// ---------------------------------------------------------------------------

async function loadModelsFile(configDir: string): Promise<ModelsFile | null> {
  // Try YAML first (omp), then JSON (pi). Order matters in case a transitional
  // setup has both files; prefer YAML because it's the newer convention.
  const yml = await readConfigFile<ModelsFile>(join(configDir, 'models.yml'))
  if (yml) return yml
  const json = await readConfigFile<ModelsFile>(join(configDir, 'models.json'))
  return json
}

async function loadAuthFile(configDir: string): Promise<AuthFile | null> {
  // auth.json is pi-only by convention. omp stores credentials in a SQLite
  // AuthStorage that isn't accessible from extensions; omp users either
  // inline apiKey in models.yml OR rely on env vars.
  return readConfigFile<AuthFile>(join(configDir, 'auth.json'))
}

function extractProviderEntry(modelsFile: ModelsFile | null): {
  api?: string
  baseUrl?: string
  apiKey?: string
} {
  const entry = modelsFile?.providers?.[PROVIDER_ID]
  if (!entry) return {}
  return {
    api: typeof entry.api === 'string' ? entry.api : undefined,
    baseUrl: typeof entry.baseUrl === 'string' ? entry.baseUrl : undefined,
    apiKey: typeof entry.apiKey === 'string' ? entry.apiKey : undefined,
  }
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** Resolve `$ENV_VAR` / `${ENV_VAR}` references; returns the input unchanged otherwise. */
export function resolveEnvRef(value: string | undefined): string | undefined {
  if (!value) return undefined
  const match = value.match(/^\$\{?([A-Z0-9_]+)\}?$/i)
  const varName = match?.[1]
  return varName ? process.env[varName] : value
}

export interface ResolvedProviderConfig {
  runtime: 'pi' | 'omp' | 'prime'
  baseUrl: string
  apiKey: string | undefined
  api: string
}

export async function resolveProviderConfig(): Promise<ResolvedProviderConfig> {
  const runtime = detectRuntime()
  const models = await loadModelsFile(runtime.configDir)
  const auth = await loadAuthFile(runtime.configDir)
  const entry = extractProviderEntry(models)

  const baseUrl = entry.baseUrl ?? process.env.X_HERALD_BASE_URL ?? DEFAULT_BASE_URL

  const apiKey =
    resolveEnvRef(entry.apiKey) ??
    auth?.[PROVIDER_ID]?.key ??
    resolveEnvRef(process.env.X_HERALD_API_KEY)

  const api = entry.api ?? 'openai-completions'

  return { runtime: runtime.name, baseUrl, apiKey, api }
}
