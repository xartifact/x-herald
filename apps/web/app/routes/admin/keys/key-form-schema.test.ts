import { describe, it, expect } from 'bun:test'
import { keySchema } from './key-form-schema'

describe('keySchema name validation', () => {
  it('accepts valid name (>= 2 chars)', () => {
    const result = keySchema.safeParse({
      name: 'test-key',
      allowedModels: '',
      enabled: true,
      expiresAt: '',
    })
    expect(result.success).toBe(true)
  })

  it('rejects name too short (1 char)', () => {
    const result = keySchema.safeParse({
      name: 'a',
      allowedModels: '',
      enabled: true,
      expiresAt: '',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('名称至少需要 2 个字符')
    }
  })

  it('rejects empty name', () => {
    const result = keySchema.safeParse({
      name: '',
      allowedModels: '',
      enabled: true,
      expiresAt: '',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('名称至少需要 2 个字符')
    }
  })
})

describe('keySchema allowedModels validation', () => {
  it('accepts non-empty string', () => {
    const result = keySchema.safeParse({
      name: 'test-key',
      allowedModels: 'gpt-4',
      enabled: true,
      expiresAt: '',
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty string', () => {
    const result = keySchema.safeParse({
      name: 'test-key',
      allowedModels: '',
      enabled: true,
      expiresAt: '',
    })
    expect(result.success).toBe(true)
  })
})

describe('keySchema optional nullable rate limits', () => {
  it('accepts all three omitted', () => {
    const data = keySchema.parse({
      name: 'test-key',
      allowedModels: '',
      enabled: true,
      expiresAt: '',
    })
    expect(data.rateLimitRpm).toBeUndefined()
    expect(data.rateLimitRpd).toBeUndefined()
    expect(data.tokenLimitDaily).toBeUndefined()
  })

  it('accepts all three set to valid numbers', () => {
    const data = keySchema.parse({
      name: 'test-key',
      allowedModels: '',
      rateLimitRpm: 60,
      rateLimitRpd: 1000,
      tokenLimitDaily: 100000,
      enabled: true,
      expiresAt: '',
    })
    expect(data.rateLimitRpm).toBe(60)
    expect(data.rateLimitRpd).toBe(1000)
    expect(data.tokenLimitDaily).toBe(100000)
  })

  it('accepts all three set to null', () => {
    const data = keySchema.parse({
      name: 'test-key',
      allowedModels: '',
      rateLimitRpm: null,
      rateLimitRpd: null,
      tokenLimitDaily: null,
      enabled: true,
      expiresAt: '',
    })
    expect(data.rateLimitRpm).toBeNull()
    expect(data.rateLimitRpd).toBeNull()
    expect(data.tokenLimitDaily).toBeNull()
  })

  it('accepts all three set to undefined', () => {
    const data = keySchema.parse({
      name: 'test-key',
      allowedModels: '',
      rateLimitRpm: undefined,
      rateLimitRpd: undefined,
      tokenLimitDaily: undefined,
      enabled: true,
      expiresAt: '',
    })
    expect(data.rateLimitRpm).toBeUndefined()
    expect(data.rateLimitRpd).toBeUndefined()
    expect(data.tokenLimitDaily).toBeUndefined()
  })

  it('rejects string value for rate limit field', () => {
    const result = keySchema.safeParse({
      name: 'test-key',
      allowedModels: '',
      rateLimitRpm: 'not-a-number',
      enabled: true,
      expiresAt: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('keySchema enabled validation', () => {
  it('accepts true', () => {
    const data = keySchema.parse({
      name: 'test-key',
      allowedModels: '',
      enabled: true,
      expiresAt: '',
    })
    expect(data.enabled).toBe(true)
  })

  it('accepts false', () => {
    const data = keySchema.parse({
      name: 'test-key',
      allowedModels: '',
      enabled: false,
      expiresAt: '',
    })
    expect(data.enabled).toBe(false)
  })

  it('rejects non-boolean', () => {
    const result = keySchema.safeParse({
      name: 'test-key',
      allowedModels: '',
      enabled: 'yes',
      expiresAt: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('keySchema expiresAt validation', () => {
  it('accepts valid ISO date string', () => {
    const data = keySchema.parse({
      name: 'test-key',
      allowedModels: '',
      enabled: true,
      expiresAt: '2026-12-31T23:59:59Z',
    })
    expect(data.expiresAt).toBe('2026-12-31T23:59:59Z')
  })

  it('accepts empty string', () => {
    const data = keySchema.parse({
      name: 'test-key',
      allowedModels: '',
      enabled: true,
      expiresAt: '',
    })
    expect(data.expiresAt).toBe('')
  })

  it('rejects undefined (missing required field)', () => {
    const data: Record<string, unknown> = {
      name: 'test-key',
      allowedModels: '',
      enabled: true,
    }
    const result = keySchema.safeParse(data)
    expect(result.success).toBe(false)
  })
})

describe('keySchema full schema integration', () => {
  it('accepts valid complete data', () => {
    const data = keySchema.parse({
      name: 'production-key',
      allowedModels: 'gpt-4,gpt-3.5',
      rateLimitRpm: 100,
      rateLimitRpd: 5000,
      tokenLimitDaily: 1000000,
      enabled: true,
      expiresAt: '2026-12-31T23:59:59Z',
    })
    expect(data.name).toBe('production-key')
    expect(data.allowedModels).toBe('gpt-4,gpt-3.5')
    expect(data.rateLimitRpm).toBe(100)
    expect(data.rateLimitRpd).toBe(5000)
    expect(data.tokenLimitDaily).toBe(1000000)
    expect(data.enabled).toBe(true)
    expect(data.expiresAt).toBe('2026-12-31T23:59:59Z')
  })

  it('accepts minimal valid data', () => {
    const data = keySchema.parse({
      name: 'min-key',
      allowedModels: '',
      enabled: false,
      expiresAt: '',
    })
    expect(data.name).toBe('min-key')
    expect(data.allowedModels).toBe('')
    expect(data.enabled).toBe(false)
    expect(data.expiresAt).toBe('')
  })

  it('rejects missing required field name', () => {
    const data: Record<string, unknown> = {
      allowedModels: '',
      enabled: true,
      expiresAt: '',
    }
    const result = keySchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it('rejects missing required field enabled', () => {
    const data: Record<string, unknown> = {
      name: 'test-key',
      allowedModels: '',
      expiresAt: '',
    }
    const result = keySchema.safeParse(data)
    expect(result.success).toBe(false)
  })
})
