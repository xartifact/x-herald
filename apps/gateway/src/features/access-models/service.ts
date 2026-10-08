import { and, eq, isNull } from '@xartifact/x-herald-db'

import type { Database } from '../../db/client'
import { getDatabase } from '../../db/client'
import rootLogger from '../../lib/logger'
import { accessModels } from '@xartifact/x-herald-db'
import type { ModelCapabilities } from '../model-groups/db'
import { DEFAULT_WORKSPACE_ID } from '../workspaces/context'

import { CATCHALL_VM_NAME, DEFAULT_ACCESS_MODEL_CAPABILITIES } from './constants'

const logger = rootLogger.child({ module: 'access-models-service' })

export async function listAccessModels(db?: Database, workspaceId = DEFAULT_WORKSPACE_ID) {
  const database = db ?? getDatabase()
  return database
    .select({
      id: accessModels.id,
      name: accessModels.name,
      displayName: accessModels.displayName,
      description: accessModels.description,
      enabled: accessModels.enabled,
      deletedAt: accessModels.deletedAt,
      capabilities: accessModels.capabilities,
      updatedAt: accessModels.updatedAt,
    })
    .from(accessModels)
    .where(and(eq(accessModels.workspaceId, workspaceId), isNull(accessModels.deletedAt)))
}

export async function getAccessModel(
  id: string,
  db?: Database,
  workspaceId = DEFAULT_WORKSPACE_ID,
) {
  const database = db ?? getDatabase()
  const rows = await database
    .select({
      id: accessModels.id,
      name: accessModels.name,
      displayName: accessModels.displayName,
      description: accessModels.description,
      enabled: accessModels.enabled,
      deletedAt: accessModels.deletedAt,
      capabilities: accessModels.capabilities,
      updatedAt: accessModels.updatedAt,
    })
    .from(accessModels)
    .where(and(eq(accessModels.id, id), eq(accessModels.workspaceId, workspaceId)))
    .limit(1)
  return rows[0] ?? null
}

export async function createAccessModel(
  data: {
    name: string
    displayName?: string | null
    description?: string | null
    enabled?: boolean
    capabilities?: ModelCapabilities | null
  },
  db?: Database,
  workspaceId = DEFAULT_WORKSPACE_ID,
) {
  const database = db ?? getDatabase()
  const [am] = await database
    .insert(accessModels)
    .values({
      name: data.name,
      workspaceId,
      displayName: data.displayName || null,
      description: data.description || null,
      enabled: data.enabled ?? true,
      capabilities: data.capabilities ?? DEFAULT_ACCESS_MODEL_CAPABILITIES,
    })
    .returning()
  logger.info({ id: am.id, name: am.name }, 'Access model created')
  return am
}

export async function updateAccessModel(
  id: string,
  data: {
    name?: string
    displayName?: string | null
    description?: string | null
    enabled?: boolean
    capabilities?: ModelCapabilities | null
  },
  db?: Database,
  workspaceId = DEFAULT_WORKSPACE_ID,
) {
  const current = await getAccessModel(id, db, workspaceId)
  if (!current) return null

  const isSystem = current.name === CATCHALL_VM_NAME
  if (isSystem && data.name !== undefined && data.name !== CATCHALL_VM_NAME) {
    throw new Error('System access model name cannot be changed')
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  if (data.name !== undefined && !isSystem) updateData.name = data.name
  if (data.displayName !== undefined) updateData.displayName = data.displayName
  if (data.description !== undefined) updateData.description = data.description
  if (data.enabled !== undefined) updateData.enabled = data.enabled
  if ('capabilities' in data) updateData.capabilities = data.capabilities ?? null

  const database = db ?? getDatabase()
  const [updated] = await database
    .update(accessModels)
    .set(updateData)
    .where(and(eq(accessModels.id, id), eq(accessModels.workspaceId, workspaceId)))
    .returning()
  return updated ?? null
}

export async function deleteAccessModel(
  id: string,
  db?: Database,
  workspaceId = DEFAULT_WORKSPACE_ID,
) {
  const current = await getAccessModel(id, db, workspaceId)
  if (!current) return null

  if (current.deletedAt) return null

  if (current.name === CATCHALL_VM_NAME) {
    throw new Error('System access model cannot be deleted')
  }

  const database = db ?? getDatabase()
  const [deleted] = await database
    .update(accessModels)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(accessModels.id, id), eq(accessModels.workspaceId, workspaceId)))
    .returning()
  return deleted ?? null
}

export async function toggleAccessModel(
  id: string,
  db?: Database,
  workspaceId = DEFAULT_WORKSPACE_ID,
) {
  const current = await getAccessModel(id, db, workspaceId)
  if (!current) return null

  const database = db ?? getDatabase()
  const [updated] = await database
    .update(accessModels)
    .set({ enabled: !current.enabled, updatedAt: new Date() })
    .where(and(eq(accessModels.id, id), eq(accessModels.workspaceId, workspaceId)))
    .returning()
  return updated ?? null
}
