import type { Context } from 'hono';

import { loadConfig } from '@/core/config';
import logger from '@/core/lib/logger';
import type { VirtualKey } from '@/features/keys/db';

import { getTransformer, createTransformerContext } from '../../transformer';
import { buildHeaders } from '../../transformer/shared/parameter-transformer';
import { identifyClient } from '../../services/client-identifier';
import { handleGatewayError, handleProviderError, handleProviderErrorPassthrough } from '../../services/error-handler';
import { PROVIDER_FILTERED_HEADERS } from '../../services/headers';
import { logRequestStart } from '../../services/log-service';
import { ModelNotFoundError } from '../../services/model-group-router';
import { getProviderProtocol, getProviderUrl, getEndpoint } from '../../services/protocol-detector';
import { handleNonStreamingResponse, handleStreamingResponse } from '../../services/response-handlers';
import { virtualModelRouter } from '../../services/virtual-model-router';
import { AbortManager } from '../shared/abort-manager';
import { joinUrl } from '../shared/join-url';
import { executeWithRetry } from '../shared/retry-executor';
import type { RetryConfig } from '../shared/retry-executor';

/**
 * OpenAI-specific chat completion handler.
 *
 * Handles requests arriving in OpenAI protocol format. Unlike the Anthropic handler,
 * this handler does not need Anthropic-specific passthrough logic (message normalization,
 * thinking validation/injection).
 *
 * Pipeline:
 *  1. Parse body → incomingProtocol = 'openai' (fixed)
 *  2. Normalize using getTransformer('openai').normalizeRequest
 *  3. Check model permissions
 *  4. Route via virtualModelRouter
 *  5. Select target protocol (could be openai or anthropic for cross-protocol conversion)
 *  6. If passthrough (same protocol): update model name in raw body, use raw body as transformed body
 *  7. If transform: use egress transformer to adapt request
 *  8. Build provider headers
 *  9. Log request start
 * 10. Execute with retry (using executeWithRetry + AbortManager)
 * 11. Handle response (streaming or non-streaming)
 */
export async function handleOpenAIChatCompletion(
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
  const incomingProtocol: 'openai' = 'openai';
  let targetProtocol: 'openai' | 'anthropic' | undefined;
  let providerRequestHeaders: Record<string, string> | undefined;
  let logId: string | undefined;
  let retryCount = 0;

  try {
    // 使用预处理的 body 或从请求中解析
    rawBody = preprocessedBody as { model?: string; [key: string]: unknown } ??
      (await c.req.json()) as { model?: string; [key: string]: unknown };

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

    // OpenAI 协议透传无需考虑 thinking 模式（与 Anthropic 不同）
    const isPassthroughEnabled =
      isSameProtocol &&
      config.sameProtocolPassthrough.enabled &&
      config.sameProtocolPassthrough.allowedProtocols.includes(incomingProtocol);

    logger.debug(
      {
        requestId,
        clientProtocol: incomingProtocol,
        selectedProtocol: targetProtocol,
        isNativeMatch: isSameProtocol,
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

      // 构建 Provider 请求头：透传客户端请求头，过滤认证/长度/代理注入类头
      providerRequestHeaders = {
        ...Object.fromEntries(
          Object.entries(clientRequestHeaders).filter(
            ([key]) => !PROVIDER_FILTERED_HEADERS.has(key)
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

      // 构建 Provider 请求头：透传客户端请求头，过滤认证/长度/代理注入类头
      providerRequestHeaders = {
        ...Object.fromEntries(
          Object.entries(clientRequestHeaders).filter(
            ([key]) => !PROVIDER_FILTERED_HEADERS.has(key)
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
    const retryConfig: RetryConfig = {
      maxRetries: instance.config?.retryConfig?.maxRetries ?? 2,
      baseDelay: instance.config?.retryConfig?.retryDelay ?? 500,
      maxDelay: 30000,
      retryableStatusCodes: instance.config?.retryConfig?.retryableStatusCodes ?? [429, 500, 502, 503, 504, 521, 524],
    };

    // 监听客户端断开（跨重试共用，不重复注册）
    const abortManager = new AbortManager(c.req.raw.signal);
    abortManager.registerClientDisconnect();

    let response: Response | undefined;
    let providerTtfbTime = 0;

    try {
      const retryResult = await executeWithRetry({
        abortManager,
        operation: async (signal) => {
          return await fetch(targetUrl, {
            method: 'POST',
            headers: providerRequestHeaders,
            body: requestBody,
            signal,
            connectTimeout: CONNECT_TIMEOUT_MS,
          } as RequestInit);
        },
        timeout: TTFB_TIMEOUT_MS,
        requestId,
        isStreaming,
        config: retryConfig,
        onRetry: (attempt, delay, lastResponse) => {
          logger.info(
            { requestId, attempt, statusCode: lastResponse?.status, retryDelay: delay },
            '[Retry] Retrying upstream request',
          );
        },
      });

      providerTtfbTime = Date.now();

      const { response: rawResponse, retryCount: finalRetryCount } = retryResult;
      retryCount = finalRetryCount;

      // T3: Provider 首字节返回（providerTtfbTime 在循环内赋值）

      if (retryResult.aborted || !rawResponse) {
        const abortMessage = retryResult.aborted === 'client_disconnect'
          ? 'Client disconnected'
          : retryResult.aborted === 'timeout'
            ? `Request TTFB timeout after ${TTFB_TIMEOUT_MS / 1000}s`
            : 'Client disconnected';
        return handleGatewayError({
          error: new Error(abortMessage),
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

      response = rawResponse;
    } finally {
      abortManager.dispose();
    }

    // response is guaranteed defined here — the null/aborted case returns early above
    const upstreamResponse = response!;

    if (!upstreamResponse.ok) {
      if (retryCount > 0) {
        logger.info({ requestId, retryCount, statusCode: upstreamResponse.status }, '[Retry] All retries exhausted');
      }

      // 透传模式：直接转发 Provider 原始错误响应，不做重写
      const errorHandler = isPassthroughEnabled
        ? handleProviderErrorPassthrough
        : handleProviderError;

      return errorHandler(
        c,
        upstreamResponse,
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
      response: upstreamResponse,
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
