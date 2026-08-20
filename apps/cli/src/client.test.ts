import { describe, expect, it, mock, afterEach } from 'bun:test'

import { GatewayClient } from './client'

// Save the real fetch, stub it per-test to avoid network.
const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function mockResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('GatewayClient', () => {
  it('login posts password and returns token', async () => {
    const fetchMock = mock((_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({ password: 'secret' })
      return Promise.resolve(mockResponse(200, { token: 'jwt-abc' }))
    })
    globalThis.fetch = fetchMock as typeof fetch

    const client = new GatewayClient({ baseUrl: 'http://gw', apiKey: '' })
    const res = await client.login('secret')
    expect(res.token).toBe('jwt-abc')
  })

  it('listInstances unwraps { success, data } and sends bearer token', async () => {
    const fetchMock = mock((url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('http://gw/api/model-groups/instances')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer tok' })
      return Promise.resolve(
        mockResponse(200, {
          success: true,
          data: [{ id: 'i1', name: 'X', actualModelName: 'X', enabled: true, config: { a: 1 } }],
        }),
      )
    })
    globalThis.fetch = fetchMock as typeof fetch

    const client = new GatewayClient({ baseUrl: 'http://gw', apiKey: 'tok' })
    const instances = await client.listInstances()
    expect(instances).toHaveLength(1)
    expect(instances[0]?.id).toBe('i1')
    expect(instances[0]?.config).toEqual({ a: 1 })
  })

  it('updateInstance PUTs config for read-modify-write', async () => {
    const fetchMock = mock((url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('http://gw/api/model-groups/instances/id9')
      expect(init?.method).toBe('PUT')
      expect(JSON.parse(String(init?.body))).toEqual({
        config: { roleMapping: { developer: 'system' } },
      })
      return Promise.resolve(
        mockResponse(200, {
          success: true,
          data: { id: 'id9', name: 'X', config: { roleMapping: { developer: 'system' } } },
        }),
      )
    })
    globalThis.fetch = fetchMock as typeof fetch

    const client = new GatewayClient({ baseUrl: 'http://gw', apiKey: 'tok' })
    const updated = await client.updateInstance('id9', {
      config: { roleMapping: { developer: 'system' } },
    })
    expect(updated.config).toEqual({ roleMapping: { developer: 'system' } })
  })

  it('throws a descriptive error on non-2xx', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(mockResponse(401, { error: 'Invalid password' })),
    ) as typeof fetch

    const client = new GatewayClient({ baseUrl: 'http://gw', apiKey: '' })
    try {
      await client.login('wrong')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(Error)
      expect((e as Error).message).toContain('401')
    }
  })
})
