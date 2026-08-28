import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import type { Database } from '../../db/client'
import {
  ProtocolConfigSchema,
  ProtocolsSchema,
  CreateProviderSchema,
  UpdateProviderSchema,
} from './service'
import { fetchRemoteModels } from './service'

describe('ProtocolConfigSchema', () => {
  it('accepts valid baseUrl with enabled: true', () => {
    const result = ProtocolConfigSchema.parse({
      baseUrl: 'https://api.openai.com',
      enabled: true,
    })
    expect(result.baseUrl).toBe('https://api.openai.com')
    expect(result.enabled).toBe(true)
  })

  it('accepts enabled: false with valid baseUrl', () => {
    const result = ProtocolConfigSchema.parse({
      baseUrl: 'https://api.anthropic.com',
      enabled: false,
    })
    expect(result.enabled).toBe(false)
  })

  it('rejects empty baseUrl string', () => {
    const result = ProtocolConfigSchema.safeParse({
      baseUrl: '',
      enabled: true,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('baseUrl is required')
    }
  })

  it('rejects missing baseUrl', () => {
    const result = ProtocolConfigSchema.safeParse({
      enabled: true,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/expected string, received undefined/)
    }
  })

  it('rejects missing enabled', () => {
    const result = ProtocolConfigSchema.safeParse({
      baseUrl: 'https://api.openai.com',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/expected boolean, received undefined/)
    }
  })

  it('passthrough allows extra fields', () => {
    const result = ProtocolConfigSchema.parse({
      baseUrl: 'https://api.openai.com',
      enabled: true,
      thinkingMapping: { enabled: true, mappings: {} },
    })
    expect(result.thinkingMapping).toEqual({ enabled: true, mappings: {} })
  })
})

describe('ProtocolsSchema', () => {
  it('accepts single protocol with valid baseUrl', () => {
    const result = ProtocolsSchema.parse({
      openai: { baseUrl: 'https://api.openai.com', enabled: true },
    })
    expect(result.openai.baseUrl).toBe('https://api.openai.com')
  })

  it('accepts multiple protocols', () => {
    const result = ProtocolsSchema.parse({
      openai: { baseUrl: 'https://api.openai.com', enabled: true },
      anthropic: { baseUrl: 'https://api.anthropic.com', enabled: false },
    })
    expect(result.openai.enabled).toBe(true)
    expect(result.anthropic.enabled).toBe(false)
  })

  it('rejects empty protocols object', () => {
    const result = ProtocolsSchema.safeParse({})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('At least one protocol must be configured')
    }
  })

  it('rejects null', () => {
    const result = ProtocolsSchema.safeParse(null)
    expect(result.success).toBe(false)
  })
})

