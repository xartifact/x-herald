import { describe, expect, it } from 'bun:test'

import { buildRequest, unwrap } from './executor'
import { MOUNTS } from './executor'
import { SPEC_COMMANDS } from './spec-commands'

describe('spec coverage', () => {
  it('every spec group has a mount path', () => {
    for (const spec of SPEC_COMMANDS) {
      expect(MOUNTS[spec.group]).toBeDefined()
    }
  })

  it('has a command for every admin feature group and no duplicate group+name pairs', () => {
    const seen = new Set<string>()
    for (const spec of SPEC_COMMANDS) {
      const key = `${spec.group}/${spec.name}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
    expect(SPEC_COMMANDS.length).toBeGreaterThan(90)
    for (const group of [
      'providers',
      'groups',
      'instances',
      'keys',
      'logs',
      'metrics',
      'costs',
      'cb',
      'access',
      'rules',
      'traces',
      'potential',
      'settings',
      'workspaces',
      'config',
      'ai',
    ]) {
      expect(seen.has(`${group}/list`) || SPEC_COMMANDS.some((s) => s.group === group)).toBe(true)
    }
  })

  it('every path placeholder is declared as an argument', () => {
    for (const spec of SPEC_COMMANDS) {
      const placeholders = [...spec.path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1])
      for (const placeholder of placeholders) {
        expect(spec.args ?? []).toContain(placeholder)
      }
    }
  })
})

describe('buildRequest', () => {
  const listLogs = SPEC_COMMANDS.find((s) => s.group === 'logs' && s.name === 'list')!

  it('strips the trailing slash so Hono mounts match', () => {
    const providers = SPEC_COMMANDS.find((s) => s.group === 'providers' && s.name === 'list')!
    expect(buildRequest(providers, {}, {}, 'http://gw').url).toBe('http://gw/api/providers')
  })

  it('interpolates path args and puts flags in the query string', () => {
    const built = buildRequest(
      listLogs,
      {},
      { pageSize: '10', modelName: 'gpt-4', status: 'success' },
      'http://gw',
    )
    const url = new URL(built.url)
    expect(url.pathname).toBe('/api/logs')
    expect(url.searchParams.get('page-size')).toBe('10')
    expect(url.searchParams.get('model-name')).toBe('gpt-4')
    expect(url.searchParams.get('status')).toBe('success')
  })

  it('parses JSON body flags and omits undefined ones', () => {
    const create = SPEC_COMMANDS.find((s) => s.group === 'instances' && s.name === 'create')!
    const built = buildRequest(
      create,
      {},
      { providerId: 'p1', name: 'n', capabilities: undefined, config: '{"a":1}' },
      'http://gw',
    )
    expect(JSON.parse(built.body!)).toEqual({ providerId: 'p1', name: 'n', config: { a: 1 } })
  })

  it('keeps non-JSON strings as strings', () => {
    const create = SPEC_COMMANDS.find((s) => s.group === 'instances' && s.name === 'create')!
    const built = buildRequest(create, {}, { name: 'gpt-4o' }, 'http://gw')
    expect(JSON.parse(built.body!)).toEqual({ name: 'gpt-4o' })
  })

  it('sends no body for GET and DELETE', () => {
    const del = SPEC_COMMANDS.find((s) => s.group === 'providers' && s.name === 'delete')!
    expect(buildRequest(del, { id: 'abc' }, {}, 'http://gw').body).toBeUndefined()
  })

  it('rejects a missing required path argument', () => {
    const get = SPEC_COMMANDS.find((s) => s.group === 'providers' && s.name === 'get')!
    expect(() => buildRequest(get, {}, {}, 'http://gw')).toThrow('Missing required argument <id>')
  })

  it('encodes path arguments', () => {
    const get = SPEC_COMMANDS.find((s) => s.group === 'providers' && s.name === 'get')!
    expect(buildRequest(get, { id: 'a b/c' }, {}, 'http://gw').url).toBe(
      'http://gw/api/providers/a%20b%2Fc',
    )
  })
})

describe('unwrap', () => {
  it('extracts data from the success envelope', () => {
    expect(unwrap({ success: true, data: [1] })).toEqual([1])
  })
  it('keeps the envelope when asked (list endpoints with cursors)', () => {
    const body = { success: true, data: [], nextCursor: 'c1' }
    expect(unwrap(body, 'envelope')).toEqual(body)
  })
  it('returns the body unchanged when there is no data field', () => {
    expect(unwrap({ status: 'healthy' })).toEqual({ status: 'healthy' })
  })
})
