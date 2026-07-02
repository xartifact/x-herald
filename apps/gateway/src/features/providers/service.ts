import crypto from 'crypto'
import { desc, eq, inArray } from '@xartifact/x-llm-gateway-db'
import { z } from 'zod'

import type { Database } from '../../db/client'
import { getDatabase } from '../../db/client'
import rootLogger from '../../lib/logger'
import { modelInstances } from '@xartifact/x-llm-gateway-db'

import { providers } from '@xartifact/x-llm-gateway-db'
import type { ProtocolsConfig } from './db'

const logger = rootLogger.child({ module: 'providers-service' })

export const ProtocolConfigSchema = z
  .object({
    baseUrl: z.string().min(1, 'baseUrl is required'),
    enabled: z.boolean(),
  })
  .passthrough()

export const ProtocolsSchema = z
  .record(z.string(), ProtocolConfigSchema)
  .refine((p) => Object.keys(p).length > 0, { message: 'At least one protocol must be configured' })

export const CreateProviderSchema = z.object({
  name: z.string().min(1, 'name is required'),
  protocols: ProtocolsSchema,
  apiKey: z.string().optional().nullable(),
  enabled: z.boolean().default(true),
})

export const UpdateProviderSchema = z.object({
  name: z.string().optional(),
  protocols: ProtocolsSchema.optional(),
  apiKey: z.string().optional().nullable(),
  enabled: z.boolean().optional(),
})

export const SyncModelsSchema = z.object({
  models: z.array(z.object({ id: z.string(), name: z.string() })),
  groupId: z.string().optional(),
})

export type CreateProviderCommand = z.infer<typeof CreateProviderSchema>
export type UpdateProviderCommand = z.infer<typeof UpdateProviderSchema>
export type SyncModelsCommand = z.infer<typeof SyncModelsSchema>

export async function listProviders(db?: Database) {
  const database = db ?? getDatabase()
  return database.select().from(providers).orderBy(desc(providers.createdAt))
}

export async function getProvider(id: string, db?: Database) {
  const database = db ?? getDatabase()
  const rows = await database.select().from(providers).where(eq(providers.id, id)).limit(1)
  return rows[0] ?? null
}

export async function createProvider(data: CreateProviderCommand, db?: Database) {
  const database = db ?? getDatabase()
  const rows = await database
    .insert(providers)
    .values({
      name: data.name,
      protocols: data.protocols as ProtocolsConfig,
      apiKey: data.apiKey ?? null,
      enabled: data.enabled,
    })
    .returning()
  logger.info({ providerId: rows[0].id }, 'Provider created')
  return rows[0]
}

export async function updateProvider(id: string, data: UpdateProviderCommand, db?: Database) {
  const database = db ?? getDatabase()
  const existing = await getProvider(id, db)
  if (!existing) return null
  const rows = await database
    .update(providers)
    .set({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.protocols !== undefined && { protocols: data.protocols as ProtocolsConfig }),
      ...(data.apiKey !== undefined && { apiKey: data.apiKey }),
      ...(data.enabled !== undefined && { enabled: data.enabled }),
      updatedAt: new Date(),
    })
    .where(eq(providers.id, id))
    .returning()
  logger.info({ providerId: id }, 'Provider updated')
  return rows[0] ?? null
}

export async function deleteProvider(id: string, db?: Database): Promise<boolean> {
  const database = db ?? getDatabase()
  const existing = await getProvider(id, db)
  if (!existing) return false
  await database.delete(providers).where(eq(providers.id, id))
  logger.info({ providerId: id }, 'Provider deleted')
  return true
}

export async function toggleProvider(id: string, db?: Database) {
  const database = db ?? getDatabase()
  const existing = await getProvider(id, db)
  if (!existing) return null
  const rows = await database
    .update(providers)
    .set({ enabled: !existing.enabled, updatedAt: new Date() })
    .where(eq(providers.id, id))
    .returning()
  logger.info({ providerId: id, enabled: rows[0].enabled }, 'Provider toggled')
  return rows[0] ?? null
}

export async function getThinkingMappings(id: string, db?: Database) {
  const provider = await getProvider(id, db)
  if (!provider) return null
  const protocols = (provider.protocols ?? {}) as ProtocolsConfig
  const anthropic = protocols.anthropic
  const mappings = anthropic?.thinkingMapping?.mappings ?? {}
  return {
    mappings: Object.entries(mappings).map(([from, to]) => ({ from, to })),
    syntheticThinking: anthropic?.syntheticThinking ?? 'strip',
  }
}

interface ThinkingMappingData {
  mappings: Array<{ from: string; to: string }>
  syntheticThinking?: string
}

export async function updateThinkingMappings(id: string, data: ThinkingMappingData, db?: Database) {
  const database = db ?? getDatabase()
  const provider = await getProvider(id, db)
  if (!provider) return null

  const mappings: Record<string, string> = {}
  for (const m of data.mappings) {
    if (m.from && m.to) mappings[m.from] = m.to
  }
  const syntheticThinking =
    data.syntheticThinking === 'inject' ? ('inject' as const) : ('strip' as const)
  const currentProtocols = (provider.protocols ?? {}) as ProtocolsConfig
  const currentAnthropic = currentProtocols.anthropic
  const updatedProtocols: ProtocolsConfig = {
    ...currentProtocols,
    anthropic: {
      ...currentAnthropic,
      baseUrl: currentAnthropic?.baseUrl ?? '',
      enabled: currentAnthropic?.enabled ?? true,
      thinkingMapping: { enabled: Object.keys(mappings).length > 0, mappings },
      syntheticThinking,
    },
  }
  await database
    .update(providers)
    .set({ protocols: updatedProtocols, updatedAt: new Date() })
    .where(eq(providers.id, id))
  logger.info({ providerId: id, mappings }, 'Thinking type mappings updated')
  return Object.entries(mappings).map(([from, to]) => ({ from, to }))
}

