import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDatabase, modelGroups, requestLogs, type VirtualKey } from '@x-llm-gateway/database';
import { virtualKeyMiddleware } from '../../middleware/virtual-key';
import logger from '../../lib/logger';
import {
  TransformerChain,
  createTransformerContext,
  getTransformer,
} from '../../transformer';
import { modelGroupRouter, ModelNotFoundError, ModelDisabledError, NoAvailableInstanceError, NoSuitableInstanceError } from '../../services/model-group-router';
import type { StandardRequest, TransformerContext } from '@x-llm-gateway/shared';

const gatewayRoutes = new Hono<{
  Variables: {
    virtualKey: VirtualKey;
  };
}>();

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
 * 检测请求协议类型
 */
function detectProtocol(path: string, body: unknown): 'openai' | 'anthropic' {
  // 根据路径判断
  if (path.includes('/chat/completions')) return 'openai';
  if (path.includes('/messages')) return 'anthropic';

  // 根据请求体判断
  const req = body as Record<string, unknown>;
  if (req && typeof req === 'object') {
    // Anthropic 特有字段
    if ('max_tokens' in req && !('max_completion_tokens' in req) && !('seed' in req)) {
      return 'anthropic';
    }
  }

  // 默认 OpenAI
  return 'openai';
}

/**
 * 获取 Provider 的协议类型
 */
function getProviderProtocol(provider: { protocols?: Record<string, { enabled?: boolean }> }): 'openai' | 'anthropic' {
  // 优先使用启用的协议
  if (provider.protocols?.openai?.enabled) return 'openai';
  if (provider.protocols?.anthropic?.enabled) return 'anthropic';

  // 默认 OpenAI
  return 'openai';
}

/**
 * 获取 Provider 的 API URL
 */
function getProviderUrl(
  provider: { protocols?: Record<string, { enabled?: boolean; baseUrl?: string }> },
  protocol: 'openai' | 'anthropic',
): string | null {
  const config = provider.protocols?.[protocol];
  if (!config?.enabled || !config.baseUrl) return null;
  return config.baseUrl;
}

/**
 * 主处理函数
 */
