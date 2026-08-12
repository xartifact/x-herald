import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { setupCrudTest, teardownCrudTest, type CrudTestContext } from '../../test/crud-helper'
import { accessModelRouter } from './access-model-router'
import type { RoutingContext } from './router-selector'
import { getDatabase } from '../../db/client'
import { eq } from '@xartifact/x-herald-db'
import type { StandardRequest, RouteAction } from '@xartifact/x-herald-shared'
import {
  modelGroups,
  modelInstances,
  modelGroupMemberships,
  accessModels,
  providers,
  virtualKeys,
  intentLogs,
  type AccessModel,
  type ModelGroup,
  type ModelInstance,
  type Provider,
} from '@xartifact/x-herald-db'
import { seedCanvasRoute, resetCanvasStateForTests } from '../../test/canvas-route-helper'
import { saveDraft, activateVersion } from '../../features/route-rules/service'
import { getRouteRuleEngine } from './route-rule-engine'
import { NoAvailableInstanceError, RequestRejectedError } from './router-selector'

let ctx: CrudTestContext
const createdIds = {
  providers: [] as string[],
  groups: [] as string[],
  instances: [] as string[],
  accessModels: [] as string[],
}

async function createProviderWithModel(
  actualModelName: string,
  groupId: string,
): Promise<{ instance: ModelInstance; provider: Provider }> {
  const db = getDatabase()
  const providerId = crypto.randomUUID()
  await db.insert(providers).values({
    id: providerId,
    name: `test-prov-${crypto.randomUUID().slice(0, 4)}`,
    apiKey: 'sk-test',
    protocols: { openai: { baseUrl: 'https://api.test', enabled: true } },
    enabled: true,
  } satisfies typeof providers.$inferInsert)
  createdIds.providers.push(providerId)

  const instanceId = crypto.randomUUID()
  await db.insert(modelInstances).values({
    id: instanceId,
    providerId,
    name: `test-inst-${crypto.randomUUID().slice(0, 4)}`,
    actualModelName,
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
  } satisfies typeof modelInstances.$inferInsert)
  createdIds.instances.push(instanceId)

  await db.insert(modelGroupMemberships).values({
    groupId,
    instanceId,
    createdAt: new Date(),
  } satisfies typeof modelGroupMemberships.$inferInsert)

  const instResult = await db
    .select()
    .from(modelInstances)
    .where(eq(modelInstances.id, instanceId))
    .limit(1)
  const provResult = await db.select().from(providers).where(eq(providers.id, providerId)).limit(1)
  return { instance: instResult[0], provider: provResult[0] }
}

beforeAll(async () => {
  ctx = await setupCrudTest()
})

afterAll(async () => {
  await teardownCrudTest()
})

beforeEach(async () => {
  const db = getDatabase()
  await db.delete(modelGroupMemberships)
  await db.delete(modelInstances)
  await db.delete(modelGroups)
  await db.delete(accessModels)
  await db.delete(providers).where(eq(providers.name, 'test-provider'))
  await resetCanvasStateForTests()
  createdIds.providers = []
  createdIds.groups = []
  createdIds.instances = []
  createdIds.accessModels = []
})