describe('CreateProviderSchema', () => {
  it('accepts valid minimal data', () => {
    const result = CreateProviderSchema.parse({
      name: 'Test Provider',
      protocols: { openai: { baseUrl: 'https://api.openai.com', enabled: true } },
    })
    expect(result.name).toBe('Test Provider')
  })

  it('defaults enabled to true when omitted', () => {
    const result = CreateProviderSchema.parse({
      name: 'Test Provider',
      protocols: { openai: { baseUrl: 'https://api.openai.com', enabled: true } },
    })
    expect(result.enabled).toBe(true)
  })

  it('accepts explicit enabled: false', () => {
    const result = CreateProviderSchema.parse({
      name: 'Test Provider',
      protocols: { openai: { baseUrl: 'https://api.openai.com', enabled: true } },
      enabled: false,
    })
    expect(result.enabled).toBe(false)
  })

  it('rejects missing name', () => {
    const result = CreateProviderSchema.safeParse({
      protocols: { openai: { baseUrl: 'https://api.openai.com', enabled: true } },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/expected string, received undefined/)
    }
  })

  it('rejects empty name', () => {
    const result = CreateProviderSchema.safeParse({
      name: '',
      protocols: { openai: { baseUrl: 'https://api.openai.com', enabled: true } },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('name is required')
    }
  })

  it('rejects missing protocols', () => {
    const result = CreateProviderSchema.safeParse({
      name: 'Test Provider',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/expected record, received undefined/)
    }
  })

  it('accepts optional apiKey omitted', () => {
    const result = CreateProviderSchema.parse({
      name: 'Test Provider',
      protocols: { openai: { baseUrl: 'https://api.openai.com', enabled: true } },
    })
    expect(result.apiKey).toBeUndefined()
  })

  it('accepts optional apiKey as null', () => {
    const result = CreateProviderSchema.parse({
      name: 'Test Provider',
      protocols: { openai: { baseUrl: 'https://api.openai.com', enabled: true } },
      apiKey: null,
    })
    expect(result.apiKey).toBeNull()
  })

  it('accepts optional apiKey as string', () => {
    const result = CreateProviderSchema.parse({
      name: 'Test Provider',
      protocols: { openai: { baseUrl: 'https://api.openai.com', enabled: true } },
      apiKey: 'sk-test-123',
    })
    expect(result.apiKey).toBe('sk-test-123')
  })
})

describe('UpdateProviderSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    const result = UpdateProviderSchema.parse({})
    expect(result).toEqual({})
  })

  it('accepts partial update with name only', () => {
    const result = UpdateProviderSchema.parse({
      name: 'Updated Provider',
    })
    expect(result.name).toBe('Updated Provider')
  })

  it('accepts partial update with protocols only', () => {
    const result = UpdateProviderSchema.parse({
      protocols: { openai: { baseUrl: 'https://api.openai.com', enabled: true } },
    })
    expect(result.protocols?.openai.baseUrl).toBe('https://api.openai.com')
  })

  it('accepts empty name string (optional, no .min(1))', () => {
    const result = UpdateProviderSchema.parse({
      name: '',
    })
    expect(result.name).toBe('')
  })

  it('accepts enabled: false', () => {
    const result = UpdateProviderSchema.parse({
      enabled: false,
    })
    expect(result.enabled).toBe(false)
  })

  it('accepts apiKey as string', () => {
    const result = UpdateProviderSchema.parse({
      apiKey: 'sk-new-key',
    })
    expect(result.apiKey).toBe('sk-new-key')
  })

  it('accepts apiKey as null', () => {
    const result = UpdateProviderSchema.parse({
      apiKey: null,
    })
    expect(result.apiKey).toBeNull()
  })

  it('rejects invalid protocols (empty baseUrl)', () => {
    const result = UpdateProviderSchema.safeParse({
      protocols: { openai: { baseUrl: '', enabled: true } },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('baseUrl is required')
    }
  })
})
describe('fetchRemoteModels', () => {
  const originalFetch = globalThis.fetch
  const providerId = 'e578cbdb-64ac-4c2a-a96a-886b9ef5bf6f'
  let fetchMock: ReturnType<typeof mock<typeof fetch>>

  /** 构造一个 fake Database：select() 返回链式对象，按调用队列依次 resolve 结果 */
  function createQueuedDb(results: unknown[]): Database {
    let calls = 0
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      then: (resolve: (v: unknown) => void) => {
        const result = results[calls++] ?? []
        resolve(result)
      },
    }
    return { select: mock(() => chain) } as unknown as Database
  }

  beforeEach(() => {
    fetchMock = mock(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response('{}', { status: 200 }),
    ) as unknown as ReturnType<typeof mock<typeof fetch>>
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns NOT_FOUND when provider missing', async () => {
    const db = createQueuedDb([[]])
    const result = await fetchRemoteModels(providerId, db)
    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' })
  })

  it('returns DISABLED when provider disabled', async () => {
    const db = createQueuedDb([[{ id: providerId, name: 'bai', enabled: false }]])
    const result = await fetchRemoteModels(providerId, db)
    expect(result).toEqual({ ok: false, code: 'DISABLED' })
  })

  it('fetches models via openai protocol and marks synced', async () => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      expect(String(url)).toBe('https://api.openai.com/v1/models')
      return new Response(
        JSON.stringify({ data: [{ id: 'gpt-4o', object: 'model' }, { id: 'gpt-4o-mini' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    const db = createQueuedDb([
      [
        {
          id: providerId,
          name: 'bai',
          enabled: true,
          protocols: { openai: { enabled: true, baseUrl: 'https://api.openai.com/v1' } },
        },
      ],
      [{ actualModelName: 'gpt-4o' }],
    ])
    const result = await fetchRemoteModels(providerId, db)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.models.map((m) => m.id)).toEqual(['gpt-4o', 'gpt-4o-mini'])
      expect(result.models[0].synced).toBe(true)
      expect(result.models[1].synced).toBe(false)
      expect(result.fetchError).toBeNull()
    }
  })

  it('uses x-goog-api-key header for gemini protocol', async () => {
    let seenHeaders: Record<string, string> | undefined
    fetchMock.mockImplementation(async (_url: string | URL, init?: RequestInit) => {
      seenHeaders = (init?.headers ?? {}) as Record<string, string>
      return new Response(JSON.stringify({ data: [{ id: 'gemini-1.5-pro' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    const db = createQueuedDb([
      [
        {
          id: providerId,
          name: 'g',
          enabled: true,
          apiKey: 'goog-key',
          protocols: {
            gemini: { enabled: true, baseUrl: 'https://generativelanguage.googleapis.com/v1' },
          },
        },
      ],
      [],
    ])
    const result = await fetchRemoteModels(providerId, db)
    expect(result.ok).toBe(true)
    expect(seenHeaders?.['x-goog-api-key']).toBe('goog-key')
  })

  it('records fetchError on non-ok upstream response', async () => {
    fetchMock.mockImplementation(async () => new Response('unauthorized', { status: 401 }))
    const db = createQueuedDb([
      [
        {
          id: providerId,
          name: 'bai',
          enabled: true,
          protocols: { openai: { enabled: true, baseUrl: 'https://api.b.ai/v1' } },
        },
      ],
      [],
    ])
    const result = await fetchRemoteModels(providerId, db)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.fetchError).toBe('OpenAI API returned 401')
      expect(result.models).toEqual([])
    }
  })

  it('records fetchError when no supported protocol enabled', async () => {
    const db = createQueuedDb([[{ id: providerId, name: 'x', enabled: true, protocols: {} }], []])
    const result = await fetchRemoteModels(providerId, db)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.fetchError).toBe('No supported protocol enabled')
    }
  })

  it('records fetchError when fetch throws', async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError('unknown certificate verification error')
    })
    const db = createQueuedDb([
      [
        {
          id: providerId,
          name: 'bai',
          enabled: true,
          protocols: { openai: { enabled: true, baseUrl: 'https://api.b.ai/v1' } },
        },
      ],
      [],
    ])
    const result = await fetchRemoteModels(providerId, db)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.fetchError).toBe('unknown certificate verification error')
    }
  })

  it('trims trailing slash from baseUrl', async () => {
    let seenUrl = ''
    fetchMock.mockImplementation(async (url: string | URL) => {
      seenUrl = String(url)
      return new Response(JSON.stringify({ data: [{ id: 'm' }] }), { status: 200 })
    })
    const db = createQueuedDb([
      [
        {
          id: providerId,
          name: 'c',
          enabled: true,
          protocols: { openai: { enabled: true, baseUrl: 'http://100.108.156.20:8080/v1/' } },
        },
      ],
      [],
    ])
    await fetchRemoteModels(providerId, db)
    expect(seenUrl).toBe('http://100.108.156.20:8080/v1/models')
  })
})
