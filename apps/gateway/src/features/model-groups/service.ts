import { asc, desc, eq, inArray } from '@xartifact/x-llm-gateway-db'

import type { Database } from '../../db/client'
import { getDatabase } from '../../db/client'
import rootLogger from '../../lib/logger'
import { providers } from '@xartifact/x-llm-gateway-db'

import {
  modelGroupMemberships,
  modelGroups,
  modelInstances,
  type NewModelGroup,
  type NewModelInstance,
} from '@xartifact/x-llm-gateway-db'
import type { InstanceConfig, ModelCapabilities, RoutingConfig } from './db'

const logger = rootLogger.child({ module: 'model-groups-service' })

export async function fetchGroupIdsByInstanceIds(instanceIds: string[], db?: Database): Promise<Map<string, string[]>> {
  if (instanceIds.length === 0) return new Map()
  const database = db ?? getDatabase()
  const rows = await database
    .select({ instanceId: modelGroupMemberships.instanceId, groupId: modelGroupMemberships.groupId })
    .from(modelGroupMemberships)
    .where(inArray(modelGroupMemberships.instanceId, instanceIds))
  const map = new Map<string, string[]>()
  for (const row of rows) {
    const list = map.get(row.instanceId) ?? []
    list.push(row.groupId)
    map.set(row.instanceId, list)
  }
  return map
}

export function attachGroupIds<T extends { id: string }>(
  instances: T[],
  groupIdsMap: Map<string, string[]>
): Array<T & { groupIds: string[]; groupId: string | null }> {
  return instances.map((inst) => {
    const groupIds = groupIdsMap.get(inst.id) ?? []
    return { ...inst, groupIds, groupId: groupIds[0] ?? null }
  })
}

export async function setInstanceGroups(instanceId: string, groupIds: string[], db?: Database): Promise<void> {
  const database = db ?? getDatabase()
  await database.delete(modelGroupMemberships).where(eq(modelGroupMemberships.instanceId, instanceId))
  if (groupIds.length > 0) {
    await database.insert(modelGroupMemberships).values(groupIds.map((gid) => ({ groupId: gid, instanceId })))
  }
}

export async function listInstances(db?: Database) {
  const database = db ?? getDatabase()
  const instances = await database.select().from(modelInstances).orderBy(asc(modelInstances.priority), asc(modelInstances.createdAt))
  const groupIdsMap = await fetchGroupIdsByInstanceIds(instances.map((i) => i.id), db)
  return attachGroupIds(instances, groupIdsMap)
}

export async function listGroups(db?: Database) {
  const database = db ?? getDatabase()
  return database.select().from(modelGroups).orderBy(desc(modelGroups.createdAt))
}

interface CreateInstanceData {
  providerId: string
  name: string
  actualModelName: string
  description?: string
  weight?: number
  priority?: number
  costPer1kTokens?: { input: number; output: number } | null
  config?: InstanceConfig | null
  groupIds?: string[]
  groupId?: string
}

export async function createInstance(data: CreateInstanceData, db?: Database) {
  const database = db ?? getDatabase()
  const groupIds: string[] = Array.isArray(data.groupIds)
    ? data.groupIds
    : data.groupId ? [data.groupId] : []

  if (groupIds.length > 0) {
    const groups = await database.select({ id: modelGroups.id }).from(modelGroups).where(inArray(modelGroups.id, groupIds))
    if (groups.length !== groupIds.length) return { error: 'One or more model groups not found' as const }
  }

  const provider = await database.select().from(providers).where(eq(providers.id, data.providerId)).limit(1)
  if (provider.length === 0) return { error: 'Provider not found' as const }

  const insertValues: NewModelInstance = {
    providerId: data.providerId,
    name: data.name,
    actualModelName: data.actualModelName,
    description: data.description,
    weight: data.weight ?? 100,
    priority: data.priority ?? 0,
    costPer1kTokens: data.costPer1kTokens,
    config: data.config,
  }
  const [instance] = await database.insert(modelInstances).values(insertValues).returning()

  if (groupIds.length > 0) {
    await database.insert(modelGroupMemberships).values(groupIds.map((gid) => ({ groupId: gid, instanceId: instance.id })))
  }

  logger.info({ instanceId: instance.id, groupIds, providerId: data.providerId }, 'Model instance created')
  return { data: { ...instance, groupIds, groupId: groupIds[0] ?? null } }
}

interface UpdateInstanceData {
  providerId?: string
  name?: string
  actualModelName?: string
  description?: string
  weight?: number
  priority?: number
  costPer1kTokens?: { input: number; output: number } | null
  config?: InstanceConfig | null
  groupIds?: string[]
  groupId?: string | null
}

