import type { Context } from 'hono';

import { loadConfig } from '@/core/config';
import logger from '@/core/lib/logger';
import type { VirtualKey } from '@/features/keys/db';

import { getTransformer, createTransformerContext } from '../transformer';
import { identifyClient } from './client-identifier';
import { handleGatewayError, handleProviderError, handleProviderErrorPassthrough } from './error-handler';
import { logRequestStart } from './log-service';
import { ModelNotFoundError } from './model-group-router';
import { detectProtocol, getProviderProtocol, getProviderUrl, getEndpoint } from './protocol-detector';
import { handleNonStreamingResponse, handleStreamingResponse } from './response-handlers';
import { virtualModelRouter } from './virtual-model-router';
import { buildHeaders } from '../transformer/utils/parameter-transformer';


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

  // 查找 basePathParts 后缀与 endpointParts 前缀的最长重叠
  let skipCount = 0;
  for (let overlapLen = 1; overlapLen <= Math.min(basePathParts.length, endpointParts.length); overlapLen++) {
    let match = true;
    for (let j = 0; j < overlapLen; j++) {
      const baseIdx = basePathParts.length - overlapLen + j;
      if (basePathParts[baseIdx] !== endpointParts[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      skipCount = overlapLen;
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
  const requestId = c.get('requestId') ?? crypto.randomUUID();
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
  let retryCount = 0;

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

    // 3. 虚拟模型路由（唯一入口）
    const routingContext = {
      requestedModel: standardReq.model,
      streaming: standardReq.stream || false,
      hasTools: !!standardReq.tools?.length,
      hasVision: standardReq.messages.some((m) =>
        Array.isArray(m.content) && m.content.some((c) => c.type === 'image_url')
      ),
      virtualKeyId: virtualKey.id,
    };

    const routeResult = await virtualModelRouter.route(routingContext);

    if (!routeResult) {
      throw new ModelNotFoundError(standardReq.model);
    }

    const { instance, provider, group, decision, mapping, matchedRule } = routeResult;

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

      // Anthropic 协议透传时规范化消息
      let normalizedMessages = rawBody.messages as Array<{ role: string; content: unknown }> | undefined;
      let shouldStripThinking = false;
      if (incomingProtocol === 'anthropic' && Array.isArray(normalizedMessages)) {
        // 拆分混合了 tool_result 和 text 的 user 消息
        normalizedMessages = normalizeAnthropicPassthroughMessages(normalizedMessages);
        // thinking 开启时，检查历史 assistant 消息是否包含合法 thinking 块
        const thinking = rawBody.thinking as { type?: string } | undefined;
        if (thinking?.type && hasAssistantMessagesWithoutThinking(normalizedMessages)) {
          const syntheticStrategy = provider.protocols?.anthropic?.syntheticThinking ?? 'strip';
          if (syntheticStrategy === 'inject') {
            // 注入合成 thinking 块（适用于无 signature 校验的 Provider）
            logger.info({ requestId, provider: provider.name }, 'Injecting synthetic thinking blocks');
            normalizedMessages = injectSyntheticThinkingBlocks(normalizedMessages);
          } else {
            // 默认：移除 thinking 参数，降级为非 thinking 模式
            logger.info({ requestId, provider: provider.name }, 'Stripping thinking param: history lacks thinking blocks');
            shouldStripThinking = true;
          }
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { thinking: _originalThinking, ...rawBodyWithoutThinking } = rawBody as Record<string, unknown>;
      transformedBody = {
        ...(shouldStripThinking ? rawBodyWithoutThinking : rawBody),
        messages: normalizedMessages,
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

    // 合并实例自定义 Headers
    if (ctx.instanceConfig?.customHeaders) {
      providerRequestHeaders = buildHeaders(providerRequestHeaders, ctx.instanceConfig.customHeaders, ctx);
    }

    logger.debug(
      { requestId, targetUrl, targetProtocol, model: standardReq.model, isPassthrough: isPassthroughEnabled },
      'Forwarding to provider',
    );

    // 调试日志：记录发送给 Provider 的完整请求体
    logger.trace(
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
      routingTrace: {
        matchedRuleId: matchedRule?.id,
        matchedRuleName: matchedRule?.name,
        matchedRulePriority: matchedRule?.priority,
        modelGroupId: group.id,
        modelGroupName: group.name,
        instanceId: instance.id,
        actualModelName: instance.actualModelName,
        strategy: decision.strategy,
      },
    });

    // T2: 预处理完成，即将发起 Provider 请求
    const preprocessEndTime = Date.now();

    const CONNECT_TIMEOUT_MS = 30000;
    const TTFB_TIMEOUT_MS = isStreaming ? 600000 : 300000; // 流式 10 分钟，非流式 5 分钟

    // 重试配置（来自实例配置，提供合理默认值）
    const retryConfig = instance.config?.retryConfig;
    const maxRetries = retryConfig?.maxRetries ?? 2;
    const baseRetryDelay = retryConfig?.retryDelay ?? 500;
    const retryableStatusCodes = retryConfig?.retryableStatusCodes ?? [429, 500, 502, 503, 504, 521, 524];

    // 监听客户端断开（跨重试共用，不重复注册）
    let isClientDisconnected = false;
    const clientAbortHandler = () => {
      isClientDisconnected = true;
    };
    c.req.raw.signal?.addEventListener('abort', clientAbortHandler);

    let response: Response | undefined;
    let providerTtfbTime = 0;
    let lastRetryableResponse: Response | undefined;

    try {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        // 重试等待（首次直接发起，后续使用指数退避）
        if (attempt > 0) {
          if (isClientDisconnected) break;

          const retryAfterHeader = lastRetryableResponse?.headers.get('Retry-After');
          const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
          const delay = !isNaN(retryAfterSec)
            ? retryAfterSec * 1000
            : Math.min(baseRetryDelay * Math.pow(2, attempt - 1), 30000) + Math.round(Math.random() * 200);

          logger.info(
            { requestId, attempt, statusCode: lastRetryableResponse?.status, retryDelay: delay },
            '[Retry] Retrying upstream request',
          );
          await new Promise<void>((r) => setTimeout(r, delay));
          retryCount = attempt;
        }

        if (isClientDisconnected) break;

        // 每次尝试使用独立的 AbortController，避免已取消的信号污染重试
        const abortController = new AbortController();
        const propagateDisconnect = () => abortController.abort();
        c.req.raw.signal?.addEventListener('abort', propagateDisconnect);

        const timeoutId = setTimeout(() => {
          logger.warn({ requestId, timeout: TTFB_TIMEOUT_MS, streaming: isStreaming }, 'Request TTFB timeout, aborting');
          abortController.abort();
        }, TTFB_TIMEOUT_MS);

        let attemptResponse: Response;
        try {
          attemptResponse = await fetch(targetUrl, {
            method: 'POST',
            headers: providerRequestHeaders,
            body: requestBody,
            signal: abortController.signal,
            connectTimeout: CONNECT_TIMEOUT_MS,
          } as RequestInit);
        } catch (fetchError) {
          clearTimeout(timeoutId);
          c.req.raw.signal?.removeEventListener('abort', propagateDisconnect);

          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            const isTimeout = !isClientDisconnected;
            const errorMessage = isTimeout
              ? `Request TTFB timeout after ${TTFB_TIMEOUT_MS / 1000}s`
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

        clearTimeout(timeoutId);
        c.req.raw.signal?.removeEventListener('abort', propagateDisconnect);
        providerTtfbTime = Date.now();

        // 判断是否需要重试
        if (
          !attemptResponse.ok &&
          retryableStatusCodes.includes(attemptResponse.status) &&
          attempt < maxRetries &&
          !isClientDisconnected
        ) {
          lastRetryableResponse = attemptResponse;
          continue;
        }

        response = attemptResponse;
        break;
      }
    } finally {
      c.req.raw.signal?.removeEventListener('abort', clientAbortHandler);
    }

    // T3: Provider 首字节返回（providerTtfbTime 在循环内赋值）

    // 客户端已断开且所有重试均未完成
    if (!response) {
      return handleGatewayError({
        error: new Error('Client disconnected'),
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
        retryCount,
      });
    }

    if (!response.ok) {
      if (retryCount > 0) {
        logger.info({ requestId, retryCount, statusCode: response.status }, '[Retry] All retries exhausted');
      }

      // 透传模式：直接转发 Provider 原始错误响应，不做重写
      const errorHandler = isPassthroughEnabled
        ? handleProviderErrorPassthrough
        : handleProviderError;

      return errorHandler(
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
        retryCount,
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
      preprocessEndTime,
      providerTtfbTime,
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
      retryCount,
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
      retryCount,
    });
  }
}

/**
 * 规范化 Anthropic 透传消息
 * 某些 Anthropic 兼容 Provider（如 MiniMax）不支持在 user 消息中混合 tool_result 和 text 块。
 * 此函数将这类混合消息拆分为独立消息，确保 Provider 兼容性。
 *
 * 例：[{tool_result}, {text}] → 两条 user 消息：[{tool_result}] + [{text}]
 */
function normalizeAnthropicPassthroughMessages(
  messages: Array<{ role: string; content: unknown }>,
): Array<{ role: string; content: unknown }> {
  const result: Array<{ role: string; content: unknown }> = [];

  for (const msg of messages) {
    // 只处理 user 角色且 content 为数组的消息
    if (msg.role !== 'user' || !Array.isArray(msg.content)) {
      result.push(msg);
      continue;
    }

    const blocks = msg.content as Array<{ type: string; [key: string]: unknown }>;
    const hasToolResult = blocks.some((b) => b.type === 'tool_result');
    const hasNonToolResult = blocks.some((b) => b.type !== 'tool_result');

    // 不需要拆分：纯 tool_result 或无 tool_result
    if (!hasToolResult || !hasNonToolResult) {
      result.push(msg);
      continue;
    }

    // 拆分：tool_result 块放前面，其他块放后面
    const toolResultBlocks = blocks.filter((b) => b.type === 'tool_result');
    const otherBlocks = blocks.filter((b) => b.type !== 'tool_result');

    result.push({ ...msg, content: toolResultBlocks });

    if (otherBlocks.length > 0) {
      result.push({ ...msg, content: otherBlocks });
    }
  }

  return result;
}

/**
 * 检查是否存在缺少 thinking 块的 assistant 消息
 */
function hasAssistantMessagesWithoutThinking(
  messages: Array<{ role: string; content: unknown }>,
): boolean {
  return messages.some((msg) => {
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) {
      return false;
    }
    const blocks = msg.content as Array<{ type: string; [key: string]: unknown }>;
    return blocks.length > 0 && !blocks.some((b) => b.type === 'thinking');
  });
}

/**
 * 注入合成 thinking 块（inject 策略）
 * 适用于无 signature 校验的 Provider，为缺少 thinking 块的 assistant 消息注入占位 thinking。
 */
function injectSyntheticThinkingBlocks(
  messages: Array<{ role: string; content: unknown }>,
): Array<{ role: string; content: unknown }> {
  return messages.map((msg) => {
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) {
      return msg;
    }
    const blocks = msg.content as Array<{ type: string; [key: string]: unknown }>;
    if (blocks.some((b) => b.type === 'thinking')) {
      return msg;
    }
    return {
      ...msg,
      content: [{ type: 'thinking', thinking: '...' }, ...blocks],
    };
  });
}
