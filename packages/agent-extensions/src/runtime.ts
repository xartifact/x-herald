/**
 * Runtime detection — the ONLY module that names "pi" vs "omp" directly.
 *
 * Public surface: `detectRuntime()` returns either "pi" or "omp" plus the
 * config directory to read models / auth from. Both runtimes inject the
 * real `ExtensionAPI` into the factory; nothing in this module imports it.
 */

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type RuntimeName = 'pi' | 'omp'

export interface Runtime {
  readonly name: RuntimeName
  readonly configDir: string
}

const PI_DIR = join(homedir(), '.pi', 'agent')
const OMP_DIR = join(homedir(), '.omp', 'agent')

/** Explicit override always wins. */
function fromEnv(): Runtime | null {
  const override = process.env.X_LLM_GATEWAY_CONFIG_DIR
  if (override) {
    const name: RuntimeName = override.includes('.omp') ? 'omp' : 'pi'
    return { name, configDir: override }
  }
  return null
}

/** Auto-detect: prefer omp if both exist (more recent file wins). */
function fromDisk(): Runtime {
  const piExists = existsSync(PI_DIR)
  const ompExists = existsSync(OMP_DIR)

  if (ompExists && !piExists) {
    return { name: 'omp', configDir: OMP_DIR }
  }
  if (piExists && !ompExists) {
    return { name: 'pi', configDir: PI_DIR }
  }
  if (ompExists && piExists) {
    // Both exist (this machine). Use the runtime currently hosting us by
    // checking process.versions (Bun = omp's native runtime; Node = pi's).
    // Bun does NOT set `process.Bun` — the marker lives at
    // `process.versions.bun` (lowercase, alongside `node`/`v8`/etc).
    const isBun = typeof process.versions.bun !== 'undefined'
    return isBun ? { name: 'omp', configDir: OMP_DIR } : { name: 'pi', configDir: PI_DIR }
  }
  // Neither exists. Default to pi (the heritage runtime; user just hasn't
  // initialized either yet). The provider registration will still work via
  // $X_LLM_GATEWAY_BASE_URL / $X_LLM_GATEWAY_API_KEY.
  return { name: 'pi', configDir: PI_DIR }
}

export function detectRuntime(): Runtime {
  return fromEnv() ?? fromDisk()
}
