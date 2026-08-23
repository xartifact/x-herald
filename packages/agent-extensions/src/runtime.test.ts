import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  cacheHostVersion,
  detectRuntime,
  parseVersionFromOutput,
  readHostVersion,
  resetHostVersionCache,
} from './runtime'

const KEY = 'X_HERALD_CONFIG_DIR'
let prev: string | undefined

afterEach(() => {
  if (prev === undefined) delete process.env[KEY]
  else process.env[KEY] = prev
  resetHostVersionCache()
})

describe('detectRuntime', () => {
  it('honors X_HERALD_CONFIG_DIR containing .omp → omp', () => {
    prev = process.env[KEY]
    process.env[KEY] = '/tmp/.omp/agent'
    const r = detectRuntime()
    expect(r.name).toBe('omp')
    expect(r.configDir).toBe('/tmp/.omp/agent')
  })

  it('honors X_HERALD_CONFIG_DIR containing .prime → prime', () => {
    prev = process.env[KEY]
    process.env[KEY] = '/tmp/.prime/agent'
    const r = detectRuntime()
    expect(r.name).toBe('prime')
    expect(r.configDir).toBe('/tmp/.prime/agent')
  })

  it('honors any other X_HERALD_CONFIG_DIR → pi', () => {
    prev = process.env[KEY]
    process.env[KEY] = '/tmp/pi-home/agent'
    const r = detectRuntime()
    expect(r.name).toBe('pi')
    expect(r.configDir).toBe('/tmp/pi-home/agent')
  })

  it('falls back to disk detection when the env override is unset', () => {
    prev = process.env[KEY]
    delete process.env[KEY]
    const r = detectRuntime()
    expect(['pi', 'omp', 'prime']).toContain(r.name)
    expect(r.configDir.length).toBeGreaterThan(0)
  })
})

describe('readHostVersion', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('reads lastChangelogVersion from settings.json for pi', () => {
    dir = mkdtempSync(join(tmpdir(), 'x-herald-pi-'))
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ lastChangelogVersion: '0.83.0' }))
    expect(readHostVersion({ name: 'pi', configDir: dir })).toBe('0.83.0')
  })

  it('reads lastChangelogVersion from settings.json for prime, when present', () => {
    dir = mkdtempSync(join(tmpdir(), 'x-herald-prime-'))
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ lastChangelogVersion: '0.7.4' }))
    expect(readHostVersion({ name: 'prime', configDir: dir })).toBe('0.7.4')
  })

  it('reads the plain-text last-changelog-version file for omp', () => {
    dir = mkdtempSync(join(tmpdir(), 'x-herald-omp-'))
    writeFileSync(join(dir, 'last-changelog-version'), '18.0.1\n')
    expect(readHostVersion({ name: 'omp', configDir: dir })).toBe('18.0.1')
  })

  it('returns undefined when the marker file is missing', () => {
    dir = mkdtempSync(join(tmpdir(), 'x-herald-empty-'))
    expect(readHostVersion({ name: 'pi', configDir: dir })).toBeUndefined()
    expect(readHostVersion({ name: 'omp', configDir: dir })).toBeUndefined()
  })

  it('returns undefined when settings.json has no lastChangelogVersion field (current prime behavior)', () => {
    dir = mkdtempSync(join(tmpdir(), 'x-herald-prime-nofield-'))
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ defaultProvider: 'x-herald' }))
    expect(readHostVersion({ name: 'prime', configDir: dir })).toBeUndefined()
  })

  it('returns undefined instead of throwing on malformed settings.json', () => {
    dir = mkdtempSync(join(tmpdir(), 'x-herald-malformed-'))
    writeFileSync(join(dir, 'settings.json'), '{ not valid json')
    expect(readHostVersion({ name: 'pi', configDir: dir })).toBeUndefined()
  })

  it('prefers the process-level cache over the marker file when populated', () => {
    dir = mkdtempSync(join(tmpdir(), 'x-herald-cache-priority-'))
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ lastChangelogVersion: '0.1.0' }))
    cacheHostVersion('9.9.9')
    expect(readHostVersion({ name: 'pi', configDir: dir })).toBe('9.9.9')
  })

  it('caching "resolved to undefined" still short-circuits the marker-file fallback', () => {
    dir = mkdtempSync(join(tmpdir(), 'x-herald-cache-undefined-'))
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ lastChangelogVersion: '0.1.0' }))
    cacheHostVersion(undefined)
    expect(readHostVersion({ name: 'pi', configDir: dir })).toBeUndefined()
  })
})

describe('parseVersionFromOutput', () => {
  it('extracts a bare semver string', () => {
    expect(parseVersionFromOutput('0.83.0')).toBe('0.83.0')
  })

  it('extracts semver from a "<name>/<version>" prefixed output', () => {
    expect(parseVersionFromOutput('omp/18.0.1')).toBe('18.0.1')
  })

  it('trims surrounding whitespace/newlines', () => {
    expect(parseVersionFromOutput('  0.7.4\n')).toBe('0.7.4')
  })

  it('returns undefined when no semver-ish token is present', () => {
    expect(parseVersionFromOutput('not a version')).toBeUndefined()
  })
})