async function handleChatCompletion(
  c: {
    get: (key: 'virtualKey') => VirtualKey;
    req: {
      path: string;
      method: string;
      header: (name: string) => string | undefined;
      json: () => Promise<unknown>;
      raw: { headers: Headers };
    };
    json: (body: unknown, status?: number) => Response;
  },
  isStreaming: boolean,
) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  const virtualKey = c.get('virtualKey');
  const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  const userAgent = c.req.header('user-agent') || 'unknown';
  const requestPath = c.req.path;
  const requestMethod = c.req.method;

  const requestHeaders: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    if (!key.toLowerCase().includes('authorization') && !key.toLowerCase().includes('cookie')) {
      requestHeaders[key] = value;
    }
  });

  try {
    const rawBody = (await c.req.json()) as { model?: string; [key: string]: unknown };
    const incomingProtocol = detectProtocol(requestPath, rawBody);

    logger.info(
      { requestId, model: rawBody.model, protocol: incomingProtocol },
      'Processing chat completion',
    );

    // 1. 请求标准化 (外部协议 -> 标准格式)
    const ingressTransformer = getTransformer(incomingProtocol);
    if (!ingressTransformer?.normalizeRequest) {
      throw new Error(`No transformer found for protocol: ${incomingProtocol}`);
    }

    const ctx = createTransformerContext(requestId);
    const standardReq = await ingressTransformer.normalizeRequest(rawBody, ctx);

    // 2. 检查虚拟密钥的模型权限
    if (virtualKey.allowedModels?.length && !virtualKey.allowedModels.includes(standardReq.model)) {
      return c.json(
        {
          error: {
            type: 'permission_error',
            message: 'Your API key does not have permission to use this model',
          },
        },
        403,
      );
    }

    // 3. 使用模型组路由器选择实例
    const routeResult = await modelGroupRouter.route({
      requestedModel: standardReq.model,
      streaming: standardReq.stream || false,
      hasTools: !!standardReq.tools?.length,
      hasVision: standardReq.messages.some((m) =>
        Array.isArray(m.content) && m.content.some((c) => c.type === 'image_url')
      ),
      virtualKeyId: virtualKey.id,
    });

    const { instance, provider, group, decision } = routeResult;

    logger.debug(
      {
        requestId,
        groupName: group.name,
        provider: provider.name,
        actualModel: instance.actualModelName,
        strategy: decision.strategy,
        reason: decision.reason,
      },
      'Model routed via group',
    );

    // 4. 确定目标协议
    const targetProtocol = getProviderProtocol(provider);
    const providerUrl = getProviderUrl(provider, targetProtocol);

    if (!providerUrl) {
      return c.json(
        {
          error: {
            type: 'protocol_error',
            message: `Protocol '${targetProtocol}' not configured for provider`,
          },
        },
        400,
      );
    }

    // 5. 更新请求模型为实际模型名
    standardReq.model = instance.actualModelName;

    // 6. 请求适配 (标准格式 -> Provider 协议)
    const egressTransformer = getTransformer(targetProtocol);
    if (!egressTransformer?.adaptRequest) {
      throw new Error(`No adapter found for protocol: ${targetProtocol}`);
    }

    ctx.provider = {
      name: provider.name,
      baseUrl: providerUrl,
      apiKey: provider.apiKey || '',
      protocol: targetProtocol,
      models: [],
    };

    const adapted = await egressTransformer.adaptRequest(standardReq, ctx);

    // 7. 发送请求到 Provider
    const targetUrl = adapted.url || `${providerUrl}${getEndpoint(targetProtocol, isStreaming)}`;

    logger.debug(
      { requestId, targetUrl, targetProtocol, model: standardReq.model },
      'Forwarding to provider',
    );

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        ...adapted.headers,
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(adapted.body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const latencyMs = Date.now() - startTime;

      await logRequest({
        virtualKey,
        modelName: rawBody.model || 'unknown',
        providerId: provider.id,
        providerName: provider.name,
        status: 'failure',
        statusCode: response.status,
        latencyMs,
        requestHeaders,
        requestBody: rawBody,
        responseBody: errorData,
        errorMessage: errorData.error?.message || 'Provider request failed',
        errorType: 'provider_error',
        clientIp,
        userAgent,
        requestPath,
        requestMethod,
        streaming: isStreaming,
      });

      return c.json(
        {
          error: {
            type: 'provider_error',
            message: errorData.error?.message || 'Provider request failed',
            provider: provider.name,
          },
        },
        response.status as 400 | 401 | 403 | 429 | 500,
      );
    }

    // 8. 处理响应
    const modelName = rawBody.model || 'unknown';
    if (isStreaming) {
      return handleStreamingResponse(
        c,
        response,
        ctx,
        incomingProtocol,
        targetProtocol,
        virtualKey,
        provider,
        modelName,
        startTime,
        requestHeaders,
        rawBody,
        clientIp,
        userAgent,
        requestPath,
        requestMethod,
      );
    } else {
      return handleNonStreamingResponse(
        c,
        response,
        ctx,
        incomingProtocol,
        targetProtocol,
        virtualKey,
        provider,
        modelName,
        startTime,
        requestHeaders,
        rawBody,
        clientIp,
        userAgent,
        requestPath,
        requestMethod,
      );
    }
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.error({ error, requestId }, 'Gateway error');

    // 处理特定错误类型
    if (error instanceof ModelNotFoundError) {
      return c.json(
        {
          error: {
            type: 'not_found_error',
            message: error.message,
          },
        },
        404,
      );
    }

    if (error instanceof ModelDisabledError) {
      return c.json(
        {
          error: {
            type: 'invalid_request_error',
            message: error.message,
          },
        },
        400,
      );
    }

    if (error instanceof NoAvailableInstanceError || error instanceof NoSuitableInstanceError) {
      return c.json(
        {
          error: {
            type: 'service_unavailable',
            message: error.message,
          },
        },
        503,
      );
    }

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
      streaming: isStreaming,
    });

    return c.json(
      {
        error: {
          type: 'internal_error',
          message: error instanceof Error ? error.message : 'Internal server error',
        },
      },
      500,
    );
  }
}

