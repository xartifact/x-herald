import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { getDatabase } from '@/core/db/client';
import { modelGroups, modelInstances } from './db';
import { providers } from '@/features/providers/db';
import { authMiddleware } from '@/features/auth/middleware';
import { modelGroupRouter } from '@/features/gateway/services/model-group-router';
import logger from '@/core/lib/logger';

const modelGroupRoutes = new Hono();

// 应用认证中间件
modelGroupRoutes.use('*', authMiddleware);

// ==================== 模型组 CRUD ====================

/**
 * 获取所有模型组列表
 */
modelGroupRoutes.get('/', async (c) => {
  const db = getDatabase();
  const groups = await db.select().from(modelGroups).orderBy(desc(modelGroups.createdAt));

  return c.json({
    success: true,
    data: groups,
  });
});

// ==================== 模型实例管理（必须在 /:id 之前）====================

/**
 * 获取所有模型实例列表（跨所有模型组）
 */
modelGroupRoutes.get('/instances', async (c) => {
  const db = getDatabase();

  try {
    const instances = await db.select().from(modelInstances).orderBy(desc(modelInstances.createdAt));

    return c.json({
      success: true,
      data: instances,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to list model instances');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// ==================== 模型组详情（放在 /instances 之后）====================

/**
 * 获取单个模型组详情（包含实例）
 */
modelGroupRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const detail = await modelGroupRouter.getModelGroupDetail(id);

  if (!detail) {
    return c.json({ success: false, error: 'Model group not found' }, 404);
  }

  return c.json({
    success: true,
    data: detail,
  });
});

/**
 * 创建模型组
 */
modelGroupRoutes.post('/', async (c) => {
  const data = await c.req.json();
  const db = getDatabase();

  try {
    const [group] = await db
      .insert(modelGroups)
      .values({
        name: data.name,
        aliases: data.aliases || [],
        displayName: data.displayName,
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
        routingConfig: data.routingConfig || {
          strategy: 'round_robin',
          fallbackEnabled: true,
        },
        supportedProtocols: data.supportedProtocols || ['openai'],
        metadata: data.metadata,
      })
      .returning();

    logger.info({ groupId: group.id, name: group.name }, 'Model group created');

    return c.json({ success: true, data: group }, 201);
  } catch (error) {
    logger.error({ error }, 'Failed to create model group');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

/**
 * 更新模型组
 */
modelGroupRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  const db = getDatabase();

  try {
    const [updated] = await db
      .update(modelGroups)
      .set({
        name: data.name,
        aliases: data.aliases,
        displayName: data.displayName,
        description: data.description,
        category: data.category,
        capabilities: data.capabilities,
        routingConfig: data.routingConfig,
        supportedProtocols: data.supportedProtocols,
        metadata: data.metadata,
        updatedAt: new Date(),
      })
      .where(eq(modelGroups.id, id))
      .returning();

    if (!updated) {
      return c.json({ success: false, error: 'Model group not found' }, 404);
    }

    return c.json({ success: true, data: updated });
  } catch (error) {
    logger.error({ error }, 'Failed to update model group');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

/**
 * 删除模型组
 */
modelGroupRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDatabase();

  try {
    const [deleted] = await db
      .delete(modelGroups)
      .where(eq(modelGroups.id, id))
      .returning();

    if (!deleted) {
      return c.json({ success: false, error: 'Model group not found' }, 404);
    }

    return c.json({ success: true, data: deleted });
  } catch (error) {
    logger.error({ error }, 'Failed to delete model group');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

/**
 * 切换模型组启用状态
 */
modelGroupRoutes.patch('/:id/toggle', async (c) => {
  const id = c.req.param('id');
  const db = getDatabase();

  try {
    const group = await db.select().from(modelGroups).where(eq(modelGroups.id, id)).limit(1);

    if (group.length === 0) {
      return c.json({ success: false, error: 'Model group not found' }, 404);
    }

    const [updated] = await db
      .update(modelGroups)
      .set({
        enabled: !group[0].enabled,
        updatedAt: new Date(),
      })
      .where(eq(modelGroups.id, id))
      .returning();

    return c.json({ success: true, data: updated });
  } catch (error) {
    logger.error({ error }, 'Failed to toggle model group');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// ==================== 模型实例管理 ====================

/**
 * 批量更新模型实例优先级（重新排序）
 */
modelGroupRoutes.put('/instances/reorder', async (c) => {
  const { instanceIds } = await c.req.json<{ instanceIds: string[] }>();
  const db = getDatabase();

  try {
    for (let i = 0; i < instanceIds.length; i++) {
      await db
        .update(modelInstances)
        .set({ priority: i, updatedAt: new Date() })
        .where(eq(modelInstances.id, instanceIds[i]));
    }

    return c.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to reorder model instances');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

/**
 * 创建模型实例
 */
modelGroupRoutes.post('/instances', async (c) => {
  const data = await c.req.json();
  const db = getDatabase();

  try {
    // 验证模型组是否存在（如果提供了 groupId）
    if (data.groupId) {
      const group = await db
        .select()
        .from(modelGroups)
        .where(eq(modelGroups.id, data.groupId))
        .limit(1);

      if (group.length === 0) {
        return c.json({ success: false, error: 'Model group not found' }, 404);
      }
    }

    // 验证供应商是否存在
    const provider = await db
      .select()
      .from(providers)
      .where(eq(providers.id, data.providerId))
      .limit(1);

    if (provider.length === 0) {
      return c.json({ success: false, error: 'Provider not found' }, 404);
    }

    const [instance] = await db
      .insert(modelInstances)
      .values({
        groupId: data.groupId || null,
        providerId: data.providerId,
        name: data.name,
        actualModelName: data.actualModelName,
        description: data.description,
        weight: data.weight ?? 100,
        priority: data.priority ?? 0,
        costPer1kTokens: data.costPer1kTokens,
        config: data.config,
      })
      .returning();

    logger.info(
      { instanceId: instance.id, groupId: data.groupId, providerId: data.providerId },
      'Model instance created'
    );

    return c.json({ success: true, data: instance }, 201);
  } catch (error) {
    logger.error({ error }, 'Failed to create model instance');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

/**
 * 更新模型实例
 */
modelGroupRoutes.put('/instances/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  const db = getDatabase();

  try {
    const [updated] = await db
      .update(modelInstances)
      .set({
        groupId: data.groupId,
        providerId: data.providerId,
        name: data.name,
        actualModelName: data.actualModelName,
        description: data.description,
        weight: data.weight,
        priority: data.priority,
        costPer1kTokens: data.costPer1kTokens,
        config: data.config,
        updatedAt: new Date(),
      })
      .where(eq(modelInstances.id, id))
      .returning();

    if (!updated) {
      return c.json({ success: false, error: 'Model instance not found' }, 404);
    }

    return c.json({ success: true, data: updated });
  } catch (error) {
    logger.error({ error }, 'Failed to update model instance');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

/**
 * 删除模型实例
 */
modelGroupRoutes.delete('/instances/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDatabase();

  try {
    const [deleted] = await db
      .delete(modelInstances)
      .where(eq(modelInstances.id, id))
      .returning();

    if (!deleted) {
      return c.json({ success: false, error: 'Model instance not found' }, 404);
    }

    return c.json({ success: true, data: deleted });
  } catch (error) {
    logger.error({ error }, 'Failed to delete model instance');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

/**
 * 分配模型实例到模型组
 */
modelGroupRoutes.patch('/instances/:id/assign', async (c) => {
  const id = c.req.param('id');
  const { groupId } = await c.req.json<{ groupId: string | null }>();
  const db = getDatabase();

  try {
    // 验证实例存在
    const instance = await db
      .select()
      .from(modelInstances)
      .where(eq(modelInstances.id, id))
      .limit(1);

    if (instance.length === 0) {
      return c.json({ success: false, error: 'Model instance not found' }, 404);
    }

    // 如果有 groupId，验证模型组存在
    if (groupId) {
      const group = await db
        .select()
        .from(modelGroups)
        .where(eq(modelGroups.id, groupId))
        .limit(1);

      if (group.length === 0) {
        return c.json({ success: false, error: 'Model group not found' }, 404);
      }
    }

    const [updated] = await db
      .update(modelInstances)
      .set({ groupId: groupId || null, updatedAt: new Date() })
      .where(eq(modelInstances.id, id))
      .returning();

    return c.json({ success: true, data: updated });
  } catch (error) {
    logger.error({ error }, 'Failed to assign model instance');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

/**
 * 切换模型实例启用状态
 */
modelGroupRoutes.patch('/instances/:id/toggle', async (c) => {
  const id = c.req.param('id');
  const db = getDatabase();

  try {
    const instance = await db
      .select()
      .from(modelInstances)
      .where(eq(modelInstances.id, id))
      .limit(1);

    if (instance.length === 0) {
      return c.json({ success: false, error: 'Model instance not found' }, 404);
    }

    const [updated] = await db
      .update(modelInstances)
      .set({
        enabled: !instance[0].enabled,
        updatedAt: new Date(),
      })
      .where(eq(modelInstances.id, id))
      .returning();

    return c.json({ success: true, data: updated });
  } catch (error) {
    logger.error({ error }, 'Failed to toggle model instance');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

export default modelGroupRoutes;
