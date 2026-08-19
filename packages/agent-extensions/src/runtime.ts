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

import { existsSync } from 'node:fs'
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
