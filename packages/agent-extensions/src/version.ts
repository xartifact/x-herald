/**
 * Extension version, read from the package manifest at module load. Both
 * Node (pi) and Bun (omp) handle this `URL` + `fs.readFileSync` combo
 * identically. If the read fails (e.g. running from an odd cwd) we fall
 * back to `0.0.0` rather than crashing the whole extension.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

function loadVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const pkgPath = join(here, '..', 'package.json')
    const raw = readFileSync(pkgPath, 'utf8')
    const pkg = JSON.parse(raw) as { version?: unknown }
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export const EXTENSION_VERSION: string = loadVersion()
