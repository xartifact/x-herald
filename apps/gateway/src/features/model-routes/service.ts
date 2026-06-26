import { eq, sql } from 'drizzle-orm';

import type { Database } from '../../db/client';
import { getDatabase } from '../../db/client';
import rootLogger from '../../lib/logger';
import { modelRoutes, accessModels } from '@x-llm-gateway/db';
import type { RouteCondition, RouteAction, FlowData } from '../model-groups/db';

const logger = rootLogger.child({ module: 'model-routes-service' });

const routeSelect = {
  id: modelRoutes.id,
  name: modelRoutes.name,
  description: modelRoutes.description,
  accessModelIds: modelRoutes.accessModelIds,
  conditions: modelRoutes.conditions,
  action: modelRoutes.action,
  priority: modelRoutes.priority,
  enabled: modelRoutes.enabled,
  flowData: modelRoutes.flowData,
  createdAt: modelRoutes.createdAt,
  updatedAt: modelRoutes.updatedAt,
};

function withCompatFields<T extends typeof routeSelect>(r: {
  id: string;
  name: string;
  description: string | null;
  accessModelIds: string[];
  conditions: unknown;
  action: unknown;
  priority: number;
  enabled: boolean;
  flowData: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...r,
    virtualModelIds: r.accessModelIds,
    virtualModel: null,
    accessModel: null,
  };
}

export async function listModelRoutes(accessModelId?: string, db?: Database) {
  const database = db ?? getDatabase();
  let query = database
    .select(routeSelect)
    .from(modelRoutes)
    .$dynamic();

  if (accessModelId) {
    query = query.where(sql`${modelRoutes.accessModelIds} @> ARRAY[${accessModelId}]::text[]`);
  }

  const results = await query;
  return results.map(withCompatFields);
}

export async function getModelRoute(id: string, db?: Database) {
  const database = db ?? getDatabase();
  const results = await database
    .select(routeSelect)
    .from(modelRoutes)
    .where(eq(modelRoutes.id, id))
    .limit(1);

  if (results.length === 0) return null;
  return withCompatFields(results[0]);
}

export async function getFlowData(db?: Database) {
  const database = db ?? getDatabase();
  const routes = await database
    .select({
      id: modelRoutes.id,
      name: modelRoutes.name,
      accessModelIds: modelRoutes.accessModelIds,
      conditions: modelRoutes.conditions,
      action: modelRoutes.action,
      priority: modelRoutes.priority,
      enabled: modelRoutes.enabled,
      flowData: modelRoutes.flowData,
    })
    .from(modelRoutes)
    .where(eq(modelRoutes.enabled, true));

  const ams = await database
    .select({
      id: accessModels.id,
      name: accessModels.name,
      displayName: accessModels.displayName,
    })
    .from(accessModels)
    .where(eq(accessModels.enabled, true));

  return { routes, accessModels: ams };
}

export async function createModelRoute(data: {
  name: string;
  description?: string | null;
  accessModelIds?: string[];
  conditions?: RouteCondition[];
  action: RouteAction;
  priority?: number;
  enabled?: boolean;
  flowData?: FlowData | null;
}, db?: Database) {
  const database = db ?? getDatabase();
  const [route] = await database
    .insert(modelRoutes)
    .values({
      name: data.name,
      description: data.description || null,
      accessModelIds: data.accessModelIds ?? [],
      conditions: data.conditions || [],
      action: data.action,
      priority: data.priority ?? 0,
      enabled: data.enabled ?? true,
      flowData: data.flowData || null,
    })
    .returning();

  logger.info({ id: route.id, name: route.name }, 'Model route created');
  return route;
}

export async function updateModelRoute(id: string, data: {
  name?: string;
  description?: string | null;
  accessModelIds?: string[];
  conditions?: RouteCondition[];
  action?: RouteAction;
  priority?: number;
  enabled?: boolean;
  flowData?: FlowData | null;
}, db?: Database) {
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.accessModelIds !== undefined) updateData.accessModelIds = data.accessModelIds;
  if (data.conditions !== undefined) updateData.conditions = data.conditions;
  if (data.action !== undefined) updateData.action = data.action;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.enabled !== undefined) updateData.enabled = data.enabled;
  if (data.flowData !== undefined) updateData.flowData = data.flowData;

  const database = db ?? getDatabase();
  const [updated] = await database
    .update(modelRoutes)
    .set(updateData)
    .where(eq(modelRoutes.id, id))
    .returning();
  return updated ?? null;
}

export async function deleteModelRoute(id: string, db?: Database) {
  const database = db ?? getDatabase();
  const [deleted] = await database
    .delete(modelRoutes)
    .where(eq(modelRoutes.id, id))
    .returning();
  return deleted ?? null;
}

export async function toggleModelRoute(id: string, db?: Database) {
  const database = db ?? getDatabase();
  const existing = await database
    .select()
    .from(modelRoutes)
    .where(eq(modelRoutes.id, id))
    .limit(1);

  if (existing.length === 0) return null;

  const [updated] = await database
    .update(modelRoutes)
    .set({ enabled: !existing[0].enabled, updatedAt: new Date() })
    .where(eq(modelRoutes.id, id))
    .returning();
  return updated ?? null;
}
