import { describe, it, expect, mock, beforeEach, afterEach, afterAll } from 'bun:test';

const realDbClient = await import('../../db/client');

import { providers } from '@x-llm-gateway/db';
import { modelGroups, modelInstances, modelGroupMemberships, accessModels, modelRoutes } from '@x-llm-gateway/db';
import { virtualKeys } from '@x-llm-gateway/db';
import { gatewayConfigs } from '@x-llm-gateway/db';

// ─── Mock DB with mutable state ─────────────────────────────────────────────

let mockDb: ReturnType<typeof createMockDb>;

function createMockDb() {
  const selectResults = new Map<unknown, unknown[]>();

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
        returning: mock(() => Promise.resolve([{ id: 'new-id' }])),
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

const { exportConfig } = await import('./config-exporter');

// ─── Tests ───────────────────────────────────────────────────────────────────

afterAll(() => {
  mock.module('../../db/client', () => ({
    getDatabase: realDbClient.getDatabase,
    closeDatabase: realDbClient.closeDatabase,
    createDatabase: realDbClient.createDatabase,
    schema: realDbClient.schema,
  }));
});

describe('exportConfig', () => {
  afterEach(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockDb = createMockDb();
  });

  it('returns empty config for empty database', async () => {
    const result = await exportConfig();

    expect(result.version).toBe('1');
    expect(typeof result.exportedAt).toBe('string');
    expect(result.data.providers).toEqual([]);
    expect(result.data.modelGroups).toEqual([]);
    expect(result.data.modelInstances).toEqual([]);
    expect(result.data.virtualModels).toEqual([]);
    expect(result.data.modelRoutes).toEqual([]);
    expect(result.data.virtualKeys).toEqual([]);
    expect(result.data.gatewayConfigs).toEqual([]);
  });

  it('exports providers with correct shape', async () => {
    mockDb.selectResults.set(providers, [
      {
        id: 'provider-1',
        name: 'OpenAI',
        apiKey: 'sk-test-key',
        protocols: { openai: { baseUrl: 'https://api.openai.com', enabled: true } },
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await exportConfig();

    expect(result.data.providers).toHaveLength(1);
    expect(result.data.providers[0]).toEqual({
      name: 'OpenAI',
      apiKey: 'sk-test-key',
      protocols: { openai: { baseUrl: 'https://api.openai.com', enabled: true } },
      enabled: true,
    });
  });

  it('exports model groups with correct shape', async () => {
    mockDb.selectResults.set(modelGroups, [
      {
        id: 'group-1',
        name: 'gpt-4',
        aliases: ['gpt4'],
        displayName: 'GPT-4',
        description: 'GPT-4 model',
        category: 'chat',
        capabilities: { streaming: true },
        supportedProtocols: ['openai'],
        enabled: true,
        metadata: null,
        routingConfig: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await exportConfig();

    expect(result.data.modelGroups).toHaveLength(1);
    expect(result.data.modelGroups[0]).toEqual({
      name: 'gpt-4',
      aliases: ['gpt4'],
      displayName: 'GPT-4',
      description: 'GPT-4 model',
      category: 'chat',
      capabilities: { streaming: true },
      supportedProtocols: ['openai'],
      enabled: true,
      metadata: null,
    });
  });

  it('exports model instances with group names', async () => {
    const providerId = 'provider-1';
    const groupId = 'group-1';
    const instanceId = 'instance-1';

    mockDb.selectResults.set(providers, [
      {
        id: providerId,
        name: 'OpenAI',
        apiKey: null,
        protocols: {},
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    mockDb.selectResults.set(modelGroups, [
      {
        id: groupId,
        name: 'gpt-4',
        aliases: [],
        displayName: 'GPT-4',
        description: null,
        category: 'chat',
        capabilities: {},
        supportedProtocols: ['openai'],
        enabled: true,
        metadata: null,
        routingConfig: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    mockDb.selectResults.set(modelInstances, [
      {
        id: instanceId,
        providerId,
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

    mockDb.selectResults.set(modelGroupMemberships, [
      { groupId, instanceId, createdAt: new Date() },
    ]);

    const result = await exportConfig();

    expect(result.data.modelInstances).toHaveLength(1);
    expect(result.data.modelInstances[0]).toEqual({
      name: 'OpenAI GPT-4',
      actualModelName: 'gpt-4-turbo',
      description: null,
      providerName: 'OpenAI',
      groupNames: ['gpt-4'],
      groupName: 'gpt-4',
      config: null,
      weight: 100,
      priority: 0,
      costPer1kTokens: null,
      healthCheckUrl: null,
      enabled: true,
      metadata: null,
    });
  });

  it('exports virtual keys with correct shape', async () => {
    mockDb.selectResults.set(virtualKeys, [
      {
        id: 'key-1',
        name: 'Test Key',
        key: 'xg-test-key',
        allowedModels: null,
        rateLimitRpm: null,
        rateLimitRpd: null,
        tokenLimitDaily: null,
        enabled: true,
        expiresAt: null,
        lastUsedAt: null,
        totalRequests: 0,
        totalTokens: BigInt(0),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await exportConfig();

    expect(result.data.virtualKeys).toHaveLength(1);
    expect(result.data.virtualKeys[0]).toEqual({
      name: 'Test Key',
      key: 'xg-test-key',
      allowedModels: null,
      rateLimitRpm: null,
      rateLimitRpd: null,
      tokenLimitDaily: null,
      enabled: true,
      expiresAt: null,
    });
  });

  it('exports complete config with all resources', async () => {
    const providerId = 'provider-1';
    const groupId = 'group-1';
    const accessModelId = 'vm-1';
    const instanceId = 'instance-1';

    mockDb.selectResults.set(providers, [
      {
        id: providerId,
        name: 'OpenAI',
        apiKey: 'sk-secret',
        protocols: { openai: { baseUrl: 'https://api.openai.com', enabled: true } },
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    mockDb.selectResults.set(modelGroups, [
      {
        id: groupId,
        name: 'gpt-4',
        aliases: [],
        displayName: 'GPT-4',
        description: null,
        category: 'chat',
        capabilities: {},
        supportedProtocols: ['openai'],
        enabled: true,
        metadata: null,
        routingConfig: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    mockDb.selectResults.set(modelInstances, [
      {
        id: instanceId,
        providerId,
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

    mockDb.selectResults.set(modelGroupMemberships, [
      { groupId, instanceId, createdAt: new Date() },
    ]);

    mockDb.selectResults.set(accessModels, [
      {
        id: accessModelId,
        name: 'gpt-4',
        displayName: 'GPT-4',
        description: null,
        enabled: true,
        capabilities: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    mockDb.selectResults.set(modelRoutes, [
      {
        id: 'route-1',
        name: 'default',
        description: null,
        accessModelIds: [accessModelId],
        conditions: [],
        action: { type: 'route_to_group', targetId: groupId, reason: null },
        priority: 0,
        enabled: true,
        flowData: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    mockDb.selectResults.set(virtualKeys, [
      {
        id: 'key-1',
        name: 'Test Key',
        key: 'xg-test',
        allowedModels: null,
        rateLimitRpm: null,
        rateLimitRpd: null,
        tokenLimitDaily: null,
        enabled: true,
        expiresAt: null,
        lastUsedAt: null,
        totalRequests: 0,
        totalTokens: BigInt(0),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    mockDb.selectResults.set(gatewayConfigs, [
      {
        id: 'config-1',
        key: 'timeout',
        value: 30000,
        description: 'Request timeout',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await exportConfig();

    expect(result.data.providers).toHaveLength(1);
    expect(result.data.modelGroups).toHaveLength(1);
    expect(result.data.modelInstances).toHaveLength(1);
    expect(result.data.virtualModels).toHaveLength(1);
    expect(result.data.modelRoutes).toHaveLength(1);
    expect(result.data.virtualKeys).toHaveLength(1);
    expect(result.data.gatewayConfigs).toHaveLength(1);

    expect(result.data.providers[0].apiKey).toBe('sk-secret');
    expect(result.data.modelRoutes[0].action.targetRef).toBe('gpt-4');
  });
});