/**
 * 处理非流式响应
 */
async function handleNonStreamingResponse(
  c: any,
  response: Response,
  ctx: TransformerContext,
  incomingProtocol: string,
  targetProtocol: string,
  virtualKey: VirtualKey,
  provider: { id: string; name: string },
  originalModelName: string,
  startTime: number,
  requestHeaders: Record<string, string>,
  rawBody: unknown,
  clientIp: string,
  userAgent: string,
  requestPath: string,
  requestMethod: string,
) {
  // 标准化响应
  const ingressTransformer = getTransformer(targetProtocol);
  if (!ingressTransformer?.normalizeResponse) {
    throw new Error(`No response normalizer for protocol: ${targetProtocol}`);
  }

  const standardRes = await ingressTransformer.normalizeResponse(response, ctx);

  // 适配到用户协议
  const egressTransformer = getTransformer(incomingProtocol);
  if (!egressTransformer?.adaptResponse) {
    throw new Error(`No response adapter for protocol: ${incomingProtocol}`);
  }

  const adaptedRes = await egressTransformer.adaptResponse(standardRes, ctx);
  const responseData = await adaptedRes.json();

  const latencyMs = Date.now() - startTime;

  // 记录日志
  await logRequest({
    virtualKey,
    modelName: originalModelName,
    providerId: provider.id,
    providerName: provider.name,
    status: 'success',
    statusCode: 200,
    latencyMs,
    inputTokens: standardRes.usage?.prompt_tokens,
    outputTokens: standardRes.usage?.completion_tokens,
    requestHeaders,
    requestBody: rawBody,
    responseBody: responseData,
    clientIp,
    userAgent,
    requestPath,
    requestMethod,
    streaming: false,
  });

  return c.json(responseData);
}

/**
 * 处理流式响应
 */
async function handleStreamingResponse(
  c: any,
  response: Response,
  ctx: TransformerContext,
  incomingProtocol: string,
  targetProtocol: string,
  virtualKey: VirtualKey,
  provider: { id: string; name: string },
  originalModelName: string,
  startTime: number,
  requestHeaders: Record<string, string>,
  rawBody: unknown,
  clientIp: string,
  userAgent: string,
  requestPath: string,
  requestMethod: string,
): Promise<Response> {
  const latencyMs = Date.now() - startTime;

  // 记录流式请求开始
  logRequest({
    virtualKey,
    modelName: originalModelName,
    providerId: provider.id,
    providerName: provider.name,
    status: 'success',
    statusCode: 200,
    latencyMs,
    requestHeaders,
    requestBody: rawBody,
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
      Connection: 'keep-alive',
    },
  });
}

/**
 * 获取协议对应的端点
 */
function getEndpoint(protocol: string, isStreaming: boolean): string {
  switch (protocol) {
    case 'openai':
      return '/v1/chat/completions';
    case 'anthropic':
      return '/v1/messages';
    default:
      return '/v1/chat/completions';
  }
}

/**
 * OpenAI 兼容端点 - 非流式
 */
gatewayRoutes.post('/chat/completions', async (c) => {
  return handleChatCompletion(c, false);
});

/**
 * Anthropic 兼容端点 - 非流式
 */
gatewayRoutes.post('/messages', async (c) => {
  return handleChatCompletion(c, false);
});

/**
 * OpenAI 流式端点
 */
gatewayRoutes.post('/chat/completions/stream', async (c) => {
  return handleChatCompletion(c, true);
});

/**
 * Anthropic 流式端点
 */
gatewayRoutes.post('/messages/stream', async (c) => {
  return handleChatCompletion(c, true);
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
