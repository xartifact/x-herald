import { describe, it, expect, mock, beforeEach, afterEach, afterAll } from 'bun:test';

const realDbClient = await import('../../db/client');

import { providers } from '@xartifact/x-llm-gateway-db';
import { modelGroups, modelInstances, modelGroupMemberships, accessModels, modelRoutes } from '@xartifact/x-llm-gateway-db';
import { virtualKeys } from '@xartifact/x-llm-gateway-db';
import { gatewayConfigs } from '@xartifact/x-llm-gateway-db';

// ─── Mock DB with mutable state ─────────────────────────────────────────────

let mockDb: ReturnType<typeof createMockDb>;

function createMockDb() {
  const selectResults = new Map<unknown, unknown[]>();
  let insertId = 0;

  function makeQuery(result: unknown) {
    const query = {
      where: () => query,
      limit: () => query,
      returning: () => Promise.resolve(result),
      then: (onResolve: unknown, onReject: unknown) =>
        Promise.resolve(result).then(onResolve as never, onReject as never),
    };
    return query;
  }

  return {
    selectResults,
    select: mock(() => ({
      from: mock((table) => makeQuery(selectResults.get(table) ?? [])),
    })),
    insert: mock(() => ({
      values: mock(() => ({
        returning: mock(() => Promise.resolve([{ id: `new-id-${++insertId}` }])),
      })),
    })),
    update: mock(() => ({
      set: mock(() => ({
        where: mock(() => Promise.resolve()),
      })),
    })),
    delete: mock(() => ({
      where: mock(() => Promise.resolve()),
    })),
  };
}

mock.module('../../db/client', () => ({
  getDatabase: () => {
    const g = globalThis as unknown as { __xllm_dbClient?: unknown };
    if (g.__xllm_dbClient) {
      return g.__xllm_dbClient;
    }
    return mockDb;
  },
  createDatabase: mock(async () => mockDb),
  closeDatabase: mock(async () => {}),
  schema: {},
}));

// ─── Import module under test ────────────────────────────────────────────────

const { importConfig } = await import('./config-importer');

// ─── Tests ───────────────────────────────────────────────────────────────────

afterAll(() => {
  mock.module('../../db/client', () => ({
    getDatabase: realDbClient.getDatabase,
    closeDatabase: realDbClient.closeDatabase,
    createDatabase: realDbClient.createDatabase,
    schema: realDbClient.schema,
  }));
});

