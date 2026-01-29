import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDatabase, models, providers, requestLogs, type VirtualKey } from '@x-llm-gateway/database';
import { virtualKeyMiddleware } from '../../middleware/virtual-key';
import logger from '../../lib/logger';

const gatewayRoutes = new Hono<{
  Variables: {
    virtualKey: VirtualKey;
  };
}>();

// 所有路由都需要虚拟密钥认证
gatewayRoutes.use('*', virtualKeyMiddleware);

/**
 * 记录请求日志
 */
async function logRequest(params: {
  virtualKey: VirtualKey;
  modelName: string;
  providerId?: string;
  providerName?: string;
  status: 'success' | 'failure';
  statusCode?: number;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  errorMessage?: string;
  errorType?: string;
  clientIp?: string;
  userAgent?: string;
  requestPath: string;
  requestMethod: string;
  streaming: boolean;
}) {
  try {
    const db = getDatabase();
    await db.insert(requestLogs).values({
      virtualKeyId: params.virtualKey.id,
      virtualKeyName: params.virtualKey.name,
      modelName: params.modelName,
      providerId: params.providerId,
      providerName: params.providerName,
      status: params.status,
      statusCode: params.statusCode,
      latencyMs: params.latencyMs,
      inputTokens: params.inputTokens || 0,
      outputTokens: params.outputTokens || 0,
      totalTokens: (params.inputTokens || 0) + (params.outputTokens || 0),
      requestHeaders: params.requestHeaders,
      requestBody: params.requestBody,
      responseHeaders: params.responseHeaders,
      responseBody: params.responseBody,
      errorMessage: params.errorMessage,
      errorType: params.errorType,
      clientIp: params.clientIp,
      userAgent: params.userAgent,
      requestPath: params.requestPath,
      requestMethod: params.requestMethod,
      streaming: params.streaming ? 'true' : 'false',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to log request');
  }
}

/**
 * Anthropic Messages API 兼容端点
 * POST /v1/messages
 */
gatewayRoutes.post('/messages', async (c) => {
  const startTime = Date.now();
  const virtualKey = c.get('virtualKey');
  const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  const userAgent = c.req.header('user-agent') || 'unknown';
  const requestPath = c.req.path;
  const requestMethod = c.req.method;

  // 收集请求头
  const requestHeaders: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    if (!key.toLowerCase().includes('authorization') && !key.toLowerCase().includes('cookie')) {
      requestHeaders[key] = value;
    }
  });

  try {
    const body = await c.req.json();

    // 验证必需字段
    if (!body.model) {
      const latencyMs = Date.now() - startTime;
      await logRequest({
        virtualKey,
        modelName: 'unknown',
        status: 'failure',
        statusCode: 400,
        latencyMs,
        requestHeaders,
        requestBody: body,
        errorMessage: 'Missing required field: model',
        errorType: 'validation_error',
        clientIp,
        userAgent,
        requestPath,
        requestMethod,
        streaming: false,
      });

      return c.json({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'Missing required field: model',
        },
      }, 400 as const);
    }

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      const latencyMs = Date.now() - startTime;
      await logRequest({
        virtualKey,
        modelName: body.model || 'unknown',
        status: 'failure',
        statusCode: 400,
        latencyMs,
        requestHeaders,
        requestBody: body,
        errorMessage: 'Missing or invalid field: messages',
        errorType: 'validation_error',
        clientIp,
        userAgent,
        requestPath,
        requestMethod,
        streaming: false,
      });

      return c.json({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'Missing or invalid field: messages',
        },
      }, 400 as const);
    }

    if (!body.max_tokens || typeof body.max_tokens !== 'number') {
      const latencyMs = Date.now() - startTime;
      await logRequest({
        virtualKey,
        modelName: body.model || 'unknown',
        status: 'failure',
        statusCode: 400,
        latencyMs,
        requestHeaders,
        requestBody: body,
        errorMessage: 'Missing or invalid field: max_tokens',
        errorType: 'validation_error',
        clientIp,
        userAgent,
        requestPath,
        requestMethod,
        streaming: false,
      });

      return c.json({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'Missing or invalid field: max_tokens',
        },
      }, 400 as const);
    }

    const db = getDatabase();

    // 查找模型配置
    const modelList = await db
      .select()
      .from(models)
      .where(eq(models.name, body.model))
      .limit(1);

    if (!modelList || modelList.length === 0) {
      const latencyMs = Date.now() - startTime;
      await logRequest({
        virtualKey,
        modelName: body.model,
        status: 'failure',
        statusCode: 404,
        latencyMs,
        requestHeaders,
        requestBody: body,
        errorMessage: `Model '${body.model}' not found`,
        errorType: 'not_found_error',
        clientIp,
        userAgent,
        requestPath,
        requestMethod,
        streaming: false,
      });

      return c.json({
        type: 'error',
        error: {
          type: 'not_found_error',
          message: `Model '${body.model}' not found`,
        },
      }, 404 as const);
    }

    const model = modelList[0];

    // 检查模型是否启用
    if (!model.enabled) {
      const latencyMs = Date.now() - startTime;
      await logRequest({
        virtualKey,
        modelName: body.model,
        status: 'failure',
        statusCode: 400,
        latencyMs,
        requestHeaders,
        requestBody: body,
        errorMessage: `Model '${body.model}' is disabled`,
        errorType: 'model_disabled',
        clientIp,
        userAgent,
        requestPath,
        requestMethod,
        streaming: false,
      });

      return c.json({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: `Model '${body.model}' is disabled`,
        },
      }, 400 as const);
    }

    // 检查虚拟密钥的模型权限
    if (virtualKey.allowedModels && virtualKey.allowedModels.length > 0) {
      if (!virtualKey.allowedModels.includes(body.model)) {
        const latencyMs = Date.now() - startTime;
        await logRequest({
          virtualKey,
          modelName: body.model,
          status: 'failure',
          statusCode: 403,
          latencyMs,
          requestHeaders,
          requestBody: body,
          errorMessage: 'Your API key does not have permission to use this model',
          errorType: 'permission_error',
          clientIp,
          userAgent,
          requestPath,
          requestMethod,
          streaming: false,
        });

        return c.json({
          type: 'error',
          error: {
            type: 'permission_error',
            message: 'Your API key does not have permission to use this model',
          },
        }, 403 as const);
      }
    }

    // 获取供应商信息
    const providerList = await db
      .select()
      .from(providers)
      .where(eq(providers.id, model.providerId))
      .limit(1);

    if (!providerList || providerList.length === 0) {
      const latencyMs = Date.now() - startTime;
      await logRequest({
        virtualKey,
        modelName: body.model,
        status: 'failure',
        statusCode: 500,
        latencyMs,
        requestHeaders,
        requestBody: body,
        errorMessage: 'Provider not found for this model',
        errorType: 'provider_not_found',
        clientIp,
        userAgent,
        requestPath,
        requestMethod,
        streaming: false,
      });

      return c.json({
        type: 'error',
        error: {
          type: 'internal_error',
          message: 'Provider not found for this model',
        },
      }, 500 as const);
    }

    const provider = providerList[0];

    // 检查供应商是否启用
    if (!provider.enabled) {
      const latencyMs = Date.now() - startTime;
      await logRequest({
        virtualKey,
        modelName: body.model,
        providerId: provider.id,
        providerName: provider.name,
        status: 'failure',
        statusCode: 400,
        latencyMs,
        requestHeaders,
        requestBody: body,
        errorMessage: 'Provider for this model is disabled',
        errorType: 'provider_disabled',
        clientIp,
        userAgent,
        requestPath,
        requestMethod,
        streaming: false,
      });

      return c.json({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'Provider for this model is disabled',
        },
      }, 400 as const);
    }

    // 构建请求体
    const requestBody: Record<string, unknown> = {
      model: model.actualModelName,
      messages: body.messages,
      max_tokens: body.max_tokens,
      stream: body.stream ?? false,
    };

    // 可选参数
    if (body.temperature !== undefined) requestBody.temperature = body.temperature;
    if (body.top_p !== undefined) requestBody.top_p = body.top_p;
    if (body.top_k !== undefined) requestBody.top_k = body.top_k;
    if (body.system !== undefined) requestBody.system = body.system;
    if (body.stop_sequences !== undefined) requestBody.stop_sequences = body.stop_sequences;

    // 获取供应商的 Anthropic 协议配置
    const anthropicConfig = provider.protocols?.anthropic;
    if (!anthropicConfig?.enabled || !anthropicConfig?.baseUrl) {
      const latencyMs = Date.now() - startTime;
      await logRequest({
        virtualKey,
        modelName: body.model,
        providerId: provider.id,
        providerName: provider.name,
        status: 'failure',
        statusCode: 400,
        latencyMs,
        requestHeaders,
        requestBody: body,
        errorMessage: 'Anthropic protocol is not configured for this provider',
        errorType: 'protocol_not_configured',
        clientIp,
        userAgent,
        requestPath,
        requestMethod,
        streaming: false,
      });

      return c.json({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'Anthropic protocol is not configured for this provider',
        },
      }, 400 as const);
    }

    // 转发请求到供应商
    const providerUrl = `${anthropicConfig.baseUrl}/messages`;

    logger.info({
      model: body.model,
      provider: provider.name,
      virtualKeyId: virtualKey.id,
      stream: requestBody.stream,
    }, 'Forwarding request to provider');

    // 根据是否流式处理不同响应
    if (requestBody.stream) {
      // 流式响应
      const response = await fetch(providerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error({ error: errorData, status: response.status }, 'Provider stream error');
        const latencyMs = Date.now() - startTime;
        const status = response.status as 400 | 401 | 403 | 404 | 429 | 500 | 502 | 503;

        await logRequest({
          virtualKey,
          modelName: body.model,
          providerId: provider.id,
          providerName: provider.name,
          status: 'failure',
          statusCode: response.status,
          latencyMs,
          requestHeaders,
          requestBody: body,
          responseBody: errorData,
          errorMessage: errorData.error?.message || 'Provider request failed',
          errorType: 'provider_error',
          clientIp,
          userAgent,
          requestPath,
          requestMethod,
          streaming: true,
        });

        return c.json({
          type: 'error',
          error: {
            type: 'api_error',
            message: errorData.error?.message || 'Provider request failed',
          },
        }, status);
      }

      // 记录成功的流式请求（异步，不阻塞响应）
      const latencyMs = Date.now() - startTime;
      logRequest({
        virtualKey,
        modelName: body.model,
        providerId: provider.id,
        providerName: provider.name,
        status: 'success',
        statusCode: 200,
        latencyMs,
        requestHeaders,
        requestBody: body,
        clientIp,
        userAgent,
        requestPath,
        requestMethod,
        streaming: true,
      });

      // 返回 SSE 流
      return new Response(response.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } else {
      // 非流式响应
      const response = await fetch(providerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
      });

      // 收集响应头
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error({ error: errorData, status: response.status }, 'Provider error');
        const status = response.status as 400 | 401 | 403 | 404 | 429 | 500 | 502 | 503;

        await logRequest({
          virtualKey,
          modelName: body.model,
          providerId: provider.id,
          providerName: provider.name,
          status: 'failure',
          statusCode: response.status,
          latencyMs,
          requestHeaders,
          requestBody: body,
          responseHeaders,
          responseBody: errorData,
          errorMessage: errorData.error?.message || 'Provider request failed',
          errorType: 'provider_error',
          clientIp,
          userAgent,
          requestPath,
          requestMethod,
          streaming: false,
        });

        return c.json({
          type: 'error',
          error: {
            type: 'api_error',
            message: errorData.error?.message || 'Provider request failed',
          },
        }, status);
      }

      const data = await response.json();

      // 记录成功的请求
      await logRequest({
        virtualKey,
        modelName: body.model,
        providerId: provider.id,
        providerName: provider.name,
        status: 'success',
        statusCode: 200,
        latencyMs,
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
        requestHeaders,
        requestBody: body,
        responseHeaders,
        responseBody: data,
        clientIp,
        userAgent,
        requestPath,
        requestMethod,
        streaming: false,
      });

      return c.json(data);
    }
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.error({ error }, 'Gateway error');

    await logRequest({
      virtualKey,
      modelName: 'unknown',
      status: 'failure',
      statusCode: 500,
      latencyMs,
      requestHeaders,
      errorMessage: error instanceof Error ? error.message : 'Internal server error',
      errorType: 'internal_error',
      clientIp,
      userAgent,
      requestPath,
      requestMethod,
      streaming: false,
    });

    return c.json({
      type: 'error',
      error: {
        type: 'internal_error',
        message: error instanceof Error ? error.message : 'Internal server error',
      },
    }, 500 as const);
  }
});

