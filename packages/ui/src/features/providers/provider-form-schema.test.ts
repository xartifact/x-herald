import { describe, it, expect } from 'vitest'
import { providerSchema, PROTOCOL_OPTIONS } from './provider-form-schema'

describe('providerSchema', () => {
  describe('name validation', () => {
    it('valid name (>= 2 chars) passes', () => {
      expect(providerSchema.shape.name.parse('My Provider')).toBe('My Provider')
    })

    it('name too short (1 char) fails with Chinese error message', () => {
      const result = providerSchema.shape.name.safeParse('A')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('名称至少需要 2 个字符')
      }
    })

    it('empty name fails', () => {
      const result = providerSchema.shape.name.safeParse('')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('名称至少需要 2 个字符')
      }
    })
  })

  describe('baseUrl .or(z.literal("")) fix', () => {
    it('baseUrl with valid URL passes', () => {
      const result = providerSchema.safeParse({
        name: 'Test Provider',
        enabled: true,
        protocols: { openai: { enabled: true, baseUrl: 'https://api.openai.com/v1' } },
      })
      expect(result.success).toBe(true)
    })

    it('baseUrl with empty string passes (the .or(z.literal("")) fix)', () => {
      const result = providerSchema.safeParse({
        name: 'Test Provider',
        enabled: true,
        protocols: { openai: { enabled: true, baseUrl: '' } },
      })
      expect(result.success).toBe(true)
    })

    it('baseUrl with invalid string fails with Chinese error message', () => {
      const result = providerSchema.safeParse({
        name: 'Test Provider',
        enabled: true,
        protocols: { openai: { enabled: true, baseUrl: 'not-a-url' } },
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('请输入有效的 URL')
      }
    })

    it('baseUrl with undefined (omitted) passes', () => {
      const result = providerSchema.safeParse({
        name: 'Test Provider',
        enabled: true,
        protocols: { openai: { enabled: true } },
      })
      expect(result.success).toBe(true)
    })
  })

  describe('protocol .refine() (at-least-one-protocol)', () => {
    it('all protocols disabled fails with 至少需要启用一个协议', () => {
      const result = providerSchema.safeParse({
        name: 'Test Provider',
        enabled: true,
        protocols: {
          openai: { enabled: false },
          anthropic: { enabled: false },
          gemini: { enabled: false },
        },
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('至少需要启用一个协议')
      }
    })

    it('one protocol enabled passes', () => {
      const result = providerSchema.safeParse({
        name: 'Test Provider',
        enabled: true,
        protocols: {
          openai: { enabled: true },
          anthropic: { enabled: false },
          gemini: { enabled: false },
        },
      })
      expect(result.success).toBe(true)
    })

    it('multiple protocols enabled passes', () => {
      const result = providerSchema.safeParse({
        name: 'Test Provider',
        enabled: true,
        protocols: {
          openai: { enabled: true },
          anthropic: { enabled: true },
          gemini: { enabled: true },
        },
      })
      expect(result.success).toBe(true)
    })
  })

  describe('full schema integration', () => {
    it('valid complete data passes .parse()', () => {
      const data = {
        name: 'My Provider',
        apiKey: 'sk-xxx',
        enabled: true,
        protocols: {
          openai: { enabled: true, baseUrl: 'https://api.openai.com/v1' },
          anthropic: { enabled: false, baseUrl: '' },
        },
      }
      const parsed = providerSchema.parse(data)
      expect(parsed.name).toBe('My Provider')
      expect(parsed.apiKey).toBe('sk-xxx')
      expect(parsed.enabled).toBe(true)
      expect(parsed.protocols.openai?.enabled).toBe(true)
      expect(parsed.protocols.anthropic?.enabled).toBe(false)
    })

    it('minimal valid data (name + one enabled protocol) passes', () => {
      const result = providerSchema.safeParse({
        name: 'My',
        enabled: true,
        protocols: { openai: { enabled: true } },
      })
      expect(result.success).toBe(true)
    })

    it('missing protocols key fails', () => {
      const result = providerSchema.safeParse({
        name: 'Test Provider',
        enabled: true,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.path.join('.'))
        expect(messages).toContain('protocols')
      }
    })
  })
})
