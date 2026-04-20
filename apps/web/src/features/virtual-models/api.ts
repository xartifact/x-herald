import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { getDatabase } from '@/core/db/client';
import rootLogger from '@/core/lib/logger';

const logger = rootLogger.child({ module: 'virtual-models' });
import { authMiddleware } from '@/features/auth/middleware';
import { virtualModels } from '@/features/model-groups/db';

const virtualModelRoutes = new Hono();

virtualModelRoutes.use('*', authMiddleware);

// GET /api/virtual-models - 列表
virtualModelRoutes.get('/', async (c) => {
  const db = getDatabase();

  try {
    const results = await db
      .select({
        id: virtualModels.id,
        name: virtualModels.name,
        displayName: virtualModels.displayName,
        description: virtualModels.description,
        enabled: virtualModels.enabled,
        createdAt: virtualModels.createdAt,
        updatedAt: virtualModels.updatedAt,
      })
      .from(virtualModels);

    return c.json({ success: true, data: results });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to list virtual models');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// GET /api/virtual-models/:id - 详情
virtualModelRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDatabase();

  try {
    const results = await db
      .select({
        id: virtualModels.id,
        name: virtualModels.name,
        displayName: virtualModels.displayName,
        description: virtualModels.description,
        enabled: virtualModels.enabled,
        createdAt: virtualModels.createdAt,
        updatedAt: virtualModels.updatedAt,
      })
      .from(virtualModels)
      .where(eq(virtualModels.id, id))
      .limit(1);

    if (results.length === 0) {
      return c.json({ success: false, error: 'Virtual model not found' }, 404);
    }

    return c.json({ success: true, data: results[0] });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get virtual model detail');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// POST /api/virtual-models - 创建
virtualModelRoutes.post('/', async (c) => {
  const data = await c.req.json();
  const db = getDatabase();

  try {
    const [vm] = await db
      .insert(virtualModels)
      .values({
        name: data.name,
        displayName: data.displayName || null,
        description: data.description || null,
        enabled: data.enabled ?? true,
      })
      .returning();

    logger.info({ id: vm.id, name: vm.name }, 'Virtual model created');
    return c.json({ success: true, data: vm }, 201);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to create virtual model');
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const status = msg.includes('unique') ? 409 : 500;
    return c.json({ success: false, error: msg }, status);
  }
});

// PUT /api/virtual-models/:id - 更新
virtualModelRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  const db = getDatabase();

  try {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.displayName !== undefined) updateData.displayName = data.displayName;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.enabled !== undefined) updateData.enabled = data.enabled;

    const [updated] = await db
      .update(virtualModels)
      .set(updateData)
      .where(eq(virtualModels.id, id))
      .returning();

    if (!updated) {
      return c.json({ success: false, error: 'Virtual model not found' }, 404);
    }

    return c.json({ success: true, data: updated });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to update virtual model');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// DELETE /api/virtual-models/:id - 删除
virtualModelRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDatabase();

  try {
    const [deleted] = await db
      .delete(virtualModels)
      .where(eq(virtualModels.id, id))
      .returning();

    if (!deleted) {
      return c.json({ success: false, error: 'Virtual model not found' }, 404);
    }

    return c.json({ success: true, data: deleted });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to delete virtual model');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// PATCH /api/virtual-models/:id/toggle - 切换启用
virtualModelRoutes.patch('/:id/toggle', async (c) => {
  const id = c.req.param('id');
  const db = getDatabase();

  try {
    const existing = await db
      .select()
      .from(virtualModels)
      .where(eq(virtualModels.id, id))
      .limit(1);

    if (existing.length === 0) {
      return c.json({ success: false, error: 'Virtual model not found' }, 404);
    }

    const [updated] = await db
      .update(virtualModels)
      .set({
        enabled: !existing[0].enabled,
        updatedAt: new Date(),
      })
      .where(eq(virtualModels.id, id))
      .returning();

    return c.json({ success: true, data: updated });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to toggle virtual model');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

export default virtualModelRoutes;
