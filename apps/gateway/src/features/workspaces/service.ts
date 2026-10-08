import { and, count, eq } from '@xartifact/x-herald-db'
import {
  accessModels,
  costRecords,
  intentLogs,
  modelGroups,
  requestLogs,
  routeRules,
  virtualKeys,
  workspaces,
} from '@xartifact/x-herald-db'

import type { Database } from '../../db/client'
import { getDatabase } from '../../db/client'
import { DEFAULT_WORKSPACE_ID } from './context'

export async function listWorkspaces(db?: Database) {
  return (db ?? getDatabase()).select().from(workspaces).orderBy(workspaces.createdAt)
}

export async function createWorkspace(name: string, db?: Database) {
  const [created] = await (db ?? getDatabase())
    .insert(workspaces)
    .values({ name: name.trim() })
    .returning()
  return created
}

export async function updateWorkspace(id: string, name: string, db?: Database) {
  const [updated] = await (db ?? getDatabase())
    .update(workspaces)
    .set({ name: name.trim(), updatedAt: new Date() })
    .where(eq(workspaces.id, id))
    .returning()
  return updated ?? null
}

export async function deleteWorkspace(id: string, db?: Database) {
  const database = db ?? getDatabase()
  const [workspace] = await database.select().from(workspaces).where(eq(workspaces.id, id)).limit(1)
  if (!workspace) return { error: 'NOT_FOUND' as const }
  if (workspace.id === DEFAULT_WORKSPACE_ID || workspace.isDefault) {
    return { error: 'DEFAULT_WORKSPACE' as const }
  }

  const [keyCount, groupCount, accessModelCount, ruleCount, logCount, intentCount, costCount] =
    await Promise.all([
      database.select({ value: count() }).from(virtualKeys).where(eq(virtualKeys.workspaceId, id)),
      database.select({ value: count() }).from(modelGroups).where(eq(modelGroups.workspaceId, id)),
      database
        .select({ value: count() })
        .from(accessModels)
        .where(eq(accessModels.workspaceId, id)),
      database.select({ value: count() }).from(routeRules).where(eq(routeRules.workspaceId, id)),
      database.select({ value: count() }).from(requestLogs).where(eq(requestLogs.workspaceId, id)),
      database.select({ value: count() }).from(intentLogs).where(eq(intentLogs.workspaceId, id)),
      database.select({ value: count() }).from(costRecords).where(eq(costRecords.workspaceId, id)),
    ])
  const total = [
    keyCount,
    groupCount,
    accessModelCount,
    ruleCount,
    logCount,
    intentCount,
    costCount,
  ]
    .flat()
    .reduce((sum, row) => sum + row.value, 0)
  if (total > 0) return { error: 'WORKSPACE_NOT_EMPTY' as const }

  await database
    .delete(workspaces)
    .where(and(eq(workspaces.id, id), eq(workspaces.isDefault, false)))
  return { data: true as const }
}
