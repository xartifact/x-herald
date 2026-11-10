import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { COMMAND_INDEX_JSON, SKILL_DOCS, SKILL_NAME } from './embedded-skills'
import { report } from './output'

/** One agent runtime's user-level `skills/` directory. */
export interface SkillRuntime {
  /** Value accepted by `--runtime`. */
  id: string
  /** Directory that must exist for the runtime to be considered installed. */
  home: string
  /** Skills root, one level above each `<name>/SKILL.md`. */
  root: string
}

/**
 * Runtime roots verified against each tool's discovery rules:
 * Claude Code, Codex, Pi, and omp all scan `<root>/<name>/SKILL.md` one level deep;
 * `.agents/skills` is the shared root that several runtimes pick up as well.
 */
export const SKILL_RUNTIMES: readonly SkillRuntime[] = [
  { id: 'claude', home: '.claude', root: '.claude/skills' },
  { id: 'codex', home: '.codex', root: '.codex/skills' },
  { id: 'agents', home: '.agents', root: '.agents/skills' },
  { id: 'pi', home: '.pi/agent', root: '.pi/agent/skills' },
  { id: 'omp', home: '.omp/agent', root: '.omp/agent/skills' },
  { id: 'opencode', home: '.config/opencode', root: '.config/opencode/skills' },
]

export interface SkillInstallOptions {
  /** Explicit runtime ids; empty means "every runtime whose home exists". */
  runtimes: string[]
  /** Install into every runtime, creating its directories when missing. */
  all: boolean
  /** Install under this directory instead of any runtime root. */
  dir?: string
  /**
   * Root to resolve runtime paths against; defaults to the real home directory.
   * Present so tests (and `--home`) can target a sandbox without mutating HOME —
   * `os.homedir()` caches its first result per process.
   */
  home?: string
  dryRun: boolean
}

/** Every file the skill installs, as `relative path -> content`. */
function skillPayload(): Record<string, string> {
  return { ...SKILL_DOCS, 'commands.json': COMMAND_INDEX_JSON }
}

export function resolveRuntimes(ids: string[]): SkillRuntime[] {
  if (ids.length === 0) return [...SKILL_RUNTIMES]
  return ids.map((id) => {
    const runtime = SKILL_RUNTIMES.find((candidate) => candidate.id === id)
    if (!runtime) {
      throw new Error(`未知 runtime: ${id}（可选 ${SKILL_RUNTIMES.map((r) => r.id).join(' | ')}）`)
    }
    return runtime
  })
}

/**
 * Install the embedded skill into the selected runtimes.
 *
 * A runtime is skipped unless its home directory already exists, which keeps the
 * command idempotent and side-effect free on machines that do not run that agent.
 * `--all` and an explicit `--runtime` opt out of that filter.
 *
 * Never throws on a per-runtime write failure: one read-only directory must not
 * stop the remaining installs. Returns the exit code instead.
 */
export function installSkill(options: SkillInstallOptions): number {
  const payload = skillPayload()
  const targets: Array<{ id: string; dir: string }> = []

  const homeDir = options.home ?? homedir()

  if (options.dir) {
    targets.push({ id: 'dir', dir: options.dir })
  } else {
    const selected = resolveRuntimes(options.runtimes)
    const explicit = options.runtimes.length > 0 || options.all
    for (const runtime of selected) {
      if (!explicit && !existsSync(join(homeDir, runtime.home))) continue
      targets.push({ id: runtime.id, dir: join(homeDir, runtime.root, SKILL_NAME) })
    }
  }

  if (targets.length === 0) {
    report(
      '没有匹配的 runtime（已安装的 agent 才会被写入）。用 --runtime <id> 指定，或 --all 全部安装。',
    )
    return 1
  }

  let failed = 0
  for (const target of targets) {
    if (options.dryRun) {
      report(`[dry-run] ${target.id}: ${target.dir} (${Object.keys(payload).length} 个文件)`)
      continue
    }
    try {
      mkdirSync(target.dir, { recursive: true })
      for (const [name, content] of Object.entries(payload)) {
        const path = join(target.dir, name)
        // Reinstall is the update path: identical files are left untouched so a
        // repeated `skill install` stays cheap, changed ones always land.
        if (existsSync(path) && readIfPossible(path) === content) continue
        writeFileSync(path, content)
      }
      report(`已安装 ${target.id}: ${target.dir}`)
    } catch (error) {
      failed++
      report(`${target.id} 安装失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return failed === 0 ? 0 : 1
}

function readIfPossible(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return undefined
  }
}