type FetchModelsOk = {
  ok: true
  models: Array<{ id: string; name: string; synced: boolean }>
  fetchError: string | null
}
type FetchModelsErr = { ok: false; code: 'NOT_FOUND' | 'DISABLED' }
export type FetchModelsResult = FetchModelsOk | FetchModelsErr

export async function fetchRemoteModels(id: string, db?: Database): Promise<FetchModelsResult> {
  const provider = await getProvider(id, db)
  if (!provider) return { ok: false, code: 'NOT_FOUND' }
  if (!provider.enabled) return { ok: false, code: 'DISABLED' }

  const protocols = provider.protocols as ProtocolsConfig
  let remoteModels: Array<{ id: string; name: string }> = []
  let fetchError: string | null = null

  try {
    if (protocols.openai?.enabled && protocols.openai.baseUrl) {
      const url = `${protocols.openai.baseUrl.replace(/\/+$/, '')}/models`
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`
      const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15000) })
      if (resp.ok) {
        const body = (await resp.json()) as { data?: Array<{ id: string }> }
        if (Array.isArray(body.data))
          remoteModels = body.data.map((m) => ({ id: m.id, name: m.id }))
      } else {
        fetchError = `OpenAI API returned ${resp.status}`
      }
    } else if (protocols.anthropic?.enabled && protocols.anthropic.baseUrl) {
      const url = `${protocols.anthropic.baseUrl.replace(/\/+$/, '')}/models`
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      }
      if (provider.apiKey) headers['x-api-key'] = provider.apiKey
      const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15000) })
      if (resp.ok) {
        const body = (await resp.json()) as { data?: Array<{ id: string; display_name?: string }> }
        if (Array.isArray(body.data))
          remoteModels = body.data.map((m) => ({ id: m.id, name: m.display_name || m.id }))
      } else {
        fetchError = `Anthropic API returned ${resp.status}`
      }
    } else {
      fetchError = 'No supported protocol enabled'
    }
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'Failed to fetch models'
    logger.warn({ err, providerId: id }, 'Failed to fetch remote models')
  }

  const database = db ?? getDatabase()
  const existing = await database
    .select({ actualModelName: modelInstances.actualModelName })
    .from(modelInstances)
    .where(eq(modelInstances.providerId, id))
  const syncedSet = new Set(existing.map((i) => i.actualModelName))
  return {
    ok: true,
    models: remoteModels.map((m) => ({ ...m, synced: syncedSet.has(m.id) })),
    fetchError,
  }
}

type SyncModelsOk = {
  ok: true
  created: number
  skipped: number
  details: Array<{ id: string; name: string }>
}
type SyncModelsErr = { ok: false; code: 'NOT_FOUND' | 'DISABLED' | 'GROUP_NOT_FOUND' }
export type SyncModelsResult = SyncModelsOk | SyncModelsErr

export async function syncModels(
  id: string,
  data: SyncModelsCommand,
  db?: Database,
): Promise<SyncModelsResult> {
  const provider = await getProvider(id, db)
  if (!provider) return { ok: false, code: 'NOT_FOUND' }
  if (!provider.enabled) return { ok: false, code: 'DISABLED' }

  const database = db ?? getDatabase()

  if (data.groupId) {
    const { modelGroups } = await import('@xartifact/x-llm-gateway-db')
    const group = await database
      .select()
      .from(modelGroups)
      .where(eq(modelGroups.id, data.groupId))
      .limit(1)
    if (group.length === 0) return { ok: false, code: 'GROUP_NOT_FOUND' }
  }

  const existing = await database
    .select({ actualModelName: modelInstances.actualModelName })
    .from(modelInstances)
    .where(eq(modelInstances.providerId, id))
  const existingSet = new Set(existing.map((i) => i.actualModelName))
  const toCreate = data.models.filter((m) => !existingSet.has(m.id))
  const skipped = data.models.length - toCreate.length

  if (toCreate.length > 0) {
    const inserted = await database
      .insert(modelInstances)
      .values(
        toCreate.map((m) => ({
          providerId: id,
          name: m.name,
          actualModelName: m.id,
          weight: 100,
          priority: 0,
          enabled: true,
        })),
      )
      .returning({ id: modelInstances.id })

    if (data.groupId && inserted.length > 0) {
      const { modelGroupMemberships } = await import('@xartifact/x-llm-gateway-db')
      await database
        .insert(modelGroupMemberships)
        .values(inserted.map((i) => ({ groupId: data.groupId as string, instanceId: i.id })))
    }
  }

  logger.info({ providerId: id, created: toCreate.length, skipped }, 'Models synced')
  return {
    ok: true,
    created: toCreate.length,
    skipped,
    details: toCreate.map((m) => ({ id: m.id, name: m.name })),
  }
}
