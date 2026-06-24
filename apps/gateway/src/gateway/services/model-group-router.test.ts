import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Hono } from 'hono';
import { createTestEngine, destroyTestEngine, getAuthToken } from '../../test/setup';
import { authenticatedRequest } from '../../test/hono-helper';
import { modelGroupRouter } from './model-group-router';
import type { RoutingContext } from './router-selector';

let app: Hono;
let token: string;
let providerId: string;
let disabledProviderId: string;
let enabledGroupId: string;
let disabledGroupId: string;
let emptyGroupId: string;
let instance1Id: string;
let instance2Id: string;
let disabledInstanceId: string;
let disabledProviderInstanceId: string;

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

const defaultContext: RoutingContext = {
  requestedModel: 'gpt-4',
  streaming: false,
  hasTools: false,
  hasVision: false,
  virtualKeyId: crypto.randomUUID(),
};

describe('ModelGroupRouter integration', () => {
  beforeAll(async () => {
    const engine = await createTestEngine();
    app = engine.app;
    token = await getAuthToken(app);

    // 1. Create an enabled provider
    const providerRes = await authenticatedRequest(app, 'POST', '/api/providers', token, {
      body: {
        name: uniqueName('Provider'),
        protocols: { openai: { baseUrl: 'https://api.openai.com', enabled: true } },
        enabled: true,
      },
    });
    const providerData = (await providerRes.json()) as { data: { id: string } };
    providerId = providerData.data.id;

    // 2. Create a disabled provider
    const disabledProviderRes = await authenticatedRequest(app, 'POST', '/api/providers', token, {
      body: {
        name: uniqueName('DisabledProvider'),
        protocols: { openai: { baseUrl: 'https://api.openai.com', enabled: true } },
        enabled: false,
      },
    });
    const disabledProviderData = (await disabledProviderRes.json()) as { data: { id: string } };
    disabledProviderId = disabledProviderData.data.id;

    // 3. Create an enabled model group
    const groupRes = await authenticatedRequest(app, 'POST', '/api/model-groups', token, {
      body: {
        name: uniqueName('EnabledGroup'),
        displayName: 'Enabled Group',
        capabilities: defaultCapabilities,
      },
    });
    const groupData = (await groupRes.json()) as { data: { id: string } };
    enabledGroupId = groupData.data.id;

    // 4. Create a disabled model group
    const disabledGroupRes = await authenticatedRequest(app, 'POST', '/api/model-groups', token, {
      body: {
        name: uniqueName('DisabledGroup'),
        displayName: 'Disabled Group',
        capabilities: defaultCapabilities,
      },
    });
    const disabledGroupData = (await disabledGroupRes.json()) as { data: { id: string } };
    disabledGroupId = disabledGroupData.data.id;
    await authenticatedRequest(app, 'PATCH', `/api/model-groups/${disabledGroupId}/toggle`, token);

    // 5. Create an empty model group (no instances)
    const emptyGroupRes = await authenticatedRequest(app, 'POST', '/api/model-groups', token, {
      body: {
        name: uniqueName('EmptyGroup'),
        displayName: 'Empty Group',
        capabilities: defaultCapabilities,
      },
    });
    const emptyGroupData = (await emptyGroupRes.json()) as { data: { id: string } };
    emptyGroupId = emptyGroupData.data.id;

    // 6. Create instances for the enabled group
    // Instance 1: priority 0, enabled
    const inst1Res = await authenticatedRequest(app, 'POST', '/api/model-groups/instances', token, {
      body: {
        providerId,
        name: uniqueName('Inst-1'),
        actualModelName: 'gpt-4o',
        groupId: enabledGroupId,
        priority: 0,
      },
    });
    const inst1Data = (await inst1Res.json()) as { data: { id: string } };
    instance1Id = inst1Data.data.id;

    // Instance 2: priority 1, enabled
    const inst2Res = await authenticatedRequest(app, 'POST', '/api/model-groups/instances', token, {
      body: {
        providerId,
        name: uniqueName('Inst-2'),
        actualModelName: 'gpt-4-turbo',
        groupId: enabledGroupId,
        priority: 1,
      },
    });
    const inst2Data = (await inst2Res.json()) as { data: { id: string } };
    instance2Id = inst2Data.data.id;

    // Instance 3: enabled instance, but will be toggled to disabled
    const disabledInstRes = await authenticatedRequest(app, 'POST', '/api/model-groups/instances', token, {
      body: {
        providerId,
        name: uniqueName('Inst-Disabled'),
        actualModelName: 'gpt-4o-mini',
        groupId: enabledGroupId,
        priority: 2,
      },
    });
    const disabledInstData = (await disabledInstRes.json()) as { data: { id: string } };
    disabledInstanceId = disabledInstData.data.id;
    await authenticatedRequest(app, 'PATCH', `/api/model-groups/instances/${disabledInstanceId}/toggle`, token);

    // Instance 4: attached to disabled provider
    const disabledProviderInstRes = await authenticatedRequest(app, 'POST', '/api/model-groups/instances', token, {
      body: {
        providerId: disabledProviderId,
        name: uniqueName('Inst-DisabledProvider'),
        actualModelName: 'gpt-4o',
        groupId: enabledGroupId,
        priority: 3,
      },
    });
    const disabledProviderInstData = (await disabledProviderInstRes.json()) as { data: { id: string } };
    disabledProviderInstanceId = disabledProviderInstData.data.id;
  });

  afterAll(async () => {
    await destroyTestEngine();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // routeCandidatesByGroupId
  // ──────────────────────────────────────────────────────────────────────────

  it('returns empty array for non-existent groupId', async () => {
    const candidates = await modelGroupRouter.routeCandidatesByGroupId(
      '00000000-0000-0000-0000-000000000000',
      defaultContext
    );
    expect(candidates).toEqual([]);
  });

  it('returns empty array for disabled group', async () => {
    const candidates = await modelGroupRouter.routeCandidatesByGroupId(disabledGroupId, defaultContext);
    expect(candidates).toEqual([]);
  });

  it('returns empty array for group with no instances', async () => {
    const candidates = await modelGroupRouter.routeCandidatesByGroupId(emptyGroupId, defaultContext);
    expect(candidates).toEqual([]);
  });

  it('returns candidates with correct structure for enabled group with instances', async () => {
    const candidates = await modelGroupRouter.routeCandidatesByGroupId(enabledGroupId, defaultContext);

    expect(candidates.length).toBeGreaterThanOrEqual(2);

    // Each candidate should have the expected shape
    for (const candidate of candidates) {
      expect(candidate.instance).toBeDefined();
      expect(candidate.provider).toBeDefined();
      expect(candidate.group).toBeDefined();
      expect(candidate.decision).toBeDefined();
      expect(candidate.mapping).toBeDefined();
    }
  });

  it('includes strategy and reason in instance decision', async () => {
    const candidates = await modelGroupRouter.routeCandidatesByGroupId(enabledGroupId, defaultContext);
    expect(candidates.length).toBeGreaterThan(0);

    // First candidate should have a primary selection reason
    expect(candidates[0].decision.strategy).toBe('priority');
    expect(candidates[0].decision.reason).toContain('priority');
    expect(candidates[0].decision.candidates).toBeGreaterThanOrEqual(2);

    // Second candidate should be a failover candidate
    if (candidates.length > 1) {
      expect(candidates[1].decision.reason).toContain('failover');
    }
  });

  it('includes mapping with modelName, isMapped, and originalModel', async () => {
    const candidates = await modelGroupRouter.routeCandidatesByGroupId(enabledGroupId, defaultContext);
    expect(candidates.length).toBeGreaterThan(0);

    for (const candidate of candidates) {
      expect(candidate.mapping.modelName).toBeDefined();
      expect(candidate.mapping.isMapped).toBe(true);
      expect(candidate.mapping.originalModel).toBe(defaultContext.requestedModel);
      expect(candidate.mapping.mappingType).toBe('virtual');
    }
  });

  it('sorts candidates by priority strategy (default)', async () => {
    const candidates = await modelGroupRouter.routeCandidatesByGroupId(enabledGroupId, defaultContext);
    expect(candidates.length).toBeGreaterThanOrEqual(2);

    // Lower priority value should come first
    const priority1 = candidates[0].instance.priority;
    const priority2 = candidates[1].instance.priority;
    expect(priority1).toBeLessThanOrEqual(priority2);
  });

  it('excludes instances with enabled: false', async () => {
    const candidates = await modelGroupRouter.routeCandidatesByGroupId(enabledGroupId, defaultContext);

    const disabledInstanceIds = candidates
      .filter((c) => c.instance.id === disabledInstanceId)
      .map((c) => c.instance.id);

    expect(disabledInstanceIds).toEqual([]);
  });

  it('excludes instances whose provider has enabled: false', async () => {
    const candidates = await modelGroupRouter.routeCandidatesByGroupId(enabledGroupId, defaultContext);

    const disabledProviderInstanceIds = candidates
      .filter((c) => c.instance.id === disabledProviderInstanceId)
      .map((c) => c.instance.id);

    expect(disabledProviderInstanceIds).toEqual([]);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // routeByGroupId
  // ──────────────────────────────────────────────────────────────────────────

  it('routeByGroupId returns first candidate', async () => {
    const result = await modelGroupRouter.routeByGroupId(enabledGroupId, defaultContext);
    expect(result).not.toBeNull();

    const candidates = await modelGroupRouter.routeCandidatesByGroupId(enabledGroupId, defaultContext);
    expect(result).toEqual(candidates[0]);
  });

  it('routeByGroupId returns null for non-existent group', async () => {
    const result = await modelGroupRouter.routeByGroupId(
      '00000000-0000-0000-0000-000000000000',
      defaultContext
    );
    expect(result).toBeNull();
  });

  it('routeByGroupId returns null for group with no instances', async () => {
    const result = await modelGroupRouter.routeByGroupId(emptyGroupId, defaultContext);
    expect(result).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // listModelGroups
  // ──────────────────────────────────────────────────────────────────────────

  it('listModelGroups returns only enabled groups', async () => {
    const groups = await modelGroupRouter.listModelGroups();
    const groupIds = groups.map((g) => g.id);

    expect(groupIds).toContain(enabledGroupId);
    expect(groupIds).toContain(emptyGroupId);
    expect(groupIds).not.toContain(disabledGroupId);
  });

  it('listModelGroups excludes disabled groups', async () => {
    const groups = await modelGroupRouter.listModelGroups();
    const disabledGroup = groups.find((g) => g.id === disabledGroupId);

    expect(disabledGroup).toBeUndefined();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getModelGroupDetail
  // ──────────────────────────────────────────────────────────────────────────

  it('getModelGroupDetail returns group and instances for valid groupId', async () => {
    const detail = await modelGroupRouter.getModelGroupDetail(enabledGroupId);
    expect(detail).not.toBeNull();
    expect(detail?.group.id).toBe(enabledGroupId);
    expect(detail?.instances).toBeDefined();
    expect(detail?.instances.length).toBeGreaterThanOrEqual(2);
  });

  it('getModelGroupDetail returns null for non-existent groupId', async () => {
    const detail = await modelGroupRouter.getModelGroupDetail('00000000-0000-0000-0000-000000000000');
    expect(detail).toBeNull();
  });

  it('getModelGroupDetail includes both enabled and disabled instances', async () => {
    const detail = await modelGroupRouter.getModelGroupDetail(enabledGroupId);
    expect(detail).not.toBeNull();

    const instanceIds = detail?.instances.map((i) => i.instance.id) ?? [];

    // Should include enabled instances
    expect(instanceIds).toContain(instance1Id);
    expect(instanceIds).toContain(instance2Id);

    // Should also include disabled instance (getModelGroupDetail does not filter on enabled)
    expect(instanceIds).toContain(disabledInstanceId);

    // Should include instance from disabled provider too (getModelGroupDetail does not filter on provider.enabled)
    expect(instanceIds).toContain(disabledProviderInstanceId);
  });
});
