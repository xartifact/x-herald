import { eq, and } from 'drizzle-orm';
import { Hono } from 'hono';

import { getDatabase } from '@/core/db/client';
import logger from '@/core/lib/logger';
import type { VirtualKey } from '@/features/keys/db';
import { modelGroups, virtualModels } from '@/features/model-groups/db';

import { virtualKeyMiddleware } from './middleware/virtual-key';
import anthropicRoutes from './routes/anthropic';
import openaiRoutes from './routes/openai';
import { logRequest } from './services/log-service';

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

    // 查询启用的虚拟模型，排除 isDefault（catchall）
    const enabledVirtualModels = await db
      .select({
        name: virtualModels.name,
        displayName: virtualModels.displayName,
        createdAt: virtualModels.createdAt,
      })
      .from(virtualModels)
      .where(and(eq(virtualModels.enabled, true), eq(virtualModels.isDefault, false)));

    let modelList: Array<{
      id: string;
      object: 'model';
      created: number;
      owned_by: string;
    }>;

    if (enabledVirtualModels.length > 0) {
      // 有虚拟模型时，返回虚拟模型列表（按 allowedModels 过滤）
      const accessible = enabledVirtualModels.filter((vm) => {
        if (!virtualKey.allowedModels?.length) return true;
        return virtualKey.allowedModels.includes(vm.name);
      });

      modelList = accessible.map((vm) => ({
        id: vm.name,
        object: 'model',
        created: Math.floor(new Date(vm.createdAt).getTime() / 1000),
        owned_by: 'x-llm-gateway',
      }));
    } else {
      // 无虚拟模型时，回退到模型组列表
      const allGroups = await db
        .select({
          name: modelGroups.name,
          createdAt: modelGroups.createdAt,
        })
        .from(modelGroups)
        .where(eq(modelGroups.enabled, true));

      const accessible = allGroups.filter((group) => {
        if (!virtualKey.allowedModels?.length) return true;
        return virtualKey.allowedModels.includes(group.name);
      });

      modelList = accessible.map((group) => ({
        id: group.name,
        object: 'model',
        created: Math.floor(new Date(group.createdAt).getTime() / 1000),
        owned_by: 'x-llm-gateway',
      }));
    }

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

    return c.json({
      object: 'list',
      data: modelList,
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
