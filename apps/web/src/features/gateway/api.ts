import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDatabase } from '@/core/db/client';
import { modelGroups, virtualModels } from '@/features/model-groups/db';
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

    // 先查询启用的虚拟模型
    const enabledVirtualModels = await db
      .select({
        name: virtualModels.name,
        displayName: virtualModels.displayName,
        createdAt: virtualModels.createdAt,
        modelGroupCapabilities: modelGroups.capabilities,
      })
      .from(virtualModels)
      .innerJoin(modelGroups, eq(virtualModels.modelGroupId, modelGroups.id))
      .where(eq(virtualModels.enabled, true));

    let modelList: Array<{ id: string; object: string; created: number; owned_by: string; capabilities?: unknown }>;

    if (enabledVirtualModels.length > 0) {
      // 有虚拟模型时，返回虚拟模型列表
      const accessibleVMs = enabledVirtualModels.filter((vm) => {
        if (!virtualKey.allowedModels?.length) return true;
        return virtualKey.allowedModels.includes(vm.name);
      });

      modelList = accessibleVMs.map((vm) => ({
        id: vm.name,
        object: 'model',
        created: Math.floor(new Date(vm.createdAt).getTime() / 1000),
        owned_by: 'x-llm-gateway',
        capabilities: vm.modelGroupCapabilities,
      }));
    } else {
      // 无虚拟模型时，回退到模型组列表
      const allGroups = await db.select().from(modelGroups).where(eq(modelGroups.enabled, true));

      const accessibleGroups = allGroups.filter((group) => {
        if (!virtualKey.allowedModels?.length) return true;
        return virtualKey.allowedModels.includes(group.name);
      });

      modelList = accessibleGroups.map((group) => ({
        id: group.name,
        object: 'model',
        created: Math.floor(new Date(group.createdAt).getTime() / 1000),
        owned_by: 'x-llm-gateway',
        capabilities: group.capabilities,
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

    // OpenAI 格式
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
