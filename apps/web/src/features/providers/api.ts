import { eq, and, desc } from 'drizzle-orm';
import { Hono } from 'hono';

import { getDatabase } from '@/core/db/client';
import rootLogger from '@/core/lib/logger';

const logger = rootLogger.child({ module: 'providers' });
import { authMiddleware } from '@/features/auth/middleware';
import { modelInstances } from '@/features/model-groups/db';

import { providers, type NewProvider, type ProtocolsConfig } from './db';


const providersRoutes = new Hono();

// 所有路由都需要认证
providersRoutes.use('*', authMiddleware);

// GET /api/providers - 列出所有供应商
providersRoutes.get('/', async (c) => {
  try {
    const db = getDatabase();
    const allProviders = await db.select().from(providers).orderBy(desc(providers.createdAt));

    return c.json({
      success: true,
      data: allProviders,
      total: allProviders.length,
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to list providers');
    return c.json(
      {
        error: 'Failed to list providers',
        code: 'PROVIDERS_LIST_ERROR',
      },
      500
    );
  }
});

// GET /api/providers/:id - 获取供应商详情
providersRoutes.get('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const db = getDatabase();

    const provider = await db
      .select()
      .from(providers)
      .where(eq(providers.id, id))
      .limit(1);

    if (!provider || provider.length === 0) {
      return c.json(
        {
          error: 'Provider not found',
          code: 'PROVIDER_NOT_FOUND',
        },
        404
      );
    }

    return c.json({
      success: true,
      data: provider[0],
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get provider');
    return c.json(
      {
        error: 'Failed to get provider',
        code: 'PROVIDER_GET_ERROR',
      },
      500
    );
  }
});

// POST /api/providers - 创建供应商
providersRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();

    // 验证必填字段
    if (!body.name) {
      return c.json(
        {
          error: 'Missing required field: name',
          code: 'VALIDATION_ERROR',
        },
        400
      );
    }

    // 验证 protocols 字段
    if (!body.protocols || typeof body.protocols !== 'object') {
      return c.json(
        {
          error: 'Missing or invalid protocols field',
          code: 'VALIDATION_ERROR',
        },
        400
      );
    }

    // 验证至少有一个协议配置
    const protocolKeys = Object.keys(body.protocols);
    if (protocolKeys.length === 0) {
      return c.json(
        {
          error: 'At least one protocol must be configured',
          code: 'VALIDATION_ERROR',
        },
        400
      );
    }

    // 验证每个协议配置的格式
    for (const [protocol, config] of Object.entries(body.protocols)) {
      if (!config || typeof config !== 'object') {
        return c.json(
          {
            error: `Invalid protocol configuration for ${protocol}`,
            code: 'VALIDATION_ERROR',
          },
          400
        );
      }
      const cfg = config as any;
      if (!cfg.baseUrl || typeof cfg.baseUrl !== 'string') {
        return c.json(
          {
            error: `Missing or invalid baseUrl for protocol ${protocol}`,
            code: 'VALIDATION_ERROR',
          },
          400
        );
      }
      if (typeof cfg.enabled !== 'boolean') {
        return c.json(
          {
            error: `Missing or invalid enabled flag for protocol ${protocol}`,
            code: 'VALIDATION_ERROR',
          },
          400
        );
      }
    }

    const db = getDatabase();

    const newProvider: NewProvider = {
      name: body.name,
      protocols: body.protocols,
      apiKey: body.apiKey || null,
      enabled: body.enabled !== undefined ? body.enabled : true,
    };

    const result = await db.insert(providers).values(newProvider).returning();

    logger.info({ providerId: result[0].id }, 'Provider created');

    return c.json(
      {
        success: true,
        data: result[0],
      },
      201
    );
  } catch (error) {
    logger.warn({ err: error }, 'Failed to create provider');
    return c.json(
      {
        error: 'Failed to create provider',
        code: 'PROVIDER_CREATE_ERROR',
      },
      500
    );
  }
});