export async function updateInstance(id: string, data: UpdateInstanceData, db?: Database) {
  const database = db ?? getDatabase()
  const [updated] = await database.update(modelInstances).set({
    ...(data.providerId !== undefined && { providerId: data.providerId }),
    ...(data.name !== undefined && { name: data.name }),
    ...(data.actualModelName !== undefined && { actualModelName: data.actualModelName }),
    ...(data.description !== undefined && { description: data.description }),
    ...(data.weight !== undefined && { weight: data.weight }),
    ...(data.priority !== undefined && { priority: data.priority }),
    ...(data.costPer1kTokens !== undefined && { costPer1kTokens: data.costPer1kTokens }),
    ...(data.config !== undefined && { config: data.config }),
    updatedAt: new Date(),
  }).where(eq(modelInstances.id, id)).returning()

  if (!updated) return null

  if (data.groupIds !== undefined || data.groupId !== undefined) {
    const groupIds: string[] = Array.isArray(data.groupIds)
      ? data.groupIds
      : data.groupId !== undefined ? (data.groupId ? [data.groupId] : []) : []
    await setInstanceGroups(id, groupIds, db)
  }

  const groupIdsMap = await fetchGroupIdsByInstanceIds([id], db)
  return attachGroupIds([updated], groupIdsMap)[0]
}

export async function deleteInstance(id: string, db?: Database) {
  const database = db ?? getDatabase()
  const [deleted] = await database.delete(modelInstances).where(eq(modelInstances.id, id)).returning()
  return deleted ?? null
}

export async function setInstanceGroupsById(id: string, groupIds: string[], db?: Database) {
  const database = db ?? getDatabase()
  const instance = await database.select().from(modelInstances).where(eq(modelInstances.id, id)).limit(1)
  if (instance.length === 0) return null

  const resolvedGroupIds = groupIds ?? []
  if (resolvedGroupIds.length > 0) {
    const groups = await database.select({ id: modelGroups.id }).from(modelGroups).where(inArray(modelGroups.id, resolvedGroupIds))
    if (groups.length !== resolvedGroupIds.length) return { error: 'One or more model groups not found' as const }
  }

  await setInstanceGroups(id, resolvedGroupIds, db)
  logger.info({ instanceId: id, groupIds: resolvedGroupIds }, 'Instance groups updated')
  return { data: { ...instance[0], groupIds: resolvedGroupIds, groupId: resolvedGroupIds[0] ?? null } }
}

export async function assignInstance(id: string, groupId: string | null, db?: Database) {
  const database = db ?? getDatabase()
  const instance = await database.select().from(modelInstances).where(eq(modelInstances.id, id)).limit(1)
  if (instance.length === 0) return { error: 'Model instance not found' as const }

  if (groupId) {
    const group = await database.select({ id: modelGroups.id }).from(modelGroups).where(eq(modelGroups.id, groupId)).limit(1)
    if (group.length === 0) return { error: 'Model group not found' as const }
  }

  const groupIds = groupId ? [groupId] : []
  await setInstanceGroups(id, groupIds, db)
  return { data: { ...instance[0], groupIds, groupId: groupId ?? null } }
}

export async function toggleInstance(id: string, db?: Database) {
  const database = db ?? getDatabase()
  const instance = await database.select().from(modelInstances).where(eq(modelInstances.id, id)).limit(1)
  if (instance.length === 0) return null
  const [updated] = await database.update(modelInstances).set({ enabled: !instance[0].enabled, updatedAt: new Date() }).where(eq(modelInstances.id, id)).returning()
  const groupIdsMap = await fetchGroupIdsByInstanceIds([id], db)
  return attachGroupIds([updated], groupIdsMap)[0]
}

export async function reorderInstances(instanceIds: string[], db?: Database): Promise<void> {
  const database = db ?? getDatabase()
  for (let i = 0; i < instanceIds.length; i++) {
    await database.update(modelInstances).set({ priority: i, updatedAt: new Date() }).where(eq(modelInstances.id, instanceIds[i]))
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
    capabilities: data.capabilities || { streaming: true, functionCalling: false, vision: false, jsonMode: false, maxTokens: 4096, contextWindow: 8192 },
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
  const [updated] = await database.update(modelGroups).set({
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
  }).where(eq(modelGroups.id, id)).returning()
  return updated ?? null
}

export async function deleteGroup(id: string, db?: Database) {
  const database = db ?? getDatabase()
  const [deleted] = await database.delete(modelGroups).where(eq(modelGroups.id, id)).returning()
  return deleted ?? null
}

export async function toggleGroup(id: string, db?: Database) {
  const database = db ?? getDatabase()
  const group = await database.select().from(modelGroups).where(eq(modelGroups.id, id)).limit(1)
  if (group.length === 0) return null
  const [updated] = await database.update(modelGroups).set({ enabled: !group[0].enabled, updatedAt: new Date() }).where(eq(modelGroups.id, id)).returning()
  return updated ?? null
}
