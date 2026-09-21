import { describe, expect, it } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { MIGRATIONS_FOLDER } from './client'

/**
 * Guard for the migrations directory.
 *
 * `runPostgresMigrations` and `runPgliteMigrations` both derive the migration
 * set from `readdirSync(MIGRATIONS_FOLDER)` — the directory IS the source of
 * truth, and `meta/_journal.json` is metadata that no code reads. That makes the
 * journal free to drift, and it had: three files (0032–0034, the intent-log
 * table and its classifier columns) were applied in production and on fresh
 * databases while being absent from the journal, so any audit that trusted the
 * journal would report a migration set that does not match what actually runs.
 *
 * These assertions keep the two in step. They matter because the journal is the
 * first place a reader looks to answer "which migrations exist", and a wrong
 * answer there is worse than no journal at all.
 */
describe('migrations directory consistency', () => {
  const files = readdirSync(MIGRATIONS_FOLDER)
    .filter((file) => file.endsWith('.sql'))
    .toSorted()
  const tags = files.map((file) => file.replace(/\.sql$/, ''))
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: Array<{ idx: number; tag: string }> }
  const journalTags = journal.entries.map((entry) => entry.tag)

  it('has at least one migration', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('lists every migration file in the journal, in the same order', () => {
    expect(journalTags).toEqual(tags)
  })

  it('numbers each migration uniquely', () => {
    const prefixes = tags.map((tag) => tag.split('_')[0])
    expect(new Set(prefixes).size).toBe(prefixes.length)
  })

  it('sorts migration files by numeric prefix, not lexically', () => {
    // `readdirSync().toSorted()` is lexical; four-digit prefixes make the two
    // agree, and this is what keeps that true if the width ever changes.
    const numeric = tags.map((tag) => Number.parseInt(tag.split('_')[0] ?? '', 10))
    expect(numeric.every((n) => Number.isInteger(n))).toBe(true)
    expect([...numeric].toSorted((a, b) => a - b)).toEqual(numeric)
  })

  it('keeps journal indices dense and ascending from zero', () => {
    // The runner ignores idx, but drizzle-kit reads it; a gap would surface as a
    // confusing failure the first time anyone runs a drizzle-kit command here.
    expect(journal.entries.map((entry) => entry.idx)).toEqual(
      Array.from({ length: journal.entries.length }, (_, i) => i),
    )
  })
})
