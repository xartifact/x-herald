import { getDatabase } from '../db/client';
import { providers, modelGroups, modelInstances, modelGroupMemberships, virtualKeys } from '../db';
import type { Provider } from '@xartifact/x-llm-gateway-db';
import type { ModelGroup, ModelInstance } from '@xartifact/x-llm-gateway-db';
import type { VirtualKey } from '@xartifact/x-llm-gateway-db';

export interface ScenarioContext {
  provider: Provider;
  group: ModelGroup;
  instances: ModelInstance[];
}

export interface MultiProviderScenarioContext {
  providers: Provider[];
  groups: ModelGroup[];
  instances: ModelInstance[];
  sharedGroup: ModelGroup;
}

function uniqueName(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

const defaultCapabilities = {
  streaming: true,
  functionCalling: true,
  vision: false,
  jsonMode: true,
  maxTokens: 8192,
  contextWindow: 128000,
};

const defaultProtocols = {
  openai: {
    baseUrl: 'https://api.openai.com',
    enabled: true,
  },
};

export async function buildBasicScenario(db = getDatabase()): Promise<ScenarioContext> {
  const [provider] = await db.insert(providers).values({
    name: uniqueName('Provider'),
    protocols: defaultProtocols,
    enabled: true,
  }).returning();

  const [group] = await db.insert(modelGroups).values({
    name: uniqueName('group'),
    displayName: 'Test Group',
    capabilities: defaultCapabilities,
    enabled: true,
  }).returning();

  const [instance1] = await db.insert(modelInstances).values({
    providerId: provider.id,
    name: uniqueName('Instance-1'),
    actualModelName: 'gpt-4-turbo',
    weight: 100,
    priority: 0,
    enabled: true,
  }).returning();

  const [instance2] = await db.insert(modelInstances).values({
    providerId: provider.id,
    name: uniqueName('Instance-2'),
    actualModelName: 'gpt-4o',
    weight: 100,
    priority: 1,
    enabled: true,
  }).returning();

  await db.insert(modelGroupMemberships).values([
    { groupId: group.id, instanceId: instance1.id },
    { groupId: group.id, instanceId: instance2.id },
  ]);

  return {
    provider,
    group,
    instances: [instance1, instance2],
  };
}

export async function buildMultiProviderScenario(
  db = getDatabase(),
  providerCount = 2
): Promise<MultiProviderScenarioContext> {
  const createdProviders: Provider[] = [];
  const createdGroups: ModelGroup[] = [];
  const createdInstances: ModelInstance[] = [];

  const [sharedGroup] = await db.insert(modelGroups).values({
    name: uniqueName('shared-group'),
    displayName: 'Shared Failover Group',
    capabilities: defaultCapabilities,
    enabled: true,
  }).returning();

  for (let i = 0; i < providerCount; i++) {
    const [provider] = await db.insert(providers).values({
      name: uniqueName(`Provider-${i}`),
      protocols: defaultProtocols,
      enabled: true,
    }).returning();
    createdProviders.push(provider);

    const [group] = await db.insert(modelGroups).values({
      name: uniqueName(`group-${i}`),
      displayName: `Test Group ${i}`,
      capabilities: defaultCapabilities,
      enabled: true,
    }).returning();
    createdGroups.push(group);

    const [instance] = await db.insert(modelInstances).values({
      providerId: provider.id,
      name: uniqueName(`Instance-${i}`),
      actualModelName: 'gpt-4-turbo',
      weight: 100,
      priority: 0,
      enabled: true,
    }).returning();
    createdInstances.push(instance);

    await db.insert(modelGroupMemberships).values([
      { groupId: group.id, instanceId: instance.id },
      { groupId: sharedGroup.id, instanceId: instance.id },
    ]);
  }

  return {
    providers: createdProviders,
    groups: createdGroups,
    instances: createdInstances,
    sharedGroup,
  };
}

export async function seedVirtualKey(
  db = getDatabase(),
  overrides: Partial<VirtualKey> = {}
): Promise<VirtualKey> {
  const [key] = await db.insert(virtualKeys).values({
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
    totalTokens: 0n,
    ...overrides,
  }).returning();

  return key;
}
