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
      'asr',
      'tts',
    ])
  })

  it('has a label for each option', () => {
    for (const option of PROTOCOL_OPTIONS) {
      expect(option.label).toBeTruthy()
    }
  })

  it('gives hosted protocols an https default and audio protocols a default endpoint', () => {
    for (const option of PROTOCOL_OPTIONS) {
      const isAudio = option.value === 'asr' || option.value === 'tts'
      if (isAudio) {
        // 音频上游是自建/自有契约，没有公共默认地址，只有默认端点路径
        expect(option.defaultUrl).toBe('')
        expect('defaultEndpoint' in option && option.defaultEndpoint).toMatch(/^\/v1\/audio\//)
      } else {
        expect(option.defaultUrl).toMatch(/^https:\/\//)
      }
    }
  })

  it('accepts an asr/tts protocol with an endpoint override', () => {
    const result = providerSchema.safeParse({
      name: 'Local Whisper',
      enabled: true,
      protocols: {
        asr: { enabled: true, baseUrl: 'http://x99:8080', endpoint: '/inference' },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.protocols.asr?.endpoint).toBe('/inference')
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