describe('AccessModelRouter - intent action', () => {
  it('routes to the group matching the request model name', async () => {
    const db = getDatabase()
    const amId = crypto.randomUUID()
    await db.insert(accessModels).values({
      id: amId,
      name: 'intent-am',
      displayName: 'Intent AM',
      description: null,
      enabled: true,
      capabilities: {},
      metadata: null,
    } satisfies typeof accessModels.$inferInsert)
    createdIds.accessModels.push(amId)

    const codingGroupId = crypto.randomUUID()
    await db.insert(modelGroups).values({
      id: codingGroupId,
      name: 'coding-group',
      aliases: [],
      displayName: 'Coding',
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
    } satisfies typeof modelGroups.$inferInsert)
    createdIds.groups.push(codingGroupId)
    await createProviderWithModel('gpt-4-coding', codingGroupId)

    await seedCanvasRoute({
      amId,
      amName: 'intent-coding',
      action: {
        type: 'intent',
        intentConfig: { targetGroupIds: { coding: codingGroupId }, defaultGroupId: codingGroupId },
      } as RouteAction,
    })

    const candidates = await accessModelRouter.routeCandidates({
      requestedModel: 'intent-am',
      streaming: false,
      hasTools: false,
      hasVision: false,
      virtualKeyId:
        (await getDatabase().select().from(virtualKeys).limit(1))[0]?.id ?? 'test-key-id',
      request: {
        model: 'gpt-4-coding',
        messages: [{ role: 'user', content: 'code' }],
        stream: false,
      },
    } as RoutingContext)

    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates[0].group.id).toBe(codingGroupId)
  })

  it('still persists an intent_logs record when the canvas rule id is not a UUID (e.g. "new-<uuid>")', async () => {
    // 回归用例：canvas 编辑器里新建的规则叶子 id 形如 `intent-new-<uuid>`，
    // toLegacyRule() 剥前缀后剩 `new-<uuid>`，不是合法 uuid。intent_logs.model_route_id
    // 是 uuid 列，若原样传入会让整条 INSERT 报 invalid input syntax，
    // recordIntentDecision 静默失败（fire-and-forget，异常只会 warn 不会抛）。
    const db = getDatabase()
    const amId = crypto.randomUUID()
    await db.insert(accessModels).values({
      id: amId,
      name: 'intent-am-nonuuid-rule',
      displayName: 'Intent AM',
      description: null,
      enabled: true,
      capabilities: {},
      metadata: null,
    } satisfies typeof accessModels.$inferInsert)
    createdIds.accessModels.push(amId)

    const codingGroupId = crypto.randomUUID()
    await db.insert(modelGroups).values({
      id: codingGroupId,
      name: 'coding-group-nonuuid-rule',
      aliases: [],
      displayName: 'Coding',
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
    } satisfies typeof modelGroups.$inferInsert)
    createdIds.groups.push(codingGroupId)
    await createProviderWithModel('gpt-4-coding-nonuuid-rule', codingGroupId)

    const [virtualKey] = await db
      .insert(virtualKeys)
      .values({
        key: `xg_test_${crypto.randomUUID().slice(0, 12)}`,
        name: 'nonuuid-rule-test-key',
        enabled: true,
      } satisfies typeof virtualKeys.$inferInsert)
      .returning()

    // 手工搭图，模拟真实 canvas UI 产出的节点 id（"new-" 前缀，非纯 uuid），
    // 而不是走 seedCanvasRoute()（它生成的叶子 id 恰好是纯 uuid，测不出这个 bug）。
    const intentLeafId = `intent-new-${crypto.randomUUID()}`
    const targetLeafId = `target-new-${crypto.randomUUID()}`
    const draft = await saveDraft(
      amId,
      {
        nodes: [
          {
            id: `vm-${amId}`,
            type: 'modelTrigger',
            position: { x: 0, y: 0 },
            data: {
              vmId: amId,
              label: 'intent-am-nonuuid-rule',
              modelName: 'intent-am-nonuuid-rule',
            },
          },
          {
            id: intentLeafId,
            type: 'intent',
            position: { x: 200, y: 0 },
            data: { intentConfig: { categories: ['coding'] } },
          },
          {
            id: targetLeafId,
            type: 'target',
            position: { x: 400, y: 0 },
            data: { actionType: 'route_to_group', targetId: codingGroupId },
          },
        ],
        edges: [
          { id: 'e1', source: `vm-${amId}`, target: intentLeafId },
          { id: 'e2', source: intentLeafId, sourceHandle: 'handle-coding', target: targetLeafId },
        ],
      },
      { name: 'test-route' },
    )
    await activateVersion(draft.id)
    getRouteRuleEngine().rebuild()

    const candidates = await accessModelRouter.routeCandidates({
      requestedModel: 'intent-am-nonuuid-rule',
      streaming: false,
      hasTools: false,
      hasVision: false,
      virtualKeyId: virtualKey.id,
      request: {
        model: 'gpt-4-coding-nonuuid-rule',
        messages: [{ role: 'user', content: 'code' }],
        stream: false,
      },
    } as RoutingContext)

    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates[0].group.id).toBe(codingGroupId)

    // recordIntentDecision 是 fire-and-forget，轮询等待写入落地
    const startedAt = Date.now()
    let row: { id: string; modelRouteId: string | null } | undefined
    while (Date.now() - startedAt < 3000) {
      const rows = await db
        .select({ id: intentLogs.id, modelRouteId: intentLogs.modelRouteId })
        .from(intentLogs)
        .where(eq(intentLogs.virtualKeyId, virtualKey.id))
      row = rows[0]
      if (row) break
      await new Promise((r) => setTimeout(r, 100))
    }
    expect(row).toBeDefined()
    expect(row?.modelRouteId).toBeNull()
  })
})

describe('AccessModelRouter - capability action', () => {
  it('routes vision requests to the vision-capable group', async () => {
    const db = getDatabase()
    const amId = crypto.randomUUID()
    await db.insert(accessModels).values({
      id: amId,
      name: 'cap-am',
      displayName: 'Cap AM',
      description: null,
      enabled: true,
      capabilities: {},
      metadata: null,
    } satisfies typeof accessModels.$inferInsert)
    createdIds.accessModels.push(amId)

    const visionGroupId = crypto.randomUUID()
    await db.insert(modelGroups).values({
      id: visionGroupId,
      name: 'vision-group',
      aliases: [],
      displayName: 'Vision',
      description: null,
      category: 'vision',
      capabilities: {
        streaming: false,
        functionCalling: false,
        vision: true,
        jsonMode: false,
        maxTokens: 4096,
        contextWindow: 32000,
      },
      supportedProtocols: ['openai'],
      enabled: true,
      routingConfig: null,
      metadata: null,
    } satisfies typeof modelGroups.$inferInsert)
    createdIds.groups.push(visionGroupId)
    await createProviderWithModel('gpt-4-vision', visionGroupId)

    await seedCanvasRoute({
      amId,
      amName: 'capability-vision',
      action: {
        type: 'capability',
        capabilityConfig: {
          capabilityMap: { vision: visionGroupId },
          defaultGroupId: visionGroupId,
        },
      } as RouteAction,
    })

    const candidates = await accessModelRouter.routeCandidates({
      requestedModel: 'cap-am',
      streaming: false,
      hasTools: false,
      hasVision: true,
      virtualKeyId:
        (await getDatabase().select().from(virtualKeys).limit(1))[0]?.id ?? 'test-key-id',
      request: {
        model: 'gpt-4-vision',
        messages: [
          {
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: 'https://x.com/img.png' } }],
          },
        ],
        stream: false,
      } as StandardRequest,
    })

    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates[0].group.id).toBe(visionGroupId)
  })
})

