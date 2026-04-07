import { eq, and } from 'drizzle-orm';
import { Hono } from 'hono';

import { getDatabase } from '@/core/db/client';
import logger from '@/core/lib/logger';
import { authMiddleware } from '@/features/auth/middleware';
import { modelRoutes, virtualModels } from '@/features/model-groups/db';

const modelRoutesApi = new Hono();

modelRoutesApi.use('*', authMiddleware);

// GET /api/model-routes - 列表
modelRoutesApi.get('/', async (c) => {
  const db = getDatabase();
  const virtualModelId = c.req.query('virtualModelId');

  try {
    let query = db
      .select({
        id: modelRoutes.id,
        name: modelRoutes.name,
        description: modelRoutes.description,
        virtualModelId: modelRoutes.virtualModelId,
        conditions: modelRoutes.conditions,
        action: modelRoutes.action,
        priority: modelRoutes.priority,
        enabled: modelRoutes.enabled,
        flowData: modelRoutes.flowData,
        createdAt: modelRoutes.createdAt,
        updatedAt: modelRoutes.updatedAt,
        vmName: virtualModels.name,
        vmDisplayName: virtualModels.displayName,
      })
      .from(modelRoutes)
      .leftJoin(virtualModels, eq(modelRoutes.virtualModelId, virtualModels.id))
      .$dynamic();

    if (virtualModelId) {
      query = query.where(eq(modelRoutes.virtualModelId, virtualModelId));
    }

    const results = await query;

    const data = results.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      virtualModelId: r.virtualModelId,
      conditions: r.conditions,
      action: r.action,
      priority: r.priority,
      enabled: r.enabled,
      flowData: r.flowData,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      virtualModel: r.vmName ? { name: r.vmName, displayName: r.vmDisplayName } : null,
    }));

    return c.json({ success: true, data });
  } catch (error) {
    logger.error({ error }, 'Failed to list model routes');
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
        virtualModelId: modelRoutes.virtualModelId,
        conditions: modelRoutes.conditions,
        action: modelRoutes.action,
        priority: modelRoutes.priority,
        enabled: modelRoutes.enabled,
        flowData: modelRoutes.flowData,
      })
      .from(modelRoutes)
      .where(eq(modelRoutes.enabled, true));

    // 获取所有启用的虚拟模型作为起点节点
    const vms = await db
      .select({
        id: virtualModels.id,
        name: virtualModels.name,
        displayName: virtualModels.displayName,
      })
      .from(virtualModels)
      .where(eq(virtualModels.enabled, true));

    return c.json({ success: true, data: { routes, virtualModels: vms } });
  } catch (error) {
    logger.error({ error }, 'Failed to get flow data');
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
        virtualModelId: modelRoutes.virtualModelId,
        conditions: modelRoutes.conditions,
        action: modelRoutes.action,
        priority: modelRoutes.priority,
        enabled: modelRoutes.enabled,
        flowData: modelRoutes.flowData,
        createdAt: modelRoutes.createdAt,
        updatedAt: modelRoutes.updatedAt,
        vmName: virtualModels.name,
        vmDisplayName: virtualModels.displayName,
      })
      .from(modelRoutes)
      .leftJoin(virtualModels, eq(modelRoutes.virtualModelId, virtualModels.id))
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
        virtualModel: r.vmName ? { name: r.vmName, displayName: r.vmDisplayName } : null,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get model route');
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
        virtualModelId: data.virtualModelId || null,
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
    logger.error({ error }, 'Failed to create model route');
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
    if (data.virtualModelId !== undefined) updateData.virtualModelId = data.virtualModelId || null;
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
    logger.error({ error }, 'Failed to update model route');
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
    logger.error({ error }, 'Failed to delete model route');
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
    logger.error({ error }, 'Failed to toggle model route');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

export default modelRoutesApi;
