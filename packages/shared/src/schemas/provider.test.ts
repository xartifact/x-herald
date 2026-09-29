import { describe, it, expect } from 'bun:test'
import { z } from 'zod'
import { providerSchema, PROTOCOL_OPTIONS, type ProviderFormData } from './provider'
import { thinkingMappingFormSchema, mappingSchema, type MappingFormData } from './thinking-mapping'

describe('providerSchema', () => {
  it('accepts valid provider data', () => {
    const result = providerSchema.safeParse({
      name: 'OpenAI',
      apiKey: 'sk-test',
      enabled: true,
      protocols: {
        openai: { enabled: true, baseUrl: 'https://api.openai.com/v1' },
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects name shorter than 2 characters', () => {
    const result = providerSchema.safeParse({
      name: 'A',
      enabled: true,
      protocols: {
        openai: { enabled: true },
      },
    })
    expect(result.success).toBe(false)
  })

  it('rejects when no protocol is enabled', () => {
    const result = providerSchema.safeParse({
      name: 'Test Provider',
      enabled: true,
      protocols: {
        openai: { enabled: false },
        anthropic: { enabled: false },
      },
    })
    expect(result.success).toBe(false)
  })

  it('accepts optional apiKey', () => {
    const result = providerSchema.safeParse({
      name: 'Test Provider',
      enabled: true,
      protocols: {
        openai: { enabled: true },
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid baseUrl', () => {
    const result = providerSchema.safeParse({
      name: 'Test Provider',
      enabled: true,
      protocols: {
        openai: { enabled: true, baseUrl: 'not-a-url' },
      },
    })
    expect(result.success).toBe(false)
  })

  it('accepts empty string baseUrl', () => {
    const result = providerSchema.safeParse({
      name: 'Test Provider',
      enabled: true,
      protocols: {
        openai: { enabled: true, baseUrl: '' },
      },
    })
    expect(result.success).toBe(true)
  })
})

describe('PROTOCOL_OPTIONS', () => {
  it('contains expected protocols', () => {
    expect(PROTOCOL_OPTIONS.map((option) => option.value)).toEqual([
      'openai',
      'anthropic',
      'gemini',
      'jev',
    ])
  })

  it('has label and defaultUrl for each option', () => {
    for (const option of PROTOCOL_OPTIONS) {
      expect(option.label).toBeTruthy()
      expect(option.defaultUrl).toMatch(/^https:\/\//)
    }
  })
})

describe('ProviderFormData type inference', () => {
  it('infers correct type from providerSchema', () => {
    const data: ProviderFormData = {
      name: 'Test',
      apiKey: 'key',
      enabled: true,
      protocols: {
        openai: { enabled: true, baseUrl: 'https://api.openai.com/v1' },
      },
    }
    expect(data.name).toBe('Test')
    expect(data.enabled).toBe(true)
  })
})

describe('thinkingMappingFormSchema', () => {
  it('accepts valid thinking mapping data', () => {
    const result = thinkingMappingFormSchema.safeParse({
      mappings: [{ from: 'model-a', to: 'model-b' }],
      syntheticThinking: 'strip',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid syntheticThinking value', () => {
    const result = thinkingMappingFormSchema.safeParse({
      mappings: [],
      syntheticThinking: 'invalid',
    })
    expect(result.success).toBe(false)
  })

  it('rejects mapping with missing fields', () => {
    const result = thinkingMappingFormSchema.safeParse({
      mappings: [{ from: 'model-a' }],
      syntheticThinking: 'inject',
    })
    expect(result.success).toBe(false)
  })
})

describe('MappingFormData type inference', () => {
  it('infers correct type from thinkingMappingFormSchema', () => {
    const data: MappingFormData = {
      mappings: [{ from: 'a', to: 'b' }],
      syntheticThinking: 'strip',
    }
    expect(data.mappings).toHaveLength(1)
    expect(data.syntheticThinking).toBe('strip')
  })
})
