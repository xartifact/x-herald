/**
 * Runtime detection — the ONLY module that names runtimes directly.
 *
 * Public surface: `detectRuntime()` returns the runtime name plus the
 * config directory to read models / auth from. All runtimes inject the
 * real `ExtensionAPI` into the factory; nothing in this module imports it.
 *
 * Supported runtimes:
 *   - pi  (@earendil-works/pi-coding-agent, config in ~/.pi/agent)
 *   - omp (@oh-my-pi/pi-coding-agent,   config in ~/.omp/agent)
 *   - prime-agent (PrimeIntellect-ai/prime-agent, config in
 *     ~/.prime/agent — a renamed fork of pi; same extension ABI)
 */

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type RuntimeName = 'pi' | 'omp' | 'prime'

export interface Runtime {
  readonly name: RuntimeName
  readonly configDir: string
}

const PI_DIR = join(homedir(), '.pi', 'agent')
const OMP_DIR = join(homedir(), '.omp', 'agent')
const PRIME_DIR = join(homedir(), '.prime', 'agent')

/**
 * The extension is deployed to the hosting runtime's extensions dir, so the
 * install location of THIS file identifies the host unambiguously — no
 * guessing from process or env. This matters when several runtimes coexist
 * on one machine (pi + prime + omp): a prime-agent daemon loads the copy
 * under ~/.prime/agent/extensions/, which must read ~/.prime/agent — never
 * fall back to pi's config dir.
 *
 * Detected via `import.meta.url` evaluated at module top level (jiti
 * preserves it in ESM-to-CJS transpilation as a literal file:// URL;
 * `__filename` is also available but the transpiled form differs between
 * jiti versions). The module URL is captured once at load time.
 */
const MODULE_PATH = new URL(import.meta.url).pathname

/** Explicit override always wins. */
function fromEnv(): Runtime | null {
  const override = process.env.X_HERALD_CONFIG_DIR
  if (override) {
    const name: RuntimeName = override.includes('.omp')
      ? 'omp'
      : override.includes('.prime')
        ? 'prime'
        : 'pi'
    return { name, configDir: override }
  }
  return null
}

/**
 * Auto-detect from installed runtime dirs. When multiple exist, prefer
 * the runtime currently hosting us via `process.versions.bun` (Bun =
 * omp's native runtime; Node = pi/prime, both Node-based forks of pi —
 * pi wins the tie as the heritage runtime when prime is also present) and
 * fall back to "most specific wins" when the host cannot be told apart.
 */
function fromDisk(): Runtime {
  const piExists = existsSync(PI_DIR)
  const ompExists = existsSync(OMP_DIR)
  const primeExists = existsSync(PRIME_DIR)
  const isBun = typeof process.versions.bun !== 'undefined'

  if (isBun && ompExists) {
    return { name: 'omp', configDir: OMP_DIR }
  }
  if (primeExists && !piExists) {
    return { name: 'prime', configDir: PRIME_DIR }
  }
  if (piExists && !primeExists) {
    return { name: 'pi', configDir: PI_DIR }
  }
  // Nothing installed. Default to pi (heritage runtime; user just hasn't
  // initialized it yet). The provider registration still works via
  // $X_HERALD_BASE_URL / $X_HERALD_API_KEY.
  return { name: 'pi', configDir: PI_DIR }
}

export function detectRuntime(): Runtime {
  if (MODULE_PATH.includes(`${PRIME_DIR}/`)) {
    return { name: 'prime', configDir: PRIME_DIR }
  }
  if (MODULE_PATH.includes(`${OMP_DIR}/`)) {
    return { name: 'omp', configDir: OMP_DIR }
  }
  if (MODULE_PATH.includes(`${PI_DIR}/`)) {
    return { name: 'pi', configDir: PI_DIR }
  }
  return fromEnv() ?? fromDisk()
}

/** The CLI binary name for each runtime — 'prime' the runtime name is not the same as the 'prime-agent' binary. */
export const RUNTIME_BINARY: Record<RuntimeName, string> = {
  pi: 'pi',
  omp: 'omp',
  prime: 'prime-agent',
}

/** Extracts the first semver-ish token from a `--version` output, e.g. "omp/18.0.1" → "18.0.1". */
export function parseVersionFromOutput(raw: string): string | undefined {
  return raw.trim().match(/\d+\.\d+(?:\.\d+)*/)?.[0]
}

// Process-level cache (per the extension ABI having no host-version field of
// its own): populated once, at extension startup, by exec-ing the host's own
// `--version` — see entry.ts. `cached` distinguishes "not yet resolved" from
// "resolved to undefined" so readHostVersion() knows whether to fall through.
let cachedHostVersion: string | undefined
let cached = false

/**
 * Populate the process-level host-version cache. Call once, at extension
 * startup — see entry.ts, which resolves it via `pi.exec("<binary>",
 * ["--version"])`. Always reflects whatever build is actually running this
 * process, so an update between runs is picked up correctly on next launch
 * (no lag, unlike the changelog-marker fallback below).
 */
export function cacheHostVersion(version: string | undefined): void {
  cachedHostVersion = version
  cached = true
}

/** Test-only: restores readHostVersion() to its pre-cache fallback behavior. */
export function resetHostVersionCache(): void {
  cachedHostVersion = undefined
  cached = false
}

/**
 * Host application version. Prefers the process-level cache (see
 * `cacheHostVersion`); falls back to a local marker file each runtime
 * already maintains for its in-app changelog notice when the cache hasn't
 * been populated (e.g. exec failed, or entry.ts hasn't run yet):
 *
 *   - pi / prime: `settings.json`'s `lastChangelogVersion` field.
 *   - omp: the plain-text `last-changelog-version` file.
 *
 * The fallback is a heuristic, not a guarantee — verified to match `pi
 * --version` (0.83.0) and `omp --version` (18.0.1) on a real install, but it
 * reflects the last version whose changelog the user has viewed, so it can
 * lag one version behind right after an update the user hasn't opened the
 * app to see yet. No local marker is known for prime (its settings.json
 * doesn't carry this field) — returns undefined there absent the cache.
 * Never throws; swallows any read/parse failure and returns undefined.
 */
export function readHostVersion(runtime: Runtime): string | undefined {
  if (cached) return cachedHostVersion
  try {
    if (runtime.name === 'omp') {
      const raw = readFileSync(join(runtime.configDir, 'last-changelog-version'), 'utf8').trim()
      return raw || undefined
    }
    const settings = JSON.parse(readFileSync(join(runtime.configDir, 'settings.json'), 'utf8')) as {
      lastChangelogVersion?: string
    }
    return settings.lastChangelogVersion
  } catch {
    return undefined
  }
}
