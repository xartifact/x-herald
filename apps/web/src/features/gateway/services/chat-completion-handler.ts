import { getTransformer, createTransformerContext } from '../transformer';
import { modelGroupRouter } from './model-group-router';
import { detectProtocol, getProviderProtocol, getProviderUrl, getEndpoint } from './protocol-detector';
import { logRequestStart } from './log-service';
import { handleNonStreamingResponse, handleStreamingResponse } from './response-handlers';
import { identifyClient } from './client-identifier';
import { handleGatewayError, handleProviderError } from './error-handler';
import logger from '@/core/lib/logger';
import { loadConfig } from '@/core/config';
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
  preprocessedBody?: Record<string, unknown>,
): Promise<Response> {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  const virtualKey = c.get('virtualKey') as VirtualKey;
  const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  const userAgent = c.req.header('user-agent') || 'unknown';
  const requestPath = c.req.path;
  const requestMethod = c.req.method;

  // 提取客户端原始请求头（用于日志记录）
  // 统一使用小写 key，避免 Content-Type 和 content-type 重复
  const clientRequestHeaders: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    clientRequestHeaders[key.toLowerCase()] = value;
  });

  // 识别客户端类型
  const clientInfo = identifyClient(userAgent, clientRequestHeaders);
  const clientType = clientInfo.type;

  // 提取或生成 conversationId
  const conversationId = c.req.header('x-conversation-id') || undefined;

  // 声明变量以便在 catch 块中访问
  let rawBody: { model?: string; [key: string]: unknown } | undefined;
  let transformedBody: unknown;
  let incomingProtocol: 'openai' | 'anthropic' | undefined;
  let targetProtocol: 'openai' | 'anthropic' | undefined;
  let providerRequestHeaders: Record<string, string> | undefined;
  let logId: string | undefined;

  try {
    // 使用预处理的 body 或从请求中解析
    rawBody = preprocessedBody as { model?: string; [key: string]: unknown } ??
      (await c.req.json()) as { model?: string; [key: string]: unknown };
    incomingProtocol = detectProtocol(requestPath, rawBody, c.req.raw.headers);

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

    const { instance, provider, group, decision, mapping } = routeResult;

    logger.debug(
      {
        requestId,
        originalModel: mapping.originalModel,
        resolvedModel: mapping.modelName,
        mappingType: mapping.mappingType,
        isMapped: mapping.isMapped,
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

    // 检查是否启用同协议透传
    const config = loadConfig();
    const isSameProtocol = incomingProtocol === targetProtocol;

    // Anthropic 协议在 thinking 模式下不透传
    const isAnthropicWithThinking =
      incomingProtocol === 'anthropic' &&
      (rawBody as any).thinking?.type === 'enabled';

    const isPassthroughEnabled =
      isSameProtocol &&
      !isAnthropicWithThinking &&
      config.sameProtocolPassthrough.enabled &&
      config.sameProtocolPassthrough.allowedProtocols.includes(incomingProtocol);

    logger.debug(
      {
        requestId,
        clientProtocol: incomingProtocol,
        selectedProtocol: targetProtocol,
        isNativeMatch: isSameProtocol,
        isAnthropicWithThinking,
        isPassthroughEnabled,
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
    // 准备 ctx（透传和转换模式都需要）
    ctx.provider = {
      name: provider.name,
      baseUrl: providerUrl,
      apiKey: provider.apiKey || '',
      protocol: targetProtocol,
      models: [],
      protocols: provider.protocols,
    };
    ctx.instanceConfig = instance.config ?? undefined;

    let targetUrl: string;
    let requestBody: string;

    if (isPassthroughEnabled) {
      // 同协议透传：跳过转换，使用原始请求体（仅更新模型名）
      logger.debug(
        { requestId, protocol: incomingProtocol },
        'Same protocol passthrough enabled, skipping transformation'
      );

      transformedBody = {
        ...rawBody,
        model: instance.actualModelName,
      };

      targetUrl = joinUrl(providerUrl, getEndpoint(targetProtocol, isStreaming));
      requestBody = JSON.stringify(transformedBody);

      // 构建 Provider 请求头：透传所有客户端请求头（除 Gateway 认证头和长度相关头）+ Provider API Key
      // content-length 和 transfer-encoding 必须过滤：body 已被修改（至少替换了模型名），长度不再匹配
      // 统一使用小写 key 避免重复
      const filteredHeaders = ['authorization', 'x-api-key', 'content-length', 'transfer-encoding'];
      providerRequestHeaders = {
        ...Object.fromEntries(
          Object.entries(clientRequestHeaders).filter(
            ([key]) => !filteredHeaders.includes(key)
          )
        ),
        'authorization': `Bearer ${provider.apiKey}`,
      };
    } else {
      // 需要协议转换：执行 adapt
      const egressTransformer = getTransformer(targetProtocol);
      if (!egressTransformer?.adaptRequest) {
        throw new Error(`No adapter found for protocol: ${targetProtocol}`);
      }

      const adapted = await egressTransformer.adaptRequest(standardReq, ctx);
      transformedBody = adapted.body;

      targetUrl = adapted.url || joinUrl(providerUrl, getEndpoint(targetProtocol, isStreaming));
      requestBody = JSON.stringify(adapted.body);

      // 构建 Provider 请求头：透传所有客户端请求头（除 Gateway 认证头和长度相关头）+ Provider API Key
      // content-length 和 transfer-encoding 必须过滤：协议转换后 body 完全不同，长度不再匹配
      // 统一使用小写 key 避免重复
      const filteredHeaders = ['authorization', 'x-api-key', 'content-length', 'transfer-encoding'];
      providerRequestHeaders = {
        ...Object.fromEntries(
          Object.entries(clientRequestHeaders).filter(
            ([key]) => !filteredHeaders.includes(key)
          )
        ),
        ...Object.fromEntries(
          Object.entries(adapted.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
        ),
        'authorization': `Bearer ${provider.apiKey}`,
      };
    }

    logger.debug(
      { requestId, targetUrl, targetProtocol, model: standardReq.model, isPassthrough: isPassthroughEnabled },
      'Forwarding to provider',
    );

    // 调试日志：记录发送给 Provider 的完整请求体
    logger.debug(
      {
        requestId,
        provider: provider.name,
        targetProtocol,
        hasToolCalls: requestBody.includes('tool_calls'),
      },
      'Request body sent to provider',
    );

    // 7.5 预创建日志记录（pending 状态）
    logId = await logRequestStart({
      virtualKey,
      modelName: mapping.modelName,
      originalModelName: mapping.originalModel,
      mappingType: mapping.mappingType,
      isMapped: mapping.isMapped,
      providerId: provider.id,
      providerName: provider.name,
      requestHeaders: clientRequestHeaders,
      providerRequestHeaders,
      requestBody: rawBody,
      standardRequestBody,
      transformedRequestBody: transformedBody,
      clientIp,
      userAgent,
      clientType,
      requestPath,
      requestMethod,
      incomingProtocol,
      targetProtocol,
      conversationId,
    });

    // 创建 AbortController 用于超时和客户端断开控制
    const abortController = new AbortController();
    const REQUEST_TIMEOUT_MS = 120000; // 2 分钟超时
    const CONNECT_TIMEOUT_MS = 30000; // 30 秒连接超时
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    // 设置超时
    timeoutId = setTimeout(() => {
      logger.warn({ requestId, timeout: REQUEST_TIMEOUT_MS }, 'Request timeout, aborting');
      abortController.abort();
    }, REQUEST_TIMEOUT_MS);

    // 监听客户端断开，同时取消上游请求
    const clientAbortHandler = () => {
      logger.info({ requestId }, 'Client disconnected, aborting upstream request');
      abortController.abort();
    };
    c.req.raw.signal?.addEventListener('abort', clientAbortHandler);

    let response: Response;
    try {
      response = await fetch(targetUrl, {
        method: 'POST',
        headers: providerRequestHeaders,
        body: requestBody,
        signal: abortController.signal,
        connectTimeout: CONNECT_TIMEOUT_MS,
      } as RequestInit);
    } catch (fetchError) {
      // 清理超时和事件监听
      if (timeoutId) clearTimeout(timeoutId);
      c.req.raw.signal?.removeEventListener('abort', clientAbortHandler);

      // 处理超时或取消错误
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        const isTimeout = !c.req.raw.signal?.aborted;
        const errorMessage = isTimeout
          ? `Request timeout after ${REQUEST_TIMEOUT_MS / 1000}s`
          : 'Client disconnected';

        logger.warn({ requestId, isTimeout }, errorMessage);

        return handleGatewayError({
          error: new Error(errorMessage),
          c,
          virtualKey,
          requestHeaders: clientRequestHeaders,
          providerRequestHeaders,
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
          logId,
        });
      }
      throw fetchError;
    }

    // 清理超时和事件监听
    if (timeoutId) clearTimeout(timeoutId);
    c.req.raw.signal?.removeEventListener('abort', clientAbortHandler);

    if (!response.ok) {
      return handleProviderError(
        c,
        response,
        provider,
        virtualKey,
        rawBody.model || 'unknown',
        clientRequestHeaders,
        providerRequestHeaders,
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
        logId,
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
      resolvedModelName: mapping.modelName,
      mappingType: mapping.mappingType,
      isMapped: mapping.isMapped,
      startTime,
      requestHeaders: clientRequestHeaders,
      providerRequestHeaders,
      rawBody,
      standardRequestBody,
      transformedBody,
      clientIp,
      userAgent,
      requestPath,
      requestMethod,
      conversationId,
      isPassthroughEnabled,
      clientType,
      logId,
      request: c.req.raw, // 传递原始请求对象，用于监听客户端断开
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
      requestHeaders: clientRequestHeaders,
      providerRequestHeaders,
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
      logId,
    });
  }
}
