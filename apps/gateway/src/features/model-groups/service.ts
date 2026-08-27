import { and, asc, desc, eq, inArray, isNull } from '@xartifact/x-herald-db'

import type { Database } from '../../db/client'
import { getDatabase } from '../../db/client'
import rootLogger from '../../lib/logger'
import { providers } from '@xartifact/x-herald-db'

import {
  modelGroupMemberships,
  modelGroups,
  modelInstances,
  type NewModelGroup,
  type NewModelInstance,
} from '@xartifact/x-herald-db'
import type {
  InstanceConfig,
  InstanceCost,
  InstanceTestResult,
  ModelCapabilities,
  RoutingConfig,
} from '@xartifact/x-herald-shared'

const logger = rootLogger.child({ module: 'model-groups-service' })

export async function fetchGroupIdsByInstanceIds(
  instanceIds: string[],
  db?: Database,
): Promise<
  Map<
    string,
    {
      groupIds: string[]
      groupPriorities: Record<string, number>
    }
  >
> {
  if (instanceIds.length === 0) return new Map()
  const database = db ?? getDatabase()
  const rows = await database
    .select({
      instanceId: modelGroupMemberships.instanceId,
      groupId: modelGroupMemberships.groupId,
      priority: modelGroupMemberships.priority,
    })
    .from(modelGroupMemberships)
    .where(inArray(modelGroupMemberships.instanceId, instanceIds))
  const map = new Map<string, { groupIds: string[]; groupPriorities: Record<string, number> }>()
  for (const row of rows) {
    const entry = map.get(row.instanceId) ?? { groupIds: [], groupPriorities: {} }
    entry.groupIds.push(row.groupId)
    entry.groupPriorities[row.groupId] = row.priority
    map.set(row.instanceId, entry)
  }
  return map
}

export function attachGroupIds<T extends { id: string }>(
  instances: T[],
  relationsMap: Map<
    string,
    {
      groupIds: string[]
      groupPriorities: Record<string, number>
    }
  >,
): Array<
  T & { groupIds: string[]; groupId: string | null; groupPriorities: Record<string, number> }
> {
  return instances.map((inst) => {
    const relations = relationsMap.get(inst.id) ?? { groupIds: [], groupPriorities: {} }
    return {
      ...inst,
      groupIds: relations.groupIds,
      groupId: relations.groupIds[0] ?? null,
      groupPriorities: relations.groupPriorities,
    }
  })
}

export async function setInstanceGroups(
  instanceId: string,
  groupIds: string[],
  db?: Database,
): Promise<void> {
  const database = db ?? getDatabase()
  // 保留已存在组的排序，避免重建时打乱组内顺序
  const existing = await database
    .select({ groupId: modelGroupMemberships.groupId, priority: modelGroupMemberships.priority })
    .from(modelGroupMemberships)
    .where(eq(modelGroupMemberships.instanceId, instanceId))
  const existingPriority = new Map(existing.map((e) => [e.groupId, e.priority]))

  await database
    .delete(modelGroupMemberships)
    .where(eq(modelGroupMemberships.instanceId, instanceId))

  if (groupIds.length > 0) {
    let nextPriority = existing.length ? Math.max(...existing.map((e) => e.priority)) + 1 : 0
    await database.insert(modelGroupMemberships).values(
      groupIds.map((gid) => {
        const priority = existingPriority.has(gid) ? existingPriority.get(gid)! : nextPriority++
        return { groupId: gid, instanceId, priority }
      }),
    )
  }
}

export async function listInstances(db?: Database) {
  const database = db ?? getDatabase()
  const rows = await database
    .select({
      instance: modelInstances,
      providerId: providers.id,
      providerName: providers.name,
    })
    .from(modelInstances)
    .leftJoin(providers, eq(modelInstances.providerId, providers.id))
    .where(isNull(modelInstances.deletedAt))
    .orderBy(asc(modelInstances.createdAt))
  const instances = rows.map((r) => ({
    ...r.instance,
    provider: r.providerId && r.providerName ? { id: r.providerId, name: r.providerName } : null,
  }))
  const groupIdsMap = await fetchGroupIdsByInstanceIds(
    instances.map((i) => i.id),
    db,
  )
  return attachGroupIds(instances, groupIdsMap)
}

export async function listGroups(db?: Database) {
  const database = db ?? getDatabase()
  return database
    .select()
    .from(modelGroups)
    .where(isNull(modelGroups.deletedAt))
    .orderBy(desc(modelGroups.createdAt))
}

interface CreateInstanceData {
  providerId: string
  name: string
  actualModelName: string
  description?: string
  weight?: number
  costPer1kTokens?: InstanceCost | null
  config?: InstanceConfig | null
  groupIds?: string[]
  groupId?: string
}

