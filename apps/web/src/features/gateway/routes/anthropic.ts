import { Hono } from 'hono';

import logger from '@/core/lib/logger';
import type { VirtualKey } from '@/features/keys/db';

import { handleChatCompletion } from '../services/chat-completion-handler';
import { identifyClient } from '../services/client-identifier';
import { PROVIDER_FILTERED_HEADERS } from '../services/headers';
import { logRequest } from '../services/log-service';
import { ModelNotFoundError } from '../services/model-group-router';
import { virtualModelRouter } from '../services/virtual-model-router';

const anthropicRoutes = new Hono<{
  Variables: {
    virtualKey: VirtualKey;
  };
}>();

/**
 * Anthropic 兼容端点
 */
anthropicRoutes.post('/messages', async (c) => {
  // 从请求体中读取 stream 字段，用于日志记录
  // 注意：实际的流式处理在 handleChatCompletion 内部根据 standardReq.stream 决定
  const body = await c.req.json().catch(() => ({}));
  const isStreaming = body.stream === true;
  return handleChatCompletion(c, isStreaming);
});

/**
 * Anthropic count_tokens 端点 - 透明代理到上游 Provider
 */
anthropicRoutes.post('/messages/count_tokens', async (c) => {
  const startTime = Date.now();
  const virtualKey = c.get('virtualKey');
  const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  const userAgent = c.req.header('user-agent') || 'unknown';

  // 提取客户端原始请求头
  const clientRequestHeaders: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    clientRequestHeaders[key.toLowerCase()] = value;
  });

  // 识别客户端类型
  const clientInfo = identifyClient(userAgent, clientRequestHeaders);
  const clientType = clientInfo.type;

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

    // 1. 通过虚拟模型路由器选择实例（ Anthropic count_tokens 需要 Anthropic 协议）
    const routeResult = await virtualModelRouter.route({
      requestedModel: modelName,
      streaming: false,
      hasTools: !!body.tools?.length,
      hasVision: body.messages?.some((m: { content?: unknown }) =>
        Array.isArray(m.content) && m.content.some((c: { type?: string }) => c.type === 'image')
      ),
      virtualKeyId: virtualKey.id,
    });

    if (!routeResult) {
      throw new ModelNotFoundError(modelName);
    }

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

    // 5. 构建 Provider 请求头：过滤认证/长度/代理注入类头
    const providerRequestHeaders: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(clientRequestHeaders).filter(
          ([key]) => !PROVIDER_FILTERED_HEADERS.has(key)
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
      connectTimeout: 30000, // 30 秒连接超时
    } as RequestInit);

    // 7. 处理响应
    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(
        { provider: provider.name, status: response.status, error: errorBody },
        'Provider count_tokens error'
      );

      const parsedError = JSON.parse(errorBody || '{}');
      await logRequest({
        virtualKey,
        modelName: mapping.originalModel,
        originalModelName: modelName,
        providerId: provider.id,
        providerName: provider.name,
        status: 'failure',
        statusCode: response.status,
        latencyMs,
        clientIp,
        userAgent,
        clientType,
        requestPath: c.req.path,
        requestMethod: 'POST',
        streaming: false,
        incomingProtocol: 'anthropic',
        targetProtocol: 'anthropic',
        requestHeaders: clientRequestHeaders,
        providerRequestHeaders,
        requestBody: body,
        transformedRequestBody: forwardedBody,
        responseBody: parsedError,
        errorMessage: parsedError?.error?.message || errorBody,
        errorType: parsedError?.error?.type,
      });

      return c.json(parsedError, response.status as 400 | 401 | 403 | 404 | 429 | 500 | 502 | 503);
    }

    // 8. 返回 Provider 的原始响应
    const result = await response.json();

    await logRequest({
      virtualKey,
      modelName: mapping.originalModel,
      originalModelName: modelName,
      providerId: provider.id,
      providerName: provider.name,
      status: 'success',
      statusCode: response.status,
      latencyMs,
      clientIp,
      userAgent,
      clientType,
      requestPath: c.req.path,
      requestMethod: 'POST',
      streaming: false,
      incomingProtocol: 'anthropic',
      targetProtocol: 'anthropic',
      requestHeaders: clientRequestHeaders,
      providerRequestHeaders,
      requestBody: body,
      transformedRequestBody: forwardedBody,
      responseBody: result,
      inputTokens: result?.input_tokens || 0,
    });

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
      clientType,
      requestPath: c.req.path,
      requestMethod: 'POST',
      streaming: false,
      incomingProtocol: 'anthropic',
      targetProtocol: 'anthropic',
      errorMessage: error instanceof Error ? error.message : 'Failed to count tokens',
      errorType: 'internal_error',
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

export default anthropicRoutes;