// PUT /api/providers/:id - 更新供应商
providersRoutes.put('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const body = await c.req.json();
    const db = getDatabase();

    // 检查供应商是否存在
    const existing = await db
      .select()
      .from(providers)
      .where(eq(providers.id, id))
      .limit(1);

    if (!existing || existing.length === 0) {
      return c.json(
        {
          error: 'Provider not found',
          code: 'PROVIDER_NOT_FOUND',
        },
        404
      );
    }

    // 验证 protocols 字段（如果提供）
    if (body.protocols !== undefined) {
      if (typeof body.protocols !== 'object') {
        return c.json(
          {
            error: 'Invalid protocols field',
            code: 'VALIDATION_ERROR',
          },
          400
        );
      }

      // 验证每个协议配置的格式
      for (const [protocol, config] of Object.entries(body.protocols)) {
        if (!config || typeof config !== 'object') {
          return c.json(
            {
              error: `Invalid protocol configuration for ${protocol}`,
              code: 'VALIDATION_ERROR',
            },
            400
          );
        }
        const cfg = config as any;
        if (!cfg.baseUrl || typeof cfg.baseUrl !== 'string') {
          return c.json(
            {
              error: `Missing or invalid baseUrl for protocol ${protocol}`,
              code: 'VALIDATION_ERROR',
            },
            400
          );
        }
        if (typeof cfg.enabled !== 'boolean') {
          return c.json(
            {
              error: `Missing or invalid enabled flag for protocol ${protocol}`,
              code: 'VALIDATION_ERROR',
            },
            400
          );
        }
      }
    }

    // 构建更新数据
    const updateData: Partial<NewProvider> & { updatedAt: Date } = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.protocols !== undefined) updateData.protocols = body.protocols;
    if (body.apiKey !== undefined) updateData.apiKey = body.apiKey;
    if (body.enabled !== undefined) updateData.enabled = body.enabled;

    const result = await db
      .update(providers)
      .set(updateData)
      .where(eq(providers.id, id))
      .returning();

    logger.info({ providerId: id }, 'Provider updated');

    return c.json({
      success: true,
      data: result[0],
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to update provider');
    return c.json(
      {
        error: 'Failed to update provider',
        code: 'PROVIDER_UPDATE_ERROR',
      },
      500
    );
  }
});

// DELETE /api/providers/:id - 删除供应商
providersRoutes.delete('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const db = getDatabase();

    // 检查供应商是否存在
    const existing = await db
      .select()
      .from(providers)
      .where(eq(providers.id, id))
      .limit(1);

    if (!existing || existing.length === 0) {
      return c.json(
        {
          error: 'Provider not found',
          code: 'PROVIDER_NOT_FOUND',
        },
        404
      );
    }

    await db.delete(providers).where(eq(providers.id, id));

    logger.info({ providerId: id }, 'Provider deleted');

    return c.json({
      success: true,
      message: 'Provider deleted successfully',
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to delete provider');
    return c.json(
      {
        error: 'Failed to delete provider',
        code: 'PROVIDER_DELETE_ERROR',
      },
      500
    );
  }
});

// PATCH /api/providers/:id/toggle - 切换启用状态
providersRoutes.patch('/:id/toggle', async (c) => {
  try {
    const { id } = c.req.param();
    const db = getDatabase();

    const [existing] = await db.select().from(providers).where(eq(providers.id, id)).limit(1);
    if (!existing) {
      return c.json({ error: 'Provider not found', code: 'PROVIDER_NOT_FOUND' }, 404);
    }

    const [updated] = await db
      .update(providers)
      .set({ enabled: !existing.enabled, updatedAt: new Date() })
      .where(eq(providers.id, id))
      .returning();

    logger.info({ providerId: id, enabled: updated.enabled }, 'Provider toggled');
    return c.json({ success: true, data: updated });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to toggle provider');
    return c.json({ error: 'Failed to toggle provider', code: 'PROVIDER_TOGGLE_ERROR' }, 500);
  }
});