export async function createInstance(data: CreateInstanceData, db?: Database) {
  const database = db ?? getDatabase()
  const groupIds: string[] = Array.isArray(data.groupIds)
    ? data.groupIds
    : data.groupId
      ? [data.groupId]
      : []

  if (groupIds.length > 0) {
    const groups = await database
      .select({ id: modelGroups.id })
      .from(modelGroups)
      .where(inArray(modelGroups.id, groupIds))
    if (groups.length !== groupIds.length)
      return { error: 'One or more model groups not found' as const }
  }

  const provider = await database
    .select()
    .from(providers)
    .where(eq(providers.id, data.providerId))
    .limit(1)
  if (provider.length === 0) return { error: 'Provider not found' as const }

  const insertValues: NewModelInstance = {
    providerId: data.providerId,
    name: data.name,
    actualModelName: data.actualModelName,
    description: data.description,
    weight: data.weight ?? 100,
    costPer1kTokens: data.costPer1kTokens,
    config: data.config,
  }
  const [instance] = await database.insert(modelInstances).values(insertValues).returning()

  if (groupIds.length > 0) {
    const groupPriorities: Record<string, number> = {}
    await database.insert(modelGroupMemberships).values(
      groupIds.map((gid, idx) => {
        groupPriorities[gid] = idx
        return { groupId: gid, instanceId: instance.id, priority: idx }
      }),
    )
    logger.info(
      { instanceId: instance.id, groupIds, providerId: data.providerId },
      'Model instance created',
    )
    return {
      data: { ...instance, groupIds, groupId: groupIds[0] ?? null, groupPriorities },
    }
  }

  return { data: { ...instance, groupIds: [], groupId: null, groupPriorities: {} } }
}

interface UpdateInstanceData {
  providerId?: string
  name?: string
  actualModelName?: string
  description?: string
  weight?: number
  costPer1kTokens?: InstanceCost | null
  config?: InstanceConfig | null
  groupIds?: string[]
  groupId?: string | null
}

export async function updateInstance(id: string, data: UpdateInstanceData, db?: Database) {
  const database = db ?? getDatabase()
  const [updated] = await database
    .update(modelInstances)
    .set({
      ...(data.providerId !== undefined && { providerId: data.providerId }),
      ...(data.name !== undefined && { name: data.name }),
      ...(data.actualModelName !== undefined && { actualModelName: data.actualModelName }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.weight !== undefined && { weight: data.weight }),
      ...(data.costPer1kTokens !== undefined && { costPer1kTokens: data.costPer1kTokens }),
    })
    .where(eq(modelInstances.id, id))
    .returning()

  if (!updated) return null

  if (data.groupIds !== undefined || data.groupId !== undefined) {
    const groupIds: string[] = Array.isArray(data.groupIds)
      ? data.groupIds
      : data.groupId !== undefined
        ? data.groupId
          ? [data.groupId]
          : []
        : []
    await setInstanceGroups(id, groupIds, db)
  }

  const groupIdsMap = await fetchGroupIdsByInstanceIds([id], db)
  return attachGroupIds([updated], groupIdsMap)[0]
}

export async function deleteInstance(id: string, db?: Database) {
  const database = db ?? getDatabase()
  const existing = await database
    .select()
    .from(modelInstances)
    .where(eq(modelInstances.id, id))
    .limit(1)
  if (!existing[0] || existing[0].deletedAt) return null
  const [deleted] = await database
    .update(modelInstances)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(modelInstances.id, id))
    .returning()
  return deleted ?? null
}

export async function setInstanceGroupsById(id: string, groupIds: string[], db?: Database) {
  const database = db ?? getDatabase()
  const instance = await database
    .select()
    .from(modelInstances)
    .where(eq(modelInstances.id, id))
    .limit(1)
  if (instance.length === 0) return null

  const resolvedGroupIds = groupIds ?? []
  if (resolvedGroupIds.length > 0) {
    const groups = await database
      .select({ id: modelGroups.id })
      .from(modelGroups)
      .where(inArray(modelGroups.id, resolvedGroupIds))
    if (groups.length !== resolvedGroupIds.length)
      return { error: 'One or more model groups not found' as const }
  }

  await setInstanceGroups(id, resolvedGroupIds, db)
  logger.info({ instanceId: id, groupIds: resolvedGroupIds }, 'Instance groups updated')
  const relations = await fetchGroupIdsByInstanceIds([id], db)
  return { data: attachGroupIds([instance[0]], relations)[0] }
}

