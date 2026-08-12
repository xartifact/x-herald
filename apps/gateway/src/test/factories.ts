import type { Provider } from '@xartifact/x-herald-db'
import type { VirtualKey } from '@xartifact/x-herald-db'
import type { ModelGroup, ModelInstance } from '@xartifact/x-herald-db'

export function createTestProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: crypto.randomUUID(),
    name: 'Test Provider',
    apiKey: 'sk-test-provider',
    protocols: {
      openai: {
        baseUrl: 'https://api.openai.com',
        enabled: true,
      },
    },
    enabled: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

export function createTestModelGroup(overrides: Partial<ModelGroup> = {}): ModelGroup {
  return {
    id: crypto.randomUUID(),
    name: 'gpt-4',
    aliases: [],
    displayName: 'GPT-4',
    description: null,
    category: 'chat',
    capabilities: {
      streaming: true,
      functionCalling: true,
      vision: false,
      jsonMode: true,
      maxTokens: 8192,
      contextWindow: 128000,
    },
    supportedProtocols: ['openai'],
    enabled: true,
    routingConfig: null,
    metadata: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

export function createTestModelInstance(overrides: Partial<ModelInstance> = {}): ModelInstance {
  return {
    id: crypto.randomUUID(),
    providerId: crypto.randomUUID(),
    name: 'OpenAI GPT-4',
    actualModelName: 'gpt-4-turbo',
    description: null,
    config: null,
    weight: 100,
    priority: 0,
    costPer1kTokens: null,
    healthCheckUrl: null,
    enabled: true,
    status: 'unknown',
    lastCheckedAt: null,
    metadata: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

export function createTestVirtualKey(overrides: Partial<VirtualKey> = {}): VirtualKey {
  return {
    id: crypto.randomUUID(),
    key: 'sk-test-' + crypto.randomUUID().slice(0, 8),
    name: 'Test Key',
    allowedModels: null,
    rateLimitRpm: null,
    rateLimitRpd: null,
    tokenLimitDaily: null,
    enabled: true,
    expiresAt: null,
    lastUsedAt: null,
    totalRequests: 0,
    totalTokens: BigInt(0),
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}