/**
 * Anthropic Models API 兼容端点
 * GET /v1/models
 */
gatewayRoutes.get('/models', async (c) => {
  const startTime = Date.now();
  const virtualKey = c.get('virtualKey');
  const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  const userAgent = c.req.header('user-agent') || 'unknown';
  const requestPath = c.req.path;
  const requestMethod = c.req.method;

  try {
    const db = getDatabase();

    // 查询所有启用的模型
    const allModels = await db.select().from(models).where(eq(models.enabled, true));

    // 过滤用户有权限访问的模型
    const accessibleModels = allModels.filter(model => {
      if (!virtualKey.allowedModels || virtualKey.allowedModels.length === 0) {
        return true;
      }
      return virtualKey.allowedModels.includes(model.name);
    });

    // 转换为 Anthropic 格式
    const anthropicModels = accessibleModels.map(model => ({
      type: 'model',
      id: model.name,
      display_name: model.displayName,
      created_at: new Date(model.createdAt).toISOString(),
    }));

    const latencyMs = Date.now() - startTime;

    // 记录成功的请求
    await logRequest({
      virtualKey,
      modelName: 'list',
      status: 'success',
      statusCode: 200,
      latencyMs,
      clientIp,
      userAgent,
      requestPath,
      requestMethod,
      streaming: false,
    });

    return c.json({
      data: anthropicModels,
      has_more: false,
      first_id: anthropicModels[0]?.id || null,
      last_id: anthropicModels[anthropicModels.length - 1]?.id || null,
    });
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.error({ error }, 'Models list error');

    await logRequest({
      virtualKey,
      modelName: 'list',
      status: 'failure',
      statusCode: 500,
      latencyMs,
      errorMessage: 'Failed to list models',
      errorType: 'internal_error',
      clientIp,
      userAgent,
      requestPath,
      requestMethod,
      streaming: false,
    });

    return c.json({
      type: 'error',
      error: {
        type: 'internal_error',
        message: 'Failed to list models',
      },
    }, 500 as const);
  }
});

export default gatewayRoutes;