// GET /api/providers/:id/thinking-type-mappings - 获取 thinking 类型映射
providersRoutes.get('/:id/thinking-type-mappings', async (c) => {
  try {
    const { id } = c.req.param();
    const db = getDatabase();

    const provider = await db
      .select()
      .from(providers)
      .where(eq(providers.id, id))
      .limit(1);

    if (!provider || provider.length === 0) {
      return c.json(
        { error: 'Provider not found', code: 'PROVIDER_NOT_FOUND' },
        404
      );
    }

    const currentProtocols = (provider[0].protocols ?? {}) as ProtocolsConfig;
    const anthropicConfig = currentProtocols?.anthropic;
    const mappings = anthropicConfig?.thinkingMapping?.mappings || {};

    const mappingArray = Object.entries(mappings).map(([from, to]) => ({
      from,
      to,
    }));

    return c.json({
      success: true,
      data: mappingArray,
      syntheticThinking: anthropicConfig?.syntheticThinking ?? 'strip',
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get thinking type mappings');
    return c.json(
      { error: 'Failed to get thinking type mappings', code: 'MAPPINGS_GET_ERROR' },
      500
    );
  }
});

// PUT /api/providers/:id/thinking-type-mappings - 更新 thinking 类型映射
providersRoutes.put('/:id/thinking-type-mappings', async (c) => {
  try {
    const { id } = c.req.param();
    const body = await c.req.json();
    const db = getDatabase();

    const provider = await db
      .select()
      .from(providers)
      .where(eq(providers.id, id))
      .limit(1);

    if (!provider || provider.length === 0) {
      return c.json(
        { error: 'Provider not found', code: 'PROVIDER_NOT_FOUND' },
        404
      );
    }

    const mappings: Record<string, string> = {};
    if (body.mappings && Array.isArray(body.mappings)) {
      for (const mapping of body.mappings) {
        if (mapping.from && mapping.to) {
          mappings[mapping.from] = mapping.to;
        }
      }
    }

    // 解析 syntheticThinking 策略
    const syntheticThinking = body.syntheticThinking === 'inject' ? 'inject' as const : 'strip' as const;

    const currentProtocols = (provider[0].protocols ?? {}) as ProtocolsConfig;
    const currentAnthropic = currentProtocols.anthropic;
    const updatedProtocols: ProtocolsConfig = {
      ...currentProtocols,
      anthropic: {
        ...currentAnthropic,
        baseUrl: currentAnthropic?.baseUrl ?? '',
        enabled: currentAnthropic?.enabled ?? true,
        thinkingMapping: {
          enabled: Object.keys(mappings).length > 0,
          mappings,
        },
        syntheticThinking,
      },
    };

    await db
      .update(providers)
      .set({
        protocols: updatedProtocols,
        updatedAt: new Date(),
      })
      .where(eq(providers.id, id));

    logger.info({ providerId: id, mappings }, 'Thinking type mappings updated');

    return c.json({
      success: true,
      message: 'Thinking type mappings updated successfully',
      data: Object.entries(mappings).map(([from, to]) => ({ from, to })),
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to update thinking type mappings');
    return c.json(
      { error: 'Failed to update thinking type mappings', code: 'MAPPINGS_UPDATE_ERROR' },
      500
    );
  }
});

// GET /api/providers/:id/models - 获取供应商的模型列表
providersRoutes.get('/:id/models', async (c) => {
  try {
    const { id } = c.req.param();
    const db = getDatabase();

    const provider = await db
      .select()
      .from(providers)
      .where(eq(providers.id, id))
      .limit(1);

    if (!provider || provider.length === 0) {
      return c.json(
        { error: 'Provider not found', code: 'PROVIDER_NOT_FOUND' },
        404
      );
    }

    const p = provider[0];
    if (!p.enabled) {
      return c.json(
        { error: 'Provider is disabled', code: 'PROVIDER_DISABLED' },
        400
      );
    }

    const protocols = p.protocols as ProtocolsConfig;

    // 尝试从供应商 API 获取模型列表
    let remoteModels: Array<{ id: string; name: string }> = [];
    let fetchError: string | null = null;

    try {
      if (protocols.openai?.enabled && protocols.openai.baseUrl) {
        const url = `${protocols.openai.baseUrl.replace(/\/+$/, '')}/models`;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (p.apiKey) {
          headers['Authorization'] = `Bearer ${p.apiKey}`;
        }
        const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
        if (resp.ok) {
          const body = await resp.json() as { data?: Array<{ id: string }> };
          if (body.data && Array.isArray(body.data)) {
            remoteModels = body.data.map((m) => ({ id: m.id, name: m.id }));
          }
        } else {
          fetchError = `OpenAI API returned ${resp.status}`;
        }
      } else if (protocols.anthropic?.enabled && protocols.anthropic.baseUrl) {
        const url = `${protocols.anthropic.baseUrl.replace(/\/+$/, '')}/models`;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        };
        if (p.apiKey) {
          headers['x-api-key'] = p.apiKey;
        }
        const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
        if (resp.ok) {
          const body = await resp.json() as { data?: Array<{ id: string; display_name?: string }> };
          if (body.data && Array.isArray(body.data)) {
            remoteModels = body.data.map((m) => ({
              id: m.id,
              name: m.display_name || m.id,
            }));
          }
        } else {
          fetchError = `Anthropic API returned ${resp.status}`;
        }
      } else {
        fetchError = 'No supported protocol enabled';
      }
    } catch (err) {
      fetchError = err instanceof Error ? err.message : 'Failed to fetch models';
      logger.warn({ err, providerId: id }, 'Failed to fetch remote models');
    }

    // 查询已同步的实例
    const existingInstances = await db
      .select({ actualModelName: modelInstances.actualModelName })
      .from(modelInstances)
      .where(eq(modelInstances.providerId, id));

    const syncedSet = new Set(existingInstances.map((i) => i.actualModelName));

    const modelsWithStatus = remoteModels.map((m) => ({
      id: m.id,
      name: m.name,
      synced: syncedSet.has(m.id),
    }));

    return c.json({
      success: true,
      data: modelsWithStatus,
      total: modelsWithStatus.length,
      fetchError,
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get provider models');
    return c.json(
      { error: 'Failed to get provider models', code: 'PROVIDER_MODELS_ERROR' },
      500
    );
  }
});

// POST /api/providers/:id/sync-models - 批量同步模型
providersRoutes.post('/:id/sync-models', async (c) => {
  try {
    const { id } = c.req.param();
    const body = await c.req.json() as {
      models: Array<{ id: string; name: string }>;
      groupId?: string;
    };
    const db = getDatabase();

    // 验证 provider
    const provider = await db
      .select()
      .from(providers)
      .where(eq(providers.id, id))
      .limit(1);

    if (!provider || provider.length === 0) {
      return c.json(
        { error: 'Provider not found', code: 'PROVIDER_NOT_FOUND' },
        404
      );
    }

    if (!provider[0].enabled) {
      return c.json(
        { error: 'Provider is disabled', code: 'PROVIDER_DISABLED' },
        400
      );
    }

    // 如果有 groupId，验证模型组存在
    if (body.groupId) {
      const { modelGroups } = await import('@/features/model-groups/db');
      const group = await db
        .select()
        .from(modelGroups)
        .where(eq(modelGroups.id, body.groupId))
        .limit(1);

      if (group.length === 0) {
        return c.json(
          { error: 'Model group not found', code: 'MODEL_GROUP_NOT_FOUND' },
          404
        );
      }
    }

    // 查询已存在的实例（按 providerId + actualModelName 去重）
    const existingInstances = await db
      .select({ actualModelName: modelInstances.actualModelName })
      .from(modelInstances)
      .where(eq(modelInstances.providerId, id));

    const existingSet = new Set(existingInstances.map((i) => i.actualModelName));

    const toCreate = body.models.filter((m) => !existingSet.has(m.id));
    const skipped = body.models.length - toCreate.length;

    // 批量插入
    if (toCreate.length > 0) {
      const inserted = await db.insert(modelInstances).values(
        toCreate.map((m) => ({
          providerId: id,
          name: m.name,
          actualModelName: m.id,
          weight: 100,
          priority: 0,
          enabled: true,
        }))
      ).returning({ id: modelInstances.id });

      if (body.groupId && inserted.length > 0) {
        const { modelGroupMemberships } = await import('@/features/model-groups/db');
        await db.insert(modelGroupMemberships).values(
          inserted.map((i) => ({
            groupId: body.groupId as string,
            instanceId: i.id,
          }))
        );
      }
    }

    logger.info(
      { providerId: id, created: toCreate.length, skipped },
      'Models synced'
    );

    return c.json({
      success: true,
      data: {
        created: toCreate.length,
        skipped,
        details: toCreate.map((m) => ({ id: m.id, name: m.name })),
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to sync models');
    return c.json(
      { error: 'Failed to sync models', code: 'SYNC_MODELS_ERROR' },
      500
    );
  }
});

export default providersRoutes;
