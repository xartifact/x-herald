import { eq, and } from 'drizzle-orm';
import { Hono } from 'hono';

import { getDatabase } from '@/core/db/client';
import rootLogger from '@/core/lib/logger';
import { authMiddleware } from '@/features/auth/middleware';
import { accessModels } from '@/features/model-groups/db';

import { CATCHALL_VM_NAME } from './constants';

const logger = rootLogger.child({ module: 'access-models' });

const accessModelRoutes = new Hono();

accessModelRoutes.use('*', authMiddleware);

// GET /api/access-models - 列表
accessModelRoutes.get('/', async (c) => {
  const db = getDatabase();

  try {
    const results = await db
      .select({
        id: accessModels.id,
        name: accessModels.name,
        displayName: accessModels.displayName,
        description: accessModels.description,
        enabled: accessModels.enabled,
        capabilities: accessModels.capabilities,
        createdAt: accessModels.createdAt,
        updatedAt: accessModels.updatedAt,
      })
      .from(accessModels);

    return c.json({ success: true, data: results });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to list access models');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// GET /api/access-models/:id - 详情
accessModelRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDatabase();

  try {
    const results = await db
      .select({
        id: accessModels.id,
        name: accessModels.name,
        displayName: accessModels.displayName,
        description: accessModels.description,
        enabled: accessModels.enabled,
        capabilities: accessModels.capabilities,
        createdAt: accessModels.createdAt,
        updatedAt: accessModels.updatedAt,
      })
      .from(accessModels)
      .where(eq(accessModels.id, id))
      .limit(1);

    if (results.length === 0) {
      return c.json({ success: false, error: 'Access model not found' }, 404);
    }

    return c.json({ success: true, data: results[0] });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get access model detail');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// POST /api/access-models - 创建
accessModelRoutes.post('/', async (c) => {
  const data = await c.req.json();
  const db = getDatabase();

  try {
    const [am] = await db
      .insert(accessModels)
      .values({
        name: data.name,
        displayName: data.displayName || null,
        description: data.description || null,
        enabled: data.enabled ?? true,
        capabilities: data.capabilities ?? null,
      })
      .returning();

    logger.info({ id: am.id, name: am.name }, 'Access model created');
    return c.json({ success: true, data: am }, 201);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to create access model');
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const status = msg.includes('unique') ? 409 : 500;
    return c.json({ success: false, error: msg }, status);
  }
});

// PUT /api/access-models/:id - 更新
accessModelRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  const db = getDatabase();

  try {
    const currentAm = await db
      .select({ name: accessModels.name })
      .from(accessModels)
      .where(eq(accessModels.id, id))
      .limit(1);

    if (currentAm.length === 0) {
      return c.json({ success: false, error: 'Access model not found' }, 404);
    }

    const isSystem = currentAm[0].name === CATCHALL_VM_NAME;

    if (isSystem && data.name !== undefined && data.name !== CATCHALL_VM_NAME) {
      return c.json({ success: false, error: 'System access model name cannot be changed' }, 403);
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (data.name !== undefined && !isSystem) updateData.name = data.name;
    if (data.displayName !== undefined) updateData.displayName = data.displayName;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if ('capabilities' in data) updateData.capabilities = data.capabilities ?? null;

    const [updated] = await db
      .update(accessModels)
      .set(updateData)
      .where(eq(accessModels.id, id))
      .returning();

    if (!updated) {
      return c.json({ success: false, error: 'Access model not found' }, 404);
    }

    return c.json({ success: true, data: updated });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to update access model');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// DELETE /api/access-models/:id - 删除
accessModelRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDatabase();

  try {
    const target = await db
      .select({ name: accessModels.name })
      .from(accessModels)
      .where(eq(accessModels.id, id))
      .limit(1);

    if (target.length === 0) {
      return c.json({ success: false, error: 'Access model not found' }, 404);
    }

    if (target[0].name === CATCHALL_VM_NAME) {
      return c.json({ success: false, error: 'System access model cannot be deleted' }, 403);
    }

    const [deleted] = await db
      .delete(accessModels)
      .where(eq(accessModels.id, id))
      .returning();

    return c.json({ success: true, data: deleted });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to delete access model');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// PATCH /api/access-models/:id/toggle - 切换启用
accessModelRoutes.patch('/:id/toggle', async (c) => {
  const id = c.req.param('id');
  const db = getDatabase();

  try {
    const existing = await db
      .select()
      .from(accessModels)
      .where(eq(accessModels.id, id))
      .limit(1);

    if (existing.length === 0) {
      return c.json({ success: false, error: 'Access model not found' }, 404);
    }

    const [updated] = await db
      .update(accessModels)
      .set({
        enabled: !existing[0].enabled,
        updatedAt: new Date(),
      })
      .where(eq(accessModels.id, id))
      .returning();

    return c.json({ success: true, data: updated });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to toggle access model');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

export default accessModelRoutes;
