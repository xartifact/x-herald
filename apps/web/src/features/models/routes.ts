import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDatabase } from '@x-llm-gateway/database';
import { models, type NewModel } from '@x-llm-gateway/database';
import { authMiddleware } from '../../middleware/auth';
import logger from '../../lib/logger';

const modelsRoutes = new Hono();

// 所有路由都需要认证
modelsRoutes.use('*', authMiddleware);

// GET /api/models - 列出所有模型
modelsRoutes.get('/', async (c) => {
  try {
    const db = getDatabase();
    const allModels = await db.select().from(models);

    return c.json({
      success: true,
      data: allModels,
      total: allModels.length,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to list models');
    return c.json(
      {
        error: 'Failed to list models',
        code: 'MODELS_LIST_ERROR',
      },
      500
    );
  }
});

// GET /api/models/:id - 获取模型详情
modelsRoutes.get('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const db = getDatabase();

    const model = await db
      .select()
      .from(models)
      .where(eq(models.id, id))
      .limit(1);

    if (!model || model.length === 0) {
      return c.json(
        {
          error: 'Model not found',
          code: 'MODEL_NOT_FOUND',
        },
        404
      );
    }

    return c.json({
      success: true,
      data: model[0],
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get model');
    return c.json(
      {
        error: 'Failed to get model',
        code: 'MODEL_GET_ERROR',
      },
      500
    );
  }
});

// POST /api/models - 创建模型
modelsRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();

    // 验证必填字段
    if (!body.name || !body.displayName || !body.actualModelName || !body.providerId) {
      return c.json(
        {
          error: 'Missing required fields: name, displayName, actualModelName, providerId',
          code: 'VALIDATION_ERROR',
        },
        400
      );
    }

    const db = getDatabase();

    const newModel: NewModel = {
      name: body.name,
      displayName: body.displayName,
      actualModelName: body.actualModelName,
      providerId: body.providerId,
      routingConfig: body.routingConfig || {
        strategy: 'round_robin',
        fallbackEnabled: true,
      },
      protocolConversion: body.protocolConversion || {
        enabled: false,
        targetProtocol: 'openai',
      },
      capabilities: body.capabilities || {},
      enabled: body.enabled !== undefined ? body.enabled : true,
    };

    const result = await db.insert(models).values(newModel).returning();

    logger.info({ modelId: result[0].id }, 'Model created');

    return c.json(
      {
        success: true,
        data: result[0],
      },
      201
    );
  } catch (error) {
    logger.error({ error }, 'Failed to create model');
    return c.json(
      {
        error: 'Failed to create model',
        code: 'MODEL_CREATE_ERROR',
      },
      500
    );
  }
});

// PUT /api/models/:id - 更新模型
modelsRoutes.put('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const body = await c.req.json();
    const db = getDatabase();

    // 检查模型是否存在
    const existing = await db
      .select()
      .from(models)
      .where(eq(models.id, id))
      .limit(1);

    if (!existing || existing.length === 0) {
      return c.json(
        {
          error: 'Model not found',
          code: 'MODEL_NOT_FOUND',
        },
        404
      );
    }

    // 构建更新数据
    const updateData: Partial<NewModel> & { updatedAt: Date } = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.displayName !== undefined) updateData.displayName = body.displayName;
    if (body.actualModelName !== undefined) updateData.actualModelName = body.actualModelName;
    if (body.providerId !== undefined) updateData.providerId = body.providerId;
    if (body.routingConfig !== undefined) updateData.routingConfig = body.routingConfig;
    if (body.protocolConversion !== undefined) updateData.protocolConversion = body.protocolConversion;
    if (body.capabilities !== undefined) updateData.capabilities = body.capabilities;
    if (body.enabled !== undefined) updateData.enabled = body.enabled;

    const result = await db
      .update(models)
      .set(updateData)
      .where(eq(models.id, id))
      .returning();

    logger.info({ modelId: id }, 'Model updated');

    return c.json({
      success: true,
      data: result[0],
    });
  } catch (error) {
    logger.error({ error }, 'Failed to update model');
    return c.json(
      {
        error: 'Failed to update model',
        code: 'MODEL_UPDATE_ERROR',
      },
      500
    );
  }
});

// DELETE /api/models/:id - 删除模型
modelsRoutes.delete('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const db = getDatabase();

    // 检查模型是否存在
    const existing = await db
      .select()
      .from(models)
      .where(eq(models.id, id))
      .limit(1);

    if (!existing || existing.length === 0) {
      return c.json(
        {
          error: 'Model not found',
          code: 'MODEL_NOT_FOUND',
        },
        404
      );
    }

    await db.delete(models).where(eq(models.id, id));

    logger.info({ modelId: id }, 'Model deleted');

    return c.json({
      success: true,
      message: 'Model deleted successfully',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to delete model');
    return c.json(
      {
        error: 'Failed to delete model',
        code: 'MODEL_DELETE_ERROR',
      },
      500
    );
  }
});

export default modelsRoutes;
