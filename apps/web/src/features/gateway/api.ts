import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDatabase } from '@/core/db/client';
import { modelGroups } from '@/features/model-groups/db';
import type { VirtualKey } from '@/features/keys/db';
import { virtualKeyMiddleware } from './middleware/virtual-key';
import logger from '@/core/lib/logger';
import { logRequest } from './services/log-service';
import openaiRoutes from './routes/openai';
import anthropicRoutes from './routes/anthropic';

const gatewayRoutes = new Hono<{
  Variables: {
    virtualKey: VirtualKey;
  };
}>();

gatewayRoutes.use('*', virtualKeyMiddleware);

// 挂载协议子路由
gatewayRoutes.route('/', openaiRoutes);
gatewayRoutes.route('/', anthropicRoutes);

/**
 * 模型列表端点 - 返回模型组列表
 */
gatewayRoutes.get('/models', async (c) => {
  const startTime = Date.now();
  const virtualKey = c.get('virtualKey');
  const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  const userAgent = c.req.header('user-agent') || 'unknown';

  try {
    const db = getDatabase();

    // 查询所有启用的模型组
    const allGroups = await db.select().from(modelGroups).where(eq(modelGroups.enabled, true));

    // 过滤用户有权限访问的模型组
    const accessibleGroups = allGroups.filter((group) => {
      if (!virtualKey.allowedModels?.length) return true;
      return virtualKey.allowedModels.includes(group.name);
    });

    const latencyMs = Date.now() - startTime;

    await logRequest({
      virtualKey,
      modelName: 'list',
      status: 'success',
      statusCode: 200,
      latencyMs,
      clientIp,
      userAgent,
      requestPath: c.req.path,
      requestMethod: 'GET',
      streaming: false,
    });

    // OpenAI 格式
    return c.json({
      object: 'list',
      data: accessibleGroups.map((group) => ({
        id: group.name,
        object: 'model',
        created: Math.floor(new Date(group.createdAt).getTime() / 1000),
        owned_by: 'x-llm-gateway',
        capabilities: group.capabilities,
      })),
    });
  } catch (error) {
    logger.error({ error }, 'Models list error');
    return c.json(
      {
        error: {
          type: 'internal_error',
          message: 'Failed to list models',
        },
      },
      500,
    );
  }
});

export default gatewayRoutes;
