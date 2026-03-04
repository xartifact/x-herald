import { Hono } from 'hono';
import { eq, and, sql, count } from 'drizzle-orm';
import { getDatabase } from '@/core/db/client';
import { virtualModels, modelGroups, modelMappings, modelInstances } from '@/features/model-groups/db';
import { providers } from '@/features/providers/db';
import { authMiddleware } from '@/features/auth/middleware';
import logger from '@/core/lib/logger';

const virtualModelRoutes = new Hono();

virtualModelRoutes.use('*', authMiddleware);

// GET /api/virtual-models - 列表（join model_groups + mappingCount）
virtualModelRoutes.get('/', async (c) => {
  const db = getDatabase();

  try {
    const results = await db
      .select({
        id: virtualModels.id,
        name: virtualModels.name,
        displayName: virtualModels.displayName,
        description: virtualModels.description,
        modelGroupId: virtualModels.modelGroupId,
        routingConfig: virtualModels.routingConfig,
        enabled: virtualModels.enabled,
        createdAt: virtualModels.createdAt,
        updatedAt: virtualModels.updatedAt,
        modelGroupName: modelGroups.name,
        modelGroupDisplayName: modelGroups.displayName,
        mappingCount: sql<number>`(SELECT count(*) FROM model_mappings WHERE model_mappings.virtual_model_id = ${virtualModels.id})`.as('mapping_count'),
      })
      .from(virtualModels)
      .leftJoin(modelGroups, eq(virtualModels.modelGroupId, modelGroups.id));

    const data = results.map((r) => ({
      id: r.id,
      name: r.name,
      displayName: r.displayName,
      description: r.description,
      modelGroupId: r.modelGroupId,
      routingConfig: r.routingConfig,
      enabled: r.enabled,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      modelGroup: r.modelGroupName
        ? { name: r.modelGroupName, displayName: r.modelGroupDisplayName }
        : null,
      mappingCount: Number(r.mappingCount),
    }));

    return c.json({ success: true, data });
  } catch (error) {
    logger.error({ error }, 'Failed to list virtual models');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// GET /api/virtual-models/:id - 详情（含完整 mappings）
virtualModelRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDatabase();

  try {
    // 查询虚拟模型基本信息
    const vmResults = await db
      .select({
        id: virtualModels.id,
        name: virtualModels.name,
        displayName: virtualModels.displayName,
        description: virtualModels.description,
        modelGroupId: virtualModels.modelGroupId,
        routingConfig: virtualModels.routingConfig,
        enabled: virtualModels.enabled,
        createdAt: virtualModels.createdAt,
        updatedAt: virtualModels.updatedAt,
        modelGroupName: modelGroups.name,
        modelGroupDisplayName: modelGroups.displayName,
      })
      .from(virtualModels)
      .leftJoin(modelGroups, eq(virtualModels.modelGroupId, modelGroups.id))
      .where(eq(virtualModels.id, id))
      .limit(1);

    if (vmResults.length === 0) {
      return c.json({ success: false, error: 'Virtual model not found' }, 404);
    }

    const vm = vmResults[0];

    // 查询映射列表
    const mappingRows = await db
      .select()
      .from(modelMappings)
      .where(eq(modelMappings.virtualModelId, id));

    // 解析映射目标详情
    const mappingsWithTarget = await Promise.all(
      mappingRows.map(async (m) => {
        let target: { name: string; displayName: string | null; providerName?: string; actualModelName?: string } | null = null;

        if (m.targetType === 'model_group') {
          const group = await db
            .select({ name: modelGroups.name, displayName: modelGroups.displayName })
            .from(modelGroups)
            .where(eq(modelGroups.id, m.targetId))
            .limit(1);
          target = group[0] || null;
        } else {
          const inst = await db
            .select({
              name: modelInstances.name,
              displayName: sql<string | null>`null`.as('display_name'),
              providerName: providers.name,
              actualModelName: modelInstances.actualModelName,
            })
            .from(modelInstances)
            .innerJoin(providers, eq(modelInstances.providerId, providers.id))
            .where(eq(modelInstances.id, m.targetId))
            .limit(1);
          target = inst[0] || null;
        }

        return {
          id: m.id,
          targetType: m.targetType,
          targetId: m.targetId,
          weight: m.weight,
          priority: m.priority,
          enabled: m.enabled,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
          target,
        };
      })
    );

    const data = {
      id: vm.id,
      name: vm.name,
      displayName: vm.displayName,
      description: vm.description,
      modelGroupId: vm.modelGroupId,
      routingConfig: vm.routingConfig,
      enabled: vm.enabled,
      createdAt: vm.createdAt,
      updatedAt: vm.updatedAt,
      modelGroup: vm.modelGroupName
        ? { name: vm.modelGroupName, displayName: vm.modelGroupDisplayName }
        : null,
      mappings: mappingsWithTarget,
    };

    return c.json({ success: true, data });
  } catch (error) {
    logger.error({ error }, 'Failed to get virtual model detail');
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
    // 如果提供了 modelGroupId，验证模型组存在
    if (data.modelGroupId) {
      const group = await db
        .select()
        .from(modelGroups)
        .where(eq(modelGroups.id, data.modelGroupId))
        .limit(1);

      if (group.length === 0) {
        return c.json({ success: false, error: 'Model group not found' }, 404);
      }
    }

    const [vm] = await db
      .insert(virtualModels)
      .values({
        name: data.name,
        displayName: data.displayName || null,
        description: data.description || null,
        modelGroupId: data.modelGroupId || null,
        routingConfig: data.routingConfig || null,
        enabled: data.enabled ?? true,
      })
      .returning();

    // 如果提供了 mappings，批量创建
    if (data.mappings?.length) {
      await db.insert(modelMappings).values(
        data.mappings.map((m: { targetType: string; targetId: string; weight?: number; priority?: number; enabled?: boolean }) => ({
          virtualModelId: vm.id,
          targetType: m.targetType,
          targetId: m.targetId,
          weight: m.weight ?? 100,
          priority: m.priority ?? 0,
          enabled: m.enabled ?? true,
        }))
      );
    }

    logger.info({ id: vm.id, name: vm.name }, 'Virtual model created');
    return c.json({ success: true, data: vm }, 201);
  } catch (error) {
    logger.error({ error }, 'Failed to create virtual model');
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
    // 如果更新了 modelGroupId，验证模型组存在
    if (data.modelGroupId) {
      const group = await db
        .select()
        .from(modelGroups)
        .where(eq(modelGroups.id, data.modelGroupId))
        .limit(1);

      if (group.length === 0) {
        return c.json({ success: false, error: 'Model group not found' }, 404);
      }
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.displayName !== undefined) updateData.displayName = data.displayName;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.modelGroupId !== undefined) updateData.modelGroupId = data.modelGroupId || null;
    if (data.routingConfig !== undefined) updateData.routingConfig = data.routingConfig;
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
    logger.error({ error }, 'Failed to update virtual model');
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
    logger.error({ error }, 'Failed to delete virtual model');
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
    logger.error({ error }, 'Failed to toggle virtual model');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// ==================== 映射 CRUD ====================

// POST /api/virtual-models/:id/mappings - 添加映射
virtualModelRoutes.post('/:id/mappings', async (c) => {
  const virtualModelId = c.req.param('id');
  const data = await c.req.json();
  const db = getDatabase();

  try {
    // 验证虚拟模型存在
    const vm = await db.select().from(virtualModels).where(eq(virtualModels.id, virtualModelId)).limit(1);
    if (vm.length === 0) {
      return c.json({ success: false, error: 'Virtual model not found' }, 404);
    }

    // 验证目标存在
    if (data.targetType === 'model_group') {
      const group = await db.select().from(modelGroups).where(eq(modelGroups.id, data.targetId)).limit(1);
      if (group.length === 0) {
        return c.json({ success: false, error: 'Target model group not found' }, 404);
      }
    } else if (data.targetType === 'model_instance') {
      const inst = await db.select().from(modelInstances).where(eq(modelInstances.id, data.targetId)).limit(1);
      if (inst.length === 0) {
        return c.json({ success: false, error: 'Target model instance not found' }, 404);
      }
    } else {
      return c.json({ success: false, error: 'Invalid targetType' }, 400);
    }

    const [mapping] = await db
      .insert(modelMappings)
      .values({
        virtualModelId,
        targetType: data.targetType,
        targetId: data.targetId,
        weight: data.weight ?? 100,
        priority: data.priority ?? 0,
        enabled: data.enabled ?? true,
      })
      .returning();

    return c.json({ success: true, data: mapping }, 201);
  } catch (error) {
    logger.error({ error }, 'Failed to add mapping');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// PUT /api/virtual-models/:id/mappings/:mappingId - 更新映射
virtualModelRoutes.put('/:id/mappings/:mappingId', async (c) => {
  const mappingId = c.req.param('mappingId');
  const data = await c.req.json();
  const db = getDatabase();

  try {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.weight !== undefined) updateData.weight = data.weight;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.enabled !== undefined) updateData.enabled = data.enabled;

    const [updated] = await db
      .update(modelMappings)
      .set(updateData)
      .where(eq(modelMappings.id, mappingId))
      .returning();

    if (!updated) {
      return c.json({ success: false, error: 'Mapping not found' }, 404);
    }

    return c.json({ success: true, data: updated });
  } catch (error) {
    logger.error({ error }, 'Failed to update mapping');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// DELETE /api/virtual-models/:id/mappings/:mappingId - 删除映射
virtualModelRoutes.delete('/:id/mappings/:mappingId', async (c) => {
  const mappingId = c.req.param('mappingId');
  const db = getDatabase();

  try {
    const [deleted] = await db
      .delete(modelMappings)
      .where(eq(modelMappings.id, mappingId))
      .returning();

    if (!deleted) {
      return c.json({ success: false, error: 'Mapping not found' }, 404);
    }

    return c.json({ success: true, data: deleted });
  } catch (error) {
    logger.error({ error }, 'Failed to delete mapping');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

export default virtualModelRoutes;
