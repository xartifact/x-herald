import { afterEach, describe, expect, it } from 'bun:test'

import { detectRuntime } from './runtime'

const KEY = 'X_HERALD_CONFIG_DIR'
let prev: string | undefined

afterEach(() => {
  if (prev === undefined) delete process.env[KEY]
  else process.env[KEY] = prev
})

describe('detectRuntime', () => {
  it('honors X_HERALD_CONFIG_DIR containing .omp → omp', () => {
    prev = process.env[KEY]
    process.env[KEY] = '/tmp/.omp/agent'
    const r = detectRuntime()
    expect(r.name).toBe('omp')
    expect(r.configDir).toBe('/tmp/.omp/agent')
  })

  it('honors X_HERALD_CONFIG_DIR without .omp → pi', () => {
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
    expect(['pi', 'omp']).toContain(r.name)
    expect(r.configDir.length).toBeGreaterThan(0)
  })
})
