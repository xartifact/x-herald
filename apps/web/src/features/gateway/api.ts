import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDatabase } from '@/core/db/client';
import { modelGroups } from '@/features/model-groups/db';
import { requestLogs, type VirtualKey } from '@/features/keys/db';
import { virtualKeyMiddleware } from './middleware/virtual-key';
import logger from '@/core/lib/logger';
import { handleChatCompletion } from './services/chat-completion-handler';
import { logRequest } from './services/log-service';
import { modelGroupRouter } from './services/model-group-router';

const gatewayRoutes = new Hono<{
  Variables: {
    virtualKey: VirtualKey;
  };
}>();

gatewayRoutes.use('*', virtualKeyMiddleware);

/**
 * OpenAI 兼容端点
 */
gatewayRoutes.post('/chat/completions', async (c) => {
  return handleChatCompletion(c, false);
});

/**
 * Anthropic 兼容端点
 */
gatewayRoutes.post('/messages', async (c) => {
  return handleChatCompletion(c, false);
});

/**
 * Anthropic count_tokens 端点 - 透明代理到上游 Provider
 */
gatewayRoutes.post('/messages/count_tokens', async (c) => {
  const startTime = Date.now();
  const virtualKey = c.get('virtualKey');
  const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  const userAgent = c.req.header('user-agent') || 'unknown';

  // 提取客户端原始请求头
  const clientRequestHeaders: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    clientRequestHeaders[key.toLowerCase()] = value;
  });

  try {
    const body = await c.req.json();
    const modelName = body.model;

    if (!modelName) {
      return c.json({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'model is required',
        },
      }, 400);
    }

    // 1. 使用模型组路由器选择实例（ Anthropic count_tokens 需要 Anthropic 协议）
    const routeResult = await modelGroupRouter.route({
      requestedModel: modelName,
      streaming: false,
      hasTools: !!body.tools?.length,
      hasVision: body.messages?.some((m: { content?: unknown }) =>
        Array.isArray(m.content) && m.content.some((c: { type?: string }) => c.type === 'image')
      ),
      virtualKeyId: virtualKey.id,
    });

    const { instance, provider, mapping } = routeResult;

    // 2. 检查 Provider 是否支持 Anthropic 协议
    const anthropicConfig = provider.protocols?.anthropic;
    if (!anthropicConfig?.enabled || !anthropicConfig.baseUrl) {
      return c.json({
        type: 'error',
        error: {
          type: 'protocol_error',
          message: 'Selected provider does not support Anthropic protocol required for count_tokens',
        },
      }, 400);
    }

    // 3. 构建上游 Provider URL
    const providerUrl = anthropicConfig.baseUrl.replace(/\/+$/, '');
    const targetUrl = `${providerUrl}/v1/messages/count_tokens`;

    // 4. 准备转发请求体（替换为实际模型名）
    const forwardedBody = {
      ...body,
      model: instance.actualModelName,
    };

    // 5. 构建 Provider 请求头
    const filteredHeaders = ['authorization', 'x-api-key', 'content-length', 'transfer-encoding', 'host'];
    const providerRequestHeaders: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(clientRequestHeaders).filter(
          ([key]) => !filteredHeaders.includes(key)
        )
      ),
      'content-type': 'application/json',
      'anthropic-version': clientRequestHeaders['anthropic-version'] || '2023-06-01',
      'x-api-key': provider.apiKey || '',
    };

    // 添加 anthropic-beta 头（如果客户端提供了）
    if (clientRequestHeaders['anthropic-beta']) {
      providerRequestHeaders['anthropic-beta'] = clientRequestHeaders['anthropic-beta'];
    }

    logger.debug(
      { model: modelName, actualModel: instance.actualModelName, provider: provider.name, targetUrl },
      'Forwarding count_tokens to provider'
    );

    // 6. 转发请求到上游 Provider
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: providerRequestHeaders,
      body: JSON.stringify(forwardedBody),
    });

    const latencyMs = Date.now() - startTime;

    // 7. 记录请求日志
    await logRequest({
      virtualKey,
      modelName: mapping.originalModel,
      status: response.ok ? 'success' : 'failure',
      statusCode: response.status,
      latencyMs,
      clientIp,
      userAgent,
      requestPath: c.req.path,
      requestMethod: 'POST',
      streaming: false,
    });

    // 8. 处理响应
    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(
        { provider: provider.name, status: response.status, error: errorBody },
        'Provider count_tokens error'
      );
      return c.json(JSON.parse(errorBody || '{}'), response.status as 400 | 401 | 403 | 404 | 429 | 500 | 502 | 503);
    }

    // 9. 返回 Provider 的原始响应
    const result = await response.json();
    return c.json(result);

  } catch (error) {
    const latencyMs = Date.now() - startTime;

    logger.error({ error }, 'Count tokens error');

    await logRequest({
      virtualKey,
      modelName: 'unknown',
      status: 'failure',
      statusCode: 500,
      latencyMs,
      clientIp,
      userAgent,
      requestPath: c.req.path,
      requestMethod: 'POST',
      streaming: false,
    });

    return c.json(
      {
        type: 'error',
        error: {
          type: 'internal_error',
          message: error instanceof Error ? error.message : 'Failed to count tokens',
        },
      },
      500,
    );
  }
});

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
