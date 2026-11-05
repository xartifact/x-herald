import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Persisted CLI settings. Written by `x-herald login`; never contains a virtual key. */
export interface CliConfig {
  url?: string
  /** Admin JWT obtained from POST /api/auth/login. */
  token?: string
  /** Unix seconds; advisory only — the server is the authority on expiry. */
  expiresAt?: number
}

const CONFIG_PATH =
  process.env.X_HERALD_CONFIG || join(homedir(), '.config', 'x-herald', 'config.json')

export function configPath(): string {
  return CONFIG_PATH
}

/** Read the persisted config; a missing or malformed file is an empty config, never an error. */
export function loadCliConfig(): CliConfig {
  if (!existsSync(CONFIG_PATH)) return {}
  try {
    const parsed: unknown = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
    return parsed && typeof parsed === 'object' ? (parsed as CliConfig) : {}
  } catch {
    return {}
  }
}

/**
 * Merge `patch` into the persisted config and write it back with mode 0600.
 *
 * The file holds a bearer token, so it is created owner-only. `chmodSync` runs on
 * every write because an existing file keeps its original mode otherwise.
 */
export function saveCliConfig(patch: CliConfig): CliConfig {
  const next = { ...loadCliConfig(), ...patch }
  mkdirSync(dirname(CONFIG_PATH), { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 })
  chmodSync(CONFIG_PATH, 0o600)
  return next
}

export function clearCliToken(): void {
  const { token: _token, expiresAt: _expiresAt, ...rest } = loadCliConfig()
  mkdirSync(dirname(CONFIG_PATH), { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(rest, null, 2) + '\n', { mode: 0o600 })
  chmodSync(CONFIG_PATH, 0o600)
}
