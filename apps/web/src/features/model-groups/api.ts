import { eq, desc, asc, inArray } from 'drizzle-orm';
import { Hono } from 'hono';

import { getDatabase } from '@/core/db/client';
import rootLogger from '@/core/lib/logger';

const logger = rootLogger.child({ module: 'model-groups' });
import { authMiddleware } from '@/features/auth/middleware';
import { modelGroupRouter } from '@/features/gateway/services/model-group-router';
import { providers } from '@/features/providers/db';

import { modelGroups, modelInstances, modelGroupMemberships } from './db';

const modelGroupRoutes = new Hono();

// 应用认证中间件
modelGroupRoutes.use('*', authMiddleware);

// ==================== 辅助函数 ====================

/** 批量查询实例的所属组列表，返回 instanceId → groupId[] */
async function fetchGroupIdsByInstanceIds(
  db: ReturnType<typeof getDatabase>,
  instanceIds: string[]
): Promise<Map<string, string[]>> {
  if (instanceIds.length === 0) return new Map();
  const rows = await db
    .select({ instanceId: modelGroupMemberships.instanceId, groupId: modelGroupMemberships.groupId })
    .from(modelGroupMemberships)
    .where(inArray(modelGroupMemberships.instanceId, instanceIds));
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.instanceId) ?? [];
    list.push(row.groupId);
    map.set(row.instanceId, list);
  }
  return map;
}

/** 将 groupIds 数组注入实例对象，兼容字段 groupId 取第一个值 */
function attachGroupIds<T extends { id: string }>(
  instances: T[],
  groupIdsMap: Map<string, string[]>
): Array<T & { groupIds: string[]; groupId: string | null }> {
  return instances.map((inst) => {
    const groupIds = groupIdsMap.get(inst.id) ?? [];
    return { ...inst, groupIds, groupId: groupIds[0] ?? null };
  });
}

/** 全量替换实例的组成员关系 */
async function setInstanceGroups(
  db: ReturnType<typeof getDatabase>,
  instanceId: string,
  groupIds: string[]
): Promise<void> {
  await db.delete(modelGroupMemberships).where(eq(modelGroupMemberships.instanceId, instanceId));
  if (groupIds.length > 0) {
    await db.insert(modelGroupMemberships).values(
      groupIds.map((gid) => ({ groupId: gid, instanceId }))
    );
  }
}

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
    const instances = await db
      .select()
      .from(modelInstances)
      .orderBy(asc(modelInstances.priority), asc(modelInstances.createdAt));

    const groupIdsMap = await fetchGroupIdsByInstanceIds(db, instances.map((i) => i.id));

    return c.json({
      success: true,
      data: attachGroupIds(instances, groupIdsMap),
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to list model instances');
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
        supportedProtocols: data.supportedProtocols || ['openai'],
        routingConfig: data.routingConfig,
        metadata: data.metadata,
      })
      .returning();

    logger.info({ groupId: group.id, name: group.name }, 'Model group created');

    return c.json({ success: true, data: group }, 201);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to create model group');
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
        supportedProtocols: data.supportedProtocols,
        routingConfig: data.routingConfig,
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
    logger.warn({ err: error }, 'Failed to update model group');
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
    logger.warn({ err: error }, 'Failed to delete model group');
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
    logger.warn({ err: error }, 'Failed to toggle model group');
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
    logger.warn({ err: error }, 'Failed to reorder model instances');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

/**
 * 创建模型实例
 * 接受 groupIds?: string[]（多组），兼容旧的 groupId?: string
 */
