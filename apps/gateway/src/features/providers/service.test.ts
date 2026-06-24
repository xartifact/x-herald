import { describe, it, expect } from 'bun:test'
import { ProtocolConfigSchema, ProtocolsSchema, CreateProviderSchema, UpdateProviderSchema } from './service'

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