describe('AccessModelRouter - failure paths carry a routeChain (routing-traces coverage)', () => {
  // 回归用例：路由追踪之前只在成功产出候选时才留痕迹——reject / 无可用实例
  // 这类"零候选"的请求，metadata.routing.routeChain 从来没被写过，
  // routing-traces 页面完全看不到这些请求链路。现在 access-model-router 在
  // 抛出这些错误前会附一份 routeChain 快照，覆盖到全部请求链路而不只是成功的。

  it('reject action throws RequestRejectedError carrying a rejected routeChain with the matched rule', async () => {
    const amId = crypto.randomUUID()
    const db = getDatabase()
    await db.insert(accessModels).values({
      id: amId,
      name: 'reject-am',
      displayName: 'Reject AM',
      description: null,
      enabled: true,
      capabilities: {},
      metadata: null,
    } satisfies typeof accessModels.$inferInsert)
    createdIds.accessModels.push(amId)

    const draft = await saveDraft(
      amId,
      {
        nodes: [
          {
            id: `vm-${amId}`,
            type: 'modelTrigger',
            position: { x: 0, y: 0 },
            data: { vmId: amId, label: 'reject-am', modelName: 'reject-am' },
          },
          {
            id: 'cond-1',
            type: 'condition',
            position: { x: 0, y: 0 },
            data: { field: 'context.streaming', operator: 'eq', value: 'false' },
          },
          {
            id: 'reject-1',
            type: 'reject',
            position: { x: 0, y: 0 },
            data: { reason: 'blocked for testing' },
          },
        ],
        edges: [
          { id: 'e1', source: `vm-${amId}`, target: 'cond-1' },
          { id: 'e2', source: 'cond-1', sourceHandle: 'true', target: 'reject-1' },
        ],
      },
      { name: 'test-route' },
    )
    await activateVersion(draft.id)
    getRouteRuleEngine().rebuild()

    let caught: unknown
    try {
      await accessModelRouter.routeCandidates({
        requestedModel: 'reject-am',
        streaming: false,
        hasTools: false,
        hasVision: false,
        virtualKeyId: 'test-key-id',
      } as RoutingContext)
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(RequestRejectedError)
    const rejected = caught as RequestRejectedError
    expect(rejected.message).toBe('blocked for testing')
    expect(rejected.routeChain?.outcome).toBe('rejected')
    expect(rejected.routeChain?.matchedRule?.conditions).toEqual([
      { field: 'context.streaming', operator: 'eq', value: 'false' },
    ])
    expect(rejected.routeChain?.chain[0]?.actionType).toBe('reject')
  })

  it('route_to_group with zero candidates throws NoAvailableInstanceError carrying an all_failed routeChain', async () => {
    const amId = crypto.randomUUID()
    const emptyGroupId = crypto.randomUUID()
    const db = getDatabase()
    await db.insert(accessModels).values({
      id: amId,
      name: 'empty-group-am',
      displayName: 'Empty Group AM',
      description: null,
      enabled: true,
      capabilities: {},
      metadata: null,
    } satisfies typeof accessModels.$inferInsert)
    createdIds.accessModels.push(amId)

    // 目标组存在但没有任何实例——route_to_group 会解析出 0 候选
    await db.insert(modelGroups).values({
      id: emptyGroupId,
      name: 'empty-group',
      aliases: [],
      displayName: 'Empty Group',
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
    } satisfies typeof modelGroups.$inferInsert)
    createdIds.groups.push(emptyGroupId)

    await seedCanvasRoute({
      amId,
      amName: 'empty-group-am',
      action: { type: 'route_to_group', targetId: emptyGroupId } as RouteAction,
    })

    let caught: unknown
    try {
      await accessModelRouter.routeCandidates({
        requestedModel: 'empty-group-am',
        streaming: false,
        hasTools: false,
        hasVision: false,
        virtualKeyId: 'test-key-id',
      } as RoutingContext)
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(NoAvailableInstanceError)
    const failed = caught as NoAvailableInstanceError
    expect(failed.routeChain?.outcome).toBe('all_failed')
    expect(failed.routeChain?.chain[0]?.actionType).toBe('route_to_group')
    expect(failed.routeChain?.chain[0]?.resolvedGroupId).toBe(emptyGroupId)
  })
})