modelGroupRoutes.post('/instances', async (c) => {
  const data = await c.req.json();
  const db = getDatabase();

  // 向后兼容：如果只传了 groupId，转为 groupIds
  const groupIds: string[] = Array.isArray(data.groupIds)
    ? data.groupIds
    : data.groupId
      ? [data.groupId]
      : [];

  try {
    // 验证所有模型组存在
    if (groupIds.length > 0) {
      const groups = await db
        .select({ id: modelGroups.id })
        .from(modelGroups)
        .where(inArray(modelGroups.id, groupIds));
      if (groups.length !== groupIds.length) {
        return c.json({ success: false, error: 'One or more model groups not found' }, 404);
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

    // 写入组成员关系
    if (groupIds.length > 0) {
      await db.insert(modelGroupMemberships).values(
        groupIds.map((gid) => ({ groupId: gid, instanceId: instance.id }))
      );
    }

    logger.info(
      { instanceId: instance.id, groupIds, providerId: data.providerId },
      'Model instance created'
    );

    return c.json({
      success: true,
      data: { ...instance, groupIds, groupId: groupIds[0] ?? null },
    }, 201);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to create model instance');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

/**
 * 更新模型实例（不更新组关系，组关系通过 PUT /instances/:id/groups 管理）
 */
modelGroupRoutes.put('/instances/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  const db = getDatabase();

  try {
    const [updated] = await db
      .update(modelInstances)
      .set({
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

    // 如果请求体包含 groupIds，同步更新组关系
    if (data.groupIds !== undefined || data.groupId !== undefined) {
      const groupIds: string[] = Array.isArray(data.groupIds)
        ? data.groupIds
        : data.groupId !== undefined
          ? (data.groupId ? [data.groupId] : [])
          : [];
      await setInstanceGroups(db, id, groupIds);
    }

    const groupIdsMap = await fetchGroupIdsByInstanceIds(db, [id]);
    return c.json({ success: true, data: attachGroupIds([updated], groupIdsMap)[0] });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to update model instance');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

/**
 * 设置实例的组列表（全量替换）
 */
modelGroupRoutes.put('/instances/:id/groups', async (c) => {
  const id = c.req.param('id');
  const { groupIds } = await c.req.json<{ groupIds: string[] }>();
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

    const resolvedGroupIds = groupIds ?? [];

    if (resolvedGroupIds.length > 0) {
      const groups = await db
        .select({ id: modelGroups.id })
        .from(modelGroups)
        .where(inArray(modelGroups.id, resolvedGroupIds));
      if (groups.length !== resolvedGroupIds.length) {
        return c.json({ success: false, error: 'One or more model groups not found' }, 404);
      }
    }

    await setInstanceGroups(db, id, resolvedGroupIds);

    logger.info({ instanceId: id, groupIds: resolvedGroupIds }, 'Instance groups updated');
    return c.json({
      success: true,
      data: { ...instance[0], groupIds: resolvedGroupIds, groupId: resolvedGroupIds[0] ?? null },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to set instance groups');
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
    logger.warn({ err: error }, 'Failed to delete model instance');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

/**
 * 分配模型实例到模型组（向后兼容，委托给 PUT /groups 逻辑）
 * @deprecated 请使用 PUT /instances/:id/groups
 */
modelGroupRoutes.patch('/instances/:id/assign', async (c) => {
  const id = c.req.param('id');
  const { groupId } = await c.req.json<{ groupId: string | null }>();
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

    if (groupId) {
      const group = await db
        .select({ id: modelGroups.id })
        .from(modelGroups)
        .where(eq(modelGroups.id, groupId))
        .limit(1);
      if (group.length === 0) {
        return c.json({ success: false, error: 'Model group not found' }, 404);
      }
    }

    // 单组分配：全量替换为 [groupId] 或 []
    const groupIds = groupId ? [groupId] : [];
    await setInstanceGroups(db, id, groupIds);

    return c.json({
      success: true,
      data: { ...instance[0], groupIds, groupId: groupId ?? null },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to assign model instance');
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

    const groupIdsMap = await fetchGroupIdsByInstanceIds(db, [id]);
    return c.json({ success: true, data: attachGroupIds([updated], groupIdsMap)[0] });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to toggle model instance');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

export default modelGroupRoutes;
