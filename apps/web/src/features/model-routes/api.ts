import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { getDatabase } from '@/core/db/client';
import rootLogger from '@/core/lib/logger';

const logger = rootLogger.child({ module: 'model-routes' });
import { authMiddleware } from '@/features/auth/middleware';
import { modelRoutes, accessModels } from '@/features/model-groups/db';

const modelRoutesApi = new Hono();

modelRoutesApi.use('*', authMiddleware);

// GET /api/model-routes - 列表
modelRoutesApi.get('/', async (c) => {
  const db = getDatabase();
  const accessModelId = c.req.query('accessModelId') ?? c.req.query('virtualModelId');

  try {
    let query = db
      .select({
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
      })
      .from(modelRoutes)
      .$dynamic();

    if (accessModelId) {
      query = query.where(sql`${modelRoutes.accessModelIds} @> ARRAY[${accessModelId}]::text[]`);
    }

    const results = await query;

    const data = results.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      accessModelIds: r.accessModelIds,
      virtualModelIds: r.accessModelIds,
      conditions: r.conditions,
      action: r.action,
      priority: r.priority,
      enabled: r.enabled,
      flowData: r.flowData,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      virtualModel: null,
      accessModel: null,
    }));

    return c.json({ success: true, data });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to list model routes');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// GET /api/model-routes/flow - 获取全局 Flow 数据
modelRoutesApi.get('/flow', async (c) => {
  const db = getDatabase();

  try {
    const routes = await db
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

    const ams = await db
      .select({
        id: accessModels.id,
        name: accessModels.name,
        displayName: accessModels.displayName,
      })
      .from(accessModels)
      .where(eq(accessModels.enabled, true));

    return c.json({ success: true, data: { routes, accessModels: ams, virtualModels: ams } });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get flow data');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// GET /api/model-routes/:id - 详情
modelRoutesApi.get('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDatabase();

  try {
    const results = await db
      .select({
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
      })
      .from(modelRoutes)
      .where(eq(modelRoutes.id, id))
      .limit(1);

    if (results.length === 0) {
      return c.json({ success: false, error: 'Route not found' }, 404);
    }

    const r = results[0];
    return c.json({
      success: true,
      data: {
        ...r,
        virtualModelIds: r.accessModelIds,
        virtualModel: null,
        accessModel: null,
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get model route');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// POST /api/model-routes - 创建
modelRoutesApi.post('/', async (c) => {
  const data = await c.req.json();
  const db = getDatabase();

  try {
    const [route] = await db
      .insert(modelRoutes)
      .values({
        name: data.name,
        description: data.description || null,
        accessModelIds: data.accessModelIds ?? data.virtualModelIds ?? [],
        conditions: data.conditions || [],
        action: data.action,
        priority: data.priority ?? 0,
        enabled: data.enabled ?? true,
        flowData: data.flowData || null,
      })
      .returning();

    logger.info({ id: route.id, name: route.name }, 'Model route created');
    return c.json({ success: true, data: route }, 201);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to create model route');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// PUT /api/model-routes/:id - 更新
modelRoutesApi.put('/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  const db = getDatabase();

  try {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.accessModelIds !== undefined) updateData.accessModelIds = data.accessModelIds ?? [];
    else if (data.virtualModelIds !== undefined) updateData.accessModelIds = data.virtualModelIds ?? [];
    if (data.conditions !== undefined) updateData.conditions = data.conditions;
    if (data.action !== undefined) updateData.action = data.action;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if (data.flowData !== undefined) updateData.flowData = data.flowData;

    const [updated] = await db
      .update(modelRoutes)
      .set(updateData)
      .where(eq(modelRoutes.id, id))
      .returning();

    if (!updated) {
      return c.json({ success: false, error: 'Route not found' }, 404);
    }

    return c.json({ success: true, data: updated });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to update model route');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// DELETE /api/model-routes/:id - 删除
modelRoutesApi.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDatabase();

  try {
    const [deleted] = await db
      .delete(modelRoutes)
      .where(eq(modelRoutes.id, id))
      .returning();

    if (!deleted) {
      return c.json({ success: false, error: 'Route not found' }, 404);
    }

    return c.json({ success: true, data: deleted });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to delete model route');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// PATCH /api/model-routes/:id/toggle - 切换启用
modelRoutesApi.patch('/:id/toggle', async (c) => {
  const id = c.req.param('id');
  const db = getDatabase();

  try {
    const existing = await db
      .select()
      .from(modelRoutes)
      .where(eq(modelRoutes.id, id))
      .limit(1);

    if (existing.length === 0) {
      return c.json({ success: false, error: 'Route not found' }, 404);
    }

    const [updated] = await db
      .update(modelRoutes)
      .set({
        enabled: !existing[0].enabled,
        updatedAt: new Date(),
      })
      .where(eq(modelRoutes.id, id))
      .returning();

    return c.json({ success: true, data: updated });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to toggle model route');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

export default modelRoutesApi;
