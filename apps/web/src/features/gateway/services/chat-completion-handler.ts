import { getTransformer, createTransformerContext } from '../transformer';
import { modelGroupRouter } from './model-group-router';
import { detectProtocol, getProviderProtocol, getProviderUrl, getEndpoint } from './protocol-detector';
import { logRequest } from './log-service';
import { handleNonStreamingResponse, handleStreamingResponse } from './response-handlers';
import { handleGatewayError, handleProviderError } from './error-handler';
import logger from '@/core/lib/logger';
import type { VirtualKey } from '@/features/keys/db';
import type { Context } from 'hono';

/**
 * 智能拼接 URL，避免路径重复
 * 例如：
 * - baseUrl: "https://api.com/v1", endpoint: "/v1/chat" → "https://api.com/v1/chat"
 * - baseUrl: "https://api.com", endpoint: "/v1/chat" → "https://api.com/v1/chat"
 */
function joinUrl(baseUrl: string, endpoint: string): string {
  // 移除 baseUrl 末尾的斜杠
  const cleanBase = baseUrl.replace(/\/+$/, '');
  // 确保 endpoint 以斜杠开头
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // 提取 endpoint 的路径部分（如 "/v1/chat/completions" → ["v1", "chat", "completions"]）
  const endpointParts = cleanEndpoint.split('/').filter(Boolean);

  // 提取 baseUrl 的路径部分
  const baseUrlObj = new URL(cleanBase);
  const basePath = baseUrlObj.pathname.replace(/\/+$/, '');
  const basePathParts = basePath.split('/').filter(Boolean);

  // 检查是否有重复的前缀
  let skipCount = 0;
  for (let i = 0; i < Math.min(basePathParts.length, endpointParts.length); i++) {
    if (basePathParts[basePathParts.length - 1 - i] === endpointParts[i]) {
      skipCount = i + 1;
    } else {
      break;
    }
  }

  // 构建最终路径
  const finalPathParts = [...basePathParts, ...endpointParts.slice(skipCount)];
  const finalPath = '/' + finalPathParts.join('/');

  return `${baseUrlObj.protocol}//${baseUrlObj.host}${finalPath}`;
}

export async function handleChatCompletion(
  c: Context,
  isStreaming: boolean,
): Promise<Response> {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  const virtualKey = c.get('virtualKey') as VirtualKey;
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

  // 提取或生成 conversationId
  const conversationId = c.req.header('x-conversation-id') || undefined;

  // 声明变量以便在 catch 块中访问
  let rawBody: { model?: string; [key: string]: unknown } | undefined;
  let transformedBody: unknown;
  let incomingProtocol: 'openai' | 'anthropic' | undefined;
  let targetProtocol: 'openai' | 'anthropic' | undefined;

  try {
    rawBody = (await c.req.json()) as { model?: string; [key: string]: unknown };
    incomingProtocol = detectProtocol(requestPath, rawBody);

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

    // 保存标准格式请求数据（用于日志记录）
    const standardRequestBody = standardReq;

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

    // 4. 确定目标协议（智能匹配）
    targetProtocol = getProviderProtocol(incomingProtocol, provider);
    const providerUrl = getProviderUrl(provider, targetProtocol);

    logger.debug(
      {
        requestId,
        clientProtocol: incomingProtocol,
        selectedProtocol: targetProtocol,
        isNativeMatch: incomingProtocol === targetProtocol,
      },
      'Protocol selected'
    );

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
    transformedBody = adapted.body;

    // 7. 发送请求到 Provider
    const targetUrl = adapted.url || joinUrl(providerUrl, getEndpoint(targetProtocol, isStreaming));

    const requestBody = JSON.stringify(adapted.body);

    logger.debug(
      { requestId, targetUrl, targetProtocol, model: standardReq.model },
      'Forwarding to provider',
    );

    // 调试日志：记录发送给 Provider 的完整请求体
    logger.debug(
      {
        requestId,
        provider: provider.name,
        targetProtocol,
        bodyPreview: requestBody.slice(0, 1000), // 只记录前1000字符
        hasToolCalls: requestBody.includes('tool_calls'),
      },
      'Request body sent to provider',
    );

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        ...adapted.headers,
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: requestBody,
    });

    if (!response.ok) {
      return handleProviderError(
        c,
        response,
        provider,
        virtualKey,
        rawBody.model || 'unknown',
        requestHeaders,
        rawBody,
        clientIp,
        userAgent,
        requestPath,
        requestMethod,
        isStreaming,
        startTime,
        transformedBody,
        incomingProtocol,
        targetProtocol,
      );
    }

    // 8. 处理响应
    // 根据请求体中的 stream 字段动态决定是否使用流式处理
    const actualStreaming = standardReq.stream === true;
    const modelName = rawBody.model || 'unknown';
    const handlerParams = {
      c,
      response,
      ctx,
      incomingProtocol,
      targetProtocol,
      virtualKey,
      provider,
      originalModelName: modelName,
      startTime,
      requestHeaders,
      rawBody,
      standardRequestBody,
      transformedBody,
      clientIp,
      userAgent,
      requestPath,
      requestMethod,
      conversationId,
    };

    if (actualStreaming) {
      return handleStreamingResponse(handlerParams);
    } else {
      return handleNonStreamingResponse(handlerParams);
    }
  } catch (error) {
    logger.error({ error, requestId }, 'Gateway error');

    return handleGatewayError({
      error,
      c,
      virtualKey,
      requestHeaders,
      clientIp,
      userAgent,
      requestPath,
      requestMethod,
      isStreaming,
      startTime,
      transformedBody,
      incomingProtocol,
      targetProtocol,
    });
  }
}
