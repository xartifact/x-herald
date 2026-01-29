import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDatabase } from '@x-llm-gateway/database';
import { virtualKeys, type NewVirtualKey } from '@x-llm-gateway/database';
import { authMiddleware } from '../../middleware/auth';
import logger from '../../lib/logger';
import crypto from 'crypto';

const keysRoutes = new Hono();

// 所有路由都需要认证
keysRoutes.use('*', authMiddleware);

// 生成随机 API 密钥
function generateApiKey(): string {
  const prefix = 'xg';
  const randomPart = crypto.randomBytes(32).toString('hex');
  return `${prefix}_${randomPart}`;
}

// GET /api/keys - 列出所有密钥
keysRoutes.get('/', async (c) => {
  try {
    const db = getDatabase();
    const allKeys = await db.select().from(virtualKeys);

    return c.json({
      success: true,
      data: allKeys,
      total: allKeys.length,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to list virtual keys');
    return c.json(
      {
        error: 'Failed to list virtual keys',
        code: 'KEYS_LIST_ERROR',
      },
      500
    );
  }
});

// GET /api/keys/:id - 获取密钥详情
keysRoutes.get('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const db = getDatabase();

    const key = await db
      .select()
      .from(virtualKeys)
      .where(eq(virtualKeys.id, id))
      .limit(1);

    if (!key || key.length === 0) {
      return c.json(
        {
          error: 'Virtual key not found',
          code: 'KEY_NOT_FOUND',
        },
        404
      );
    }

    return c.json({
      success: true,
      data: key[0],
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get virtual key');
    return c.json(
      {
        error: 'Failed to get virtual key',
        code: 'KEY_GET_ERROR',
      },
      500
    );
  }
});

// POST /api/keys - 创建密钥
keysRoutes.post('/', async (c) => {
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

    const db = getDatabase();

    // 生成新的 API 密钥
    const apiKey = generateApiKey();

    const newKey: NewVirtualKey = {
      key: apiKey,
      name: body.name,
      allowedModels: body.allowedModels || null,
      rateLimitRpm: body.rateLimitRpm || null,
      rateLimitRpd: body.rateLimitRpd || null,
      tokenLimitDaily: body.tokenLimitDaily ? BigInt(body.tokenLimitDaily) : null,
      enabled: body.enabled !== undefined ? body.enabled : true,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    };

    const result = await db.insert(virtualKeys).values(newKey).returning();

    logger.info({ keyId: result[0].id }, 'Virtual key created');

    return c.json(
      {
        success: true,
        data: result[0],
      },
      201
    );
  } catch (error) {
    logger.error({ error }, 'Failed to create virtual key');
    return c.json(
      {
        error: 'Failed to create virtual key',
        code: 'KEY_CREATE_ERROR',
      },
      500
    );
  }
});

// PUT /api/keys/:id - 更新密钥
keysRoutes.put('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const body = await c.req.json();
    const db = getDatabase();

    // 检查密钥是否存在
    const existing = await db
      .select()
      .from(virtualKeys)
      .where(eq(virtualKeys.id, id))
      .limit(1);

    if (!existing || existing.length === 0) {
      return c.json(
        {
          error: 'Virtual key not found',
          code: 'KEY_NOT_FOUND',
        },
        404
      );
    }

    // 构建更新数据
    const updateData: Partial<NewVirtualKey> & { updatedAt: Date } = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.allowedModels !== undefined) updateData.allowedModels = body.allowedModels;
    if (body.rateLimitRpm !== undefined) updateData.rateLimitRpm = body.rateLimitRpm;
    if (body.rateLimitRpd !== undefined) updateData.rateLimitRpd = body.rateLimitRpd;
    if (body.tokenLimitDaily !== undefined) {
      updateData.tokenLimitDaily = body.tokenLimitDaily ? BigInt(body.tokenLimitDaily) : null;
    }
    if (body.enabled !== undefined) updateData.enabled = body.enabled;
    if (body.expiresAt !== undefined) {
      updateData.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    }

    const result = await db
      .update(virtualKeys)
      .set(updateData)
      .where(eq(virtualKeys.id, id))
      .returning();

    logger.info({ keyId: id }, 'Virtual key updated');

    return c.json({
      success: true,
      data: result[0],
    });
  } catch (error) {
    logger.error({ error }, 'Failed to update virtual key');
    return c.json(
      {
        error: 'Failed to update virtual key',
        code: 'KEY_UPDATE_ERROR',
      },
      500
    );
  }
});

// DELETE /api/keys/:id - 删除密钥
keysRoutes.delete('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const db = getDatabase();

    // 检查密钥是否存在
    const existing = await db
      .select()
      .from(virtualKeys)
      .where(eq(virtualKeys.id, id))
      .limit(1);

    if (!existing || existing.length === 0) {
      return c.json(
        {
          error: 'Virtual key not found',
          code: 'KEY_NOT_FOUND',
        },
        404
      );
    }

    await db.delete(virtualKeys).where(eq(virtualKeys.id, id));

    logger.info({ keyId: id }, 'Virtual key deleted');

    return c.json({
      success: true,
      message: 'Virtual key deleted successfully',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to delete virtual key');
    return c.json(
      {
        error: 'Failed to delete virtual key',
        code: 'KEY_DELETE_ERROR',
      },
      500
    );
  }
});

// POST /api/keys/:id/reset - 重置密钥
keysRoutes.post('/:id/reset', async (c) => {
  try {
    const { id } = c.req.param();
    const db = getDatabase();

    // 检查密钥是否存在
    const existing = await db
      .select()
      .from(virtualKeys)
      .where(eq(virtualKeys.id, id))
      .limit(1);

    if (!existing || existing.length === 0) {
      return c.json(
        {
          error: 'Virtual key not found',
          code: 'KEY_NOT_FOUND',
        },
        404
      );
    }

    // 生成新的 API 密钥
    const newApiKey = generateApiKey();

    const result = await db
      .update(virtualKeys)
      .set({
        key: newApiKey,
        updatedAt: new Date(),
      })
      .where(eq(virtualKeys.id, id))
      .returning();

    logger.info({ keyId: id }, 'Virtual key reset');

    return c.json({
      success: true,
      data: result[0],
      message: 'API key has been reset successfully',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to reset virtual key');
    return c.json(
      {
        error: 'Failed to reset virtual key',
        code: 'KEY_RESET_ERROR',
      },
      500
    );
  }
});

export default keysRoutes;
