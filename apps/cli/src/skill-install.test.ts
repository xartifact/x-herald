import { describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { COMMAND_INDEX_JSON, SKILL_DOCS, SKILL_NAME } from './embedded-skills'
import { installSkill, SKILL_RUNTIMES } from './skill-install'

const skillsDir = join(import.meta.dir, '..', 'skills')

function withTempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'x-herald-skill-'))
  try {
    run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('embedded skill payload', () => {
  it('matches every file shipped in apps/cli/skills', () => {
    // The installed skill must be the same text the repository documents. A static
    // import is the only thing the compiled binary carries, so drift here would
    // ship stale instructions to every machine that runs `skill install`.
    const onDisk = readdirSync(skillsDir).filter((name) => name.endsWith('.md'))
    expect(Object.keys(SKILL_DOCS).toSorted()).toEqual(onDisk.toSorted())
    for (const name of onDisk) {
      expect(SKILL_DOCS[name]).toBe(readFileSync(join(skillsDir, name), 'utf-8'))
    }
  })

  it('carries the same command index the repository generates', () => {
    // Compare parsed values, not bytes: oxfmt reformats the file on commit (it packs
    // short arrays onto one line), so a byte comparison would fail on formatting that
    // carries no meaning. The count assertion catches a truncated or partial embed.
    const onDisk = JSON.parse(readFileSync(join(skillsDir, 'commands.json'), 'utf-8'))
    const embedded = JSON.parse(COMMAND_INDEX_JSON)
    expect(embedded).toEqual(onDisk)
    expect(embedded.commands.length).toBeGreaterThan(90)
  })

  it('ships a discovered frontmatter name matching the install directory', () => {
    // Every runtime scans `<root>/<dir>/SKILL.md` and uses frontmatter `name` as the
    // skill identity; a mismatch makes the skill unreachable at the advertised name.
    expect(SKILL_DOCS['SKILL.md']).toContain(`name: ${SKILL_NAME}`)
  })
})

describe('installSkill', () => {
  it('writes the full payload and is idempotent', () => {
    withTempDir((dir) => {
      expect(installSkill({ runtimes: [], all: false, dir, dryRun: false })).toBe(0)
      expect(readdirSync(dir).toSorted()).toEqual(
        [...Object.keys(SKILL_DOCS), 'commands.json'].toSorted(),
      )
      // Second run rewrites nothing but still succeeds — `skill install` doubles as
      // the update path.
      expect(installSkill({ runtimes: [], all: false, dir, dryRun: false })).toBe(0)
    })
  })

  it('writes nothing on a dry run', () => {
    withTempDir((dir) => {
      const target = join(dir, 'nested')
      expect(installSkill({ runtimes: [], all: false, dir: target, dryRun: true })).toBe(0)
      expect(existsSync(target)).toBe(false)
    })
  })

  it('rejects an unknown runtime instead of silently installing nowhere', () => {
    expect(() => installSkill({ runtimes: ['nope'], all: false, dryRun: true })).toThrow(
      /未知 runtime/,
    )
  })

  it('reports a non-zero code when no runtime is present', () => {
    // Empty runtime list + no --all means "only runtimes already on this machine".
    // Against an empty home nothing matches, and the command must fail loudly rather
    // than exit 0 having written nothing.
    withTempDir((home) => {
      expect(installSkill({ runtimes: [], all: false, home, dryRun: true })).toBe(1)
    })
  })

  it('finds an existing runtime under the given home and installs into it', () => {
    withTempDir((home) => {
      mkdirSync(join(home, '.claude'), { recursive: true })
      expect(installSkill({ runtimes: [], all: false, home, dryRun: false })).toBe(0)
      expect(existsSync(join(home, '.claude', 'skills', SKILL_NAME, 'SKILL.md'))).toBe(true)
      // A runtime that is not installed on this machine stays untouched.
      expect(existsSync(join(home, '.codex'))).toBe(false)
    })
  })

  it('installs every runtime under --all even when none exists yet', () => {
    withTempDir((home) => {
      expect(installSkill({ runtimes: [], all: true, home, dryRun: false })).toBe(0)
      for (const runtime of SKILL_RUNTIMES) {
        expect(existsSync(join(home, runtime.root, SKILL_NAME, 'SKILL.md'))).toBe(true)
      }
    })
  })
})

describe('SKILL_RUNTIMES', () => {
  it('uses one-level `<root>/<name>/SKILL.md` layouts, which is all runtimes scan', () => {
    for (const runtime of SKILL_RUNTIMES) {
      expect(runtime.root.endsWith('/skills')).toBe(true)
      expect(runtime.root.startsWith(runtime.home.replace(/\/agent$/, ''))).toBe(true)
    }
  })

  it('has unique ids', () => {
    const ids = SKILL_RUNTIMES.map((runtime) => runtime.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