export async function assignInstance(id: string, groupId: string | null, db?: Database) {
  const database = db ?? getDatabase()
  const instance = await database
    .select()
    .from(modelInstances)
    .where(eq(modelInstances.id, id))
    .limit(1)
  if (instance.length === 0) return { error: 'Model instance not found' as const }

  if (groupId) {
    const group = await database
      .select({ id: modelGroups.id })
      .from(modelGroups)
      .where(eq(modelGroups.id, groupId))
      .limit(1)
    if (group.length === 0) return { error: 'Model group not found' as const }
  }

  const groupIds = groupId ? [groupId] : []
  await setInstanceGroups(id, groupIds, db)
  const relations = await fetchGroupIdsByInstanceIds([id], db)
  return { data: attachGroupIds([instance[0]], relations)[0] }
}

export async function toggleInstance(id: string, db?: Database) {
  const database = db ?? getDatabase()
  const instance = await database
    .select()
    .from(modelInstances)
    .where(eq(modelInstances.id, id))
    .limit(1)
  if (instance.length === 0) return null
  const [updated] = await database
    .update(modelInstances)
    .set({ enabled: !instance[0].enabled, updatedAt: new Date() })
    .where(eq(modelInstances.id, id))
    .returning()
  const groupIdsMap = await fetchGroupIdsByInstanceIds([id], db)
  return attachGroupIds([updated], groupIdsMap)[0]
}

export async function reorderGroupInstances(
  groupId: string,
  instanceIds: string[],
  db?: Database,
): Promise<void> {
  const database = db ?? getDatabase()
  for (let i = 0; i < instanceIds.length; i++) {
    await database
      .update(modelGroupMemberships)
      .set({ priority: i })
      .where(
        and(
          eq(modelGroupMemberships.groupId, groupId),
          eq(modelGroupMemberships.instanceId, instanceIds[i]),
        ),
      )
  }
}

interface GroupData {
  name: string
  aliases?: string[]
  displayName?: string
  description?: string
  category?: string
  capabilities?: ModelCapabilities
  supportedProtocols?: string[]
  routingConfig?: RoutingConfig | null
  metadata?: Record<string, unknown> | null
}

export async function createGroup(data: GroupData, db?: Database) {
  const database = db ?? getDatabase()
  const insertValues: NewModelGroup = {
    name: data.name,
    displayName: data.displayName ?? data.name,
    aliases: data.aliases || [],
    description: data.description,
    category: data.category || 'chat',
    capabilities: data.capabilities || {
      streaming: true,
      functionCalling: false,
      vision: false,
      jsonMode: false,
      maxTokens: 4096,
      contextWindow: 8192,
    },
    supportedProtocols: data.supportedProtocols || ['openai'],
    routingConfig: data.routingConfig,
    metadata: data.metadata,
  }
  const [group] = await database.insert(modelGroups).values(insertValues).returning()
  logger.info({ groupId: group.id, name: group.name }, 'Model group created')
  return group
}

export async function updateGroup(id: string, data: Partial<GroupData>, db?: Database) {
  const database = db ?? getDatabase()
  const [updated] = await database
    .update(modelGroups)
    .set({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.displayName !== undefined && { displayName: data.displayName }),
      ...(data.aliases !== undefined && { aliases: data.aliases }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.capabilities !== undefined && { capabilities: data.capabilities }),
      ...(data.supportedProtocols !== undefined && { supportedProtocols: data.supportedProtocols }),
      ...(data.routingConfig !== undefined && { routingConfig: data.routingConfig }),
      ...(data.metadata !== undefined && { metadata: data.metadata }),
      updatedAt: new Date(),
    })
    .where(eq(modelGroups.id, id))
    .returning()
  return updated ?? null
}

export async function deleteGroup(id: string, db?: Database) {
  const database = db ?? getDatabase()
  const existing = await database.select().from(modelGroups).where(eq(modelGroups.id, id)).limit(1)
  if (!existing[0] || existing[0].deletedAt) return null
  const [deleted] = await database
    .update(modelGroups)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(modelGroups.id, id))
    .returning()
  return deleted ?? null
}

export async function toggleGroup(id: string, db?: Database) {
  const database = db ?? getDatabase()
  const group = await database.select().from(modelGroups).where(eq(modelGroups.id, id)).limit(1)
  if (group.length === 0) return null
  const [updated] = await database
    .update(modelGroups)
    .set({ enabled: !group[0].enabled, updatedAt: new Date() })
    .where(eq(modelGroups.id, id))
    .returning()
  return updated ?? null
}

const INSTANCE_TEST_TIMEOUT_MS = 10_000
const INSTANCE_TEST_MAX_TOKENS = 1

