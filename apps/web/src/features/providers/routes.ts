import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDatabase } from '@x-llm-gateway/database';
import { providers, type NewProvider } from '@x-llm-gateway/database';
import { authMiddleware } from '../../middleware/auth';
import logger from '../../lib/logger';

const providersRoutes = new Hono();

// 所有路由都需要认证
providersRoutes.use('*', authMiddleware);

// GET /api/providers - 列出所有供应商
providersRoutes.get('/', async (c) => {
  try {
    const db = getDatabase();
    const allProviders = await db.select().from(providers);

    return c.json({
      success: true,
      data: allProviders,
      total: allProviders.length,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to list providers');
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
    logger.error({ error }, 'Failed to get provider');
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
    logger.error({ error }, 'Failed to create provider');
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
    logger.error({ error }, 'Failed to update provider');
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
    logger.error({ error }, 'Failed to delete provider');
    return c.json(
      {
        error: 'Failed to delete provider',
        code: 'PROVIDER_DELETE_ERROR',
      },
      500
    );
  }
});

export default providersRoutes;