describe('importConfig', () => {
  afterEach(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockDb = createMockDb();
  });

  it('returns empty summary for empty config', async () => {
    const result = await importConfig({
      providers: [],
      modelGroups: [],
      modelInstances: [],
      virtualModels: [],
      modelRoutes: [],
      virtualKeys: [],
      gatewayConfigs: [],
    });

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.summary.providers).toEqual({ created: 0, updated: 0, errors: 0 });
    expect(result.summary.modelGroups).toEqual({ created: 0, updated: 0, errors: 0 });
    expect(result.summary.modelInstances).toEqual({ created: 0, updated: 0, errors: 0 });
    expect(result.summary.accessModels).toEqual({ created: 0, updated: 0, errors: 0 });
    expect(result.summary.virtualModels).toEqual({ created: 0, updated: 0, errors: 0 });
    expect(result.summary.modelRoutes).toEqual({ created: 0, updated: 0, errors: 0 });
    expect(result.summary.virtualKeys).toEqual({ created: 0, updated: 0, errors: 0 });
    expect(result.summary.gatewayConfigs).toEqual({ created: 0, updated: 0, errors: 0 });
  });

  it('creates a new provider', async () => {
    const result = await importConfig({
      providers: [
        {
          name: 'OpenAI',
          apiKey: 'sk-test',
          protocols: { openai: { baseUrl: 'https://api.openai.com', enabled: true } },
          enabled: true,
        },
      ],
      modelGroups: [],
      modelInstances: [],
      virtualModels: [],
      modelRoutes: [],
      virtualKeys: [],
      gatewayConfigs: [],
    });

    expect(result.success).toBe(true);
    expect(result.summary.providers.created).toBe(1);
    expect(result.summary.providers.updated).toBe(0);
    expect(result.summary.providers.errors).toBe(0);
  });

  it('updates an existing provider', async () => {
    mockDb.selectResults.set(providers, [{ id: 'existing-id' }]);

    const result = await importConfig({
      providers: [
        {
          name: 'OpenAI',
          apiKey: 'sk-updated',
          protocols: { openai: { baseUrl: 'https://api.openai.com', enabled: true } },
          enabled: true,
        },
      ],
      modelGroups: [],
      modelInstances: [],
      virtualModels: [],
      modelRoutes: [],
      virtualKeys: [],
      gatewayConfigs: [],
    });

    expect(result.success).toBe(true);
    expect(result.summary.providers.created).toBe(0);
    expect(result.summary.providers.updated).toBe(1);
    expect(result.summary.providers.errors).toBe(0);
  });

  it('creates multiple resource types', async () => {
    const result = await importConfig({
      providers: [
        {
          name: 'OpenAI',
          apiKey: 'sk-test',
          protocols: { openai: { baseUrl: 'https://api.openai.com', enabled: true } },
          enabled: true,
        },
      ],
      modelGroups: [
        {
          name: 'gpt-4',
          aliases: [],
          displayName: 'GPT-4',
          description: null,
          category: 'chat',
          capabilities: {},
          supportedProtocols: ['openai'],
          enabled: true,
          metadata: null,
        },
      ],
      modelInstances: [],
      virtualModels: [
        {
          name: 'gpt-4',
          displayName: 'GPT-4',
          description: null,
          enabled: true,
        },
      ],
      modelRoutes: [],
      virtualKeys: [
        {
          name: 'Test Key',
          key: 'xg-test',
          allowedModels: null,
          rateLimitRpm: null,
          rateLimitRpd: null,
          tokenLimitDaily: null,
          enabled: true,
          expiresAt: null,
        },
      ],
      gatewayConfigs: [
        {
          key: 'timeout',
          value: 30000,
          description: 'Request timeout',
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.summary.providers.created).toBe(1);
    expect(result.summary.modelGroups.created).toBe(1);
    expect(result.summary.accessModels.created).toBe(1);
    expect(result.summary.virtualModels.created).toBe(1);
    expect(result.summary.virtualKeys.created).toBe(1);
    expect(result.summary.gatewayConfigs.created).toBe(1);
  });

  it('handles DB errors gracefully', async () => {
    mockDb.select.mockImplementation(() => ({
      from: mock(() => ({
        where: mock(() => ({
          limit: mock(() => Promise.reject(new Error('DB failure'))),
        })),
      })),
    }));

    const result = await importConfig({
      providers: [
        {
          name: 'OpenAI',
          apiKey: 'sk-test',
          protocols: {},
          enabled: true,
        },
      ],
      modelGroups: [],
      modelInstances: [],
      virtualModels: [],
      modelRoutes: [],
      virtualKeys: [],
      gatewayConfigs: [],
    });

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.summary.providers.errors).toBe(1);
  });

  it('returns error for model instance with missing provider', async () => {
    const result = await importConfig({
      providers: [],
      modelGroups: [],
      modelInstances: [
        {
          name: 'OpenAI GPT-4',
          actualModelName: 'gpt-4-turbo',
          description: null,
          providerName: 'NonExistent',
          groupNames: [],
          groupName: null,
          config: null,
          weight: 100,
          priority: 0,
          costPer1kTokens: null,
          healthCheckUrl: null,
          enabled: true,
          metadata: null,
        },
      ],
      virtualModels: [],
      modelRoutes: [],
      virtualKeys: [],
      gatewayConfigs: [],
    });

    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.includes('provider "NonExistent" not found after import'))
    ).toBe(true);
    expect(result.summary.modelInstances.errors).toBe(1);
  });

  it('updates model instance with existing group', async () => {
    const instanceId = 'instance-1';
    const groupId = 'group-1';

    mockDb.selectResults.set(modelGroups, [{ id: groupId }]);
    mockDb.selectResults.set(modelInstances, [
      {
        id: instanceId,
        providerId: 'new-id-1',
        name: 'OpenAI GPT-4',
        actualModelName: 'gpt-4-turbo',
        description: null,
        config: null,
        weight: 100,
        priority: 0,
        costPer1kTokens: null,
        healthCheckUrl: null,
        enabled: true,
        metadata: null,
        status: 'unknown',
        lastCheckedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await importConfig({
      providers: [
        {
          name: 'OpenAI',
          apiKey: 'sk-test',
          protocols: {},
          enabled: true,
        },
      ],
      modelGroups: [],
      modelInstances: [
        {
          name: 'OpenAI GPT-4',
          actualModelName: 'gpt-4-turbo',
          description: null,
          providerName: 'OpenAI',
          groupNames: ['gpt-4'],
          groupName: null,
          config: null,
          weight: 100,
          priority: 0,
          costPer1kTokens: null,
          healthCheckUrl: null,
          enabled: true,
          metadata: null,
        },
      ],
      virtualModels: [],
      modelRoutes: [],
      virtualKeys: [],
      gatewayConfigs: [],
    });

    expect(result.success).toBe(true);
    expect(result.summary.providers.created).toBe(1);
    expect(result.summary.modelInstances.updated).toBe(1);
    expect(result.summary.modelInstances.created).toBe(0);
  });
});
