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

// bun's Mock<T> doesn't carry fetch's `preconnect` method, so a bare mock()
// isn't structurally assignable to `typeof fetch`. Add a no-op preconnect
// instead of casting through `as`.
function mockFetch(impl: (url: string | URL | Request, init?: RequestInit) => Promise<Response>) {
  return Object.assign(mock(impl), { preconnect: () => {} })
}

describe('GatewayClient', () => {
  it('login posts password and returns token', async () => {
    globalThis.fetch = mockFetch((_url, init) => {
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({ password: 'secret' })
      return Promise.resolve(mockResponse(200, { token: 'jwt-abc' }))
    })

    const client = new GatewayClient({ baseUrl: 'http://gw', apiKey: '' })
    const res = await client.login('secret')
    expect(res.token).toBe('jwt-abc')
  })

  it('listInstances unwraps { success, data } and sends bearer token', async () => {
    globalThis.fetch = mockFetch((url, init) => {
      expect(String(url)).toBe('http://gw/api/model-groups/instances')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer tok' })
      return Promise.resolve(
        mockResponse(200, {
          success: true,
          data: [{ id: 'i1', name: 'X', actualModelName: 'X', enabled: true, config: { a: 1 } }],
        }),
      )
    })

    const client = new GatewayClient({ baseUrl: 'http://gw', apiKey: 'tok' })
    const instances = await client.listInstances()
    expect(instances).toHaveLength(1)
    expect(instances[0]?.id).toBe('i1')
    expect(instances[0]?.config).toEqual({ a: 1 })
  })

  it('updateInstance PUTs config for read-modify-write', async () => {
    globalThis.fetch = mockFetch((url, init) => {
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

    const client = new GatewayClient({ baseUrl: 'http://gw', apiKey: 'tok' })
    const updated = await client.updateInstance('id9', {
      config: { roleMapping: { developer: 'system' } },
    })
    expect(updated.config).toEqual({ roleMapping: { developer: 'system' } })
  })

  it('throws a descriptive error on non-2xx', async () => {
    globalThis.fetch = mockFetch(() =>
      Promise.resolve(mockResponse(401, { error: 'Invalid password' })),
    )

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
