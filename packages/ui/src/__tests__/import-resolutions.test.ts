import { describe, test, expect } from 'bun:test'
import { cn } from '../lib/utils'
import type { ModelGroup, ModelInstance, ProtocolsConfig } from '@x-llm-gateway/engine'
import type { VirtualKey } from '@x-llm-gateway/shared'

describe('import resolutions', () => {
  describe('relative path import — cn from lib/utils', () => {
    test('merges tailwind classes without duplication', () => {
      const result = cn('px-2 py-1', 'px-4')
      expect(result).toBe('py-1 px-4')
    })

    test('handles conditional classes with falsy values', () => {
      const result = cn('base', false && 'hidden', null, undefined, 'active')
      expect(result).toBe('base active')
    })

    test('returns empty string for no arguments', () => {
      expect(cn()).toBe('')
    })
  })

  describe('@x-llm-gateway/engine type imports', () => {
    test('ModelGroup type is resolvable and assignable', () => {
      const group: ModelGroup = {
        id: 'grp-001',
        name: 'test-group',
        aliases: [],
        displayName: 'Test Group',
        description: null,
        category: 'general',
        capabilities: {
          streaming: true,
          functionCalling: true,
          vision: true,
          jsonMode: true,
          maxTokens: 4096,
          contextWindow: 8192,
        },
        supportedProtocols: ['openai'],
        routingConfig: {
          strategy: 'round_robin',
          fallbackEnabled: true,
        },
        metadata: null,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      expect(group.id).toBe('grp-001')
      expect(group.name).toBe('test-group')
      expect(group.category).toBe('general')
    })

    test('ModelInstance type is resolvable and assignable', () => {
      const instance: ModelInstance = {
        id: 'inst-001',
        providerId: 'prov-001',
        name: 'gpt-4-test',
        actualModelName: 'gpt-4o',
        description: null,
        weight: 100,
        priority: 1,
        costPer1kTokens: null,
        config: null,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        status: null,
        metadata: null,
        healthCheckUrl: null,
        lastCheckedAt: null,
      }
      expect(instance.providerId).toBe('prov-001')
      expect(instance.actualModelName).toBe('gpt-4o')
    })

    test('ProtocolsConfig type is resolvable and assignable', () => {
      const protocols: ProtocolsConfig = {
        openai: { baseUrl: 'https://api.openai.com/v1', enabled: true },
        anthropic: { baseUrl: 'https://api.anthropic.com', enabled: false },
      }
      expect(protocols.openai?.enabled).toBe(true)
      expect(protocols.anthropic?.enabled).toBe(false)
      expect(protocols.gemini).toBeUndefined()
    })
  })

  describe('@x-llm-gateway/shared type imports', () => {
    test('VirtualKey type is resolvable and assignable', () => {
      const key: VirtualKey = {
        id: 'vk-001',
        key: 'sk-test-xxx',
        name: 'test-key',
        allowedModels: ['gpt-4o'],
        rateLimitRpm: 60,
        rateLimitRpd: 1000,
        tokenLimitDaily: null,
        enabled: true,
        expiresAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      expect(key.id).toBe('vk-001')
      expect(key.name).toBe('test-key')
      expect(key.allowedModels).toEqual(['gpt-4o'])
    })
  })
})