/**
 * 测试模型实例的连通性与可用性：按实例所属 Provider 的协议（openai/anthropic）
 * 向 baseUrl 发送一个最小请求（max_tokens=1），返回连通性 + 延迟 + 响应片段。
 *
 * 探测是只读的、不落库；不做协议转换（直接发对应协议的原始请求），用于管理员
 * 在实例清单上手动点击"测试"按钮确认该模型是否可达、可响应。
 */
export async function testInstanceConnectivity(instanceId: string): Promise<InstanceTestResult> {
  const database = getDatabase()

  const [instance] = await database
    .select()
    .from(modelInstances)
    .where(eq(modelInstances.id, instanceId))
    .limit(1)
  if (!instance)
    return {
      ok: false,
      statusCode: null,
      latencyMs: 0,
      model: null,
      message: '实例不存在',
      snippet: null,
    }

  if (!instance.enabled)
    return {
      ok: false,
      statusCode: null,
      latencyMs: 0,
      model: instance.actualModelName,
      message: '实例已被禁用，无法测试',
      snippet: null,
    }

  const [provider] = await database
    .select()
    .from(providers)
    .where(eq(providers.id, instance.providerId))
    .limit(1)
  if (!provider)
    return {
      ok: false,
      statusCode: null,
      latencyMs: 0,
      model: instance.actualModelName,
      message: '所属 Provider 不存在',
      snippet: null,
    }

  if (!provider.enabled)
    return {
      ok: false,
      statusCode: null,
      latencyMs: 0,
      model: instance.actualModelName,
      message: 'Provider 已被禁用',
      snippet: null,
    }

  const protocols = (provider.protocols ?? {}) as Record<
    string,
    { baseUrl?: string; enabled?: boolean }
  >
  const openai = protocols.openai
  const anthropic = protocols.anthropic

  let protocol: 'openai' | 'anthropic' | null = null
  let baseUrl = ''
  if (openai?.enabled && openai.baseUrl) {
    protocol = 'openai'
    baseUrl = openai.baseUrl
  } else if (anthropic?.enabled && anthropic.baseUrl) {
    protocol = 'anthropic'
    baseUrl = anthropic.baseUrl
  }
  if (!protocol) {
    return {
      ok: false,
      statusCode: null,
      latencyMs: 0,
      model: instance.actualModelName,
      message: 'Provider 未启用 openai/anthropic 协议或未配置 baseUrl',
      snippet: null,
    }
  }

  const model = instance.actualModelName
  const started = Date.now()
  try {
    let url: string
    let body: Record<string, unknown>
    const headers: Record<string, string> = { 'content-type': 'application/json' }

    if (protocol === 'openai') {
      url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`
      body = {
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: INSTANCE_TEST_MAX_TOKENS,
        stream: false,
      }
      if (provider.apiKey) headers.authorization = `Bearer ${provider.apiKey}`
    } else {
      url = `${baseUrl.replace(/\/+$/, '')}/v1/messages`
      body = {
        model,
        max_tokens: INSTANCE_TEST_MAX_TOKENS,
        messages: [{ role: 'user', content: 'ping' }],
      }
      if (provider.apiKey) headers['x-api-key'] = provider.apiKey
      headers['anthropic-version'] = '2023-06-01'
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(INSTANCE_TEST_TIMEOUT_MS),
    })
    const latencyMs = Date.now() - started

    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      const openaiChoices = (
        data.choices as Array<{ message?: { content?: string } }> | undefined
      )?.[0]
      const anthropicContent = (data.content as Array<{ text?: string }> | undefined)?.[0]
      const snippet = openaiChoices?.message?.content ?? anthropicContent?.text ?? ''
      const upstreamModel = (data.model as string | undefined) ?? model
      logger.info(
        { instanceId, providerId: provider.id, latencyMs, upstreamModel },
        'Instance connectivity test succeeded',
      )
      return {
        ok: true,
        statusCode: res.status,
        latencyMs,
        model: upstreamModel,
        message: `连通正常 · ${latencyMs}ms`,
        snippet: snippet || null,
      }
    }

    const errData = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    return {
      ok: false,
      statusCode: res.status,
      latencyMs,
      model,
      message: errData.error?.message ?? `上游返回 HTTP ${res.status}`,
      snippet: null,
    }
  } catch (err) {
    const latencyMs = Date.now() - started
    const isTimeout = err instanceof Error && err.name === 'TimeoutError'
    const msg = isTimeout ? '连接超时（10s）' : err instanceof Error ? err.message : '未知错误'
    logger.warn({ err, instanceId, providerId: provider.id }, 'Instance connectivity test failed')
    return { ok: false, statusCode: null, latencyMs, model, message: msg, snippet: null }
  }
}
