import type { Context } from 'hono';

import logger from '@/core/lib/logger';
import type { VirtualKey } from '@/features/keys/db';
import type { TransformerContext } from '@/types';

import { getTransformer } from '../transformer';
import { logEventBus } from './log-event-bus';
import {
  logRequest,
  upgradeToStreamLog,
  finalizeStreamLog,
  markStreamFailed,
  markStreamAborted,
} from './log-service';
import { extractMetadata } from './metadata-extractor';
import {
  StreamResponseCollector,
  getClientNonStreamingHeaders,
  getClientStreamingHeaders,
  extractProviderResponseHeaders,
  createModelRemapStream,
  mergeResponseHeaders,
} from './response-handlers/shared';
export { mergeResponseHeaders } from './response-handlers/shared';

interface ResponseHandlerParams {
  c: Context;
  request?: Request;
  response: Response;
  ctx: TransformerContext;
  incomingProtocol: string;
  targetProtocol: string;
  virtualKey: VirtualKey;
  provider: { id: string; name: string };
  originalModelName: string;
  resolvedModelName?: string;
  mappingType?: 'virtual' | 'exact' | 'alias' | 'fallback' | null;
  isMapped?: boolean;
  startTime: number;
  preprocessEndTime: number;
  providerTtfbTime: number;
  requestHeaders: Record<string, string>;
  providerRequestHeaders?: Record<string, string>;
  rawBody: unknown;
  standardRequestBody?: unknown;
  transformedBody?: unknown;
  clientIp: string;
  userAgent: string;
  requestPath: string;
  requestMethod: string;
  conversationId?: string;
  isPassthroughEnabled?: boolean;
  clientType?: string;
  logId?: string;
  retryCount?: number;
  routingTrace?: {
    matchedRuleId?: string;
    matchedRuleName?: string;
    matchedRulePriority?: number;
    modelGroupId?: string;
    modelGroupName?: string;
    instanceId?: string;
    actualModelName?: string;
    strategy?: string;
    responseModelName?: string;
  };
}

/**
 * 处理非流式响应
 */
export async function handleNonStreamingResponse(
  params: ResponseHandlerParams,
): Promise<Response> {
  const {
    c,
    response,
    ctx,
    incomingProtocol,
    targetProtocol,
    virtualKey,
    provider,
    originalModelName,
    resolvedModelName,
    mappingType,
    isMapped,
    startTime,
    preprocessEndTime,
    providerTtfbTime,
    requestHeaders,
    rawBody,
    routingTrace: routingTraceParam,
    clientIp,
    userAgent,
    requestPath,
    requestMethod,
  } = params;

  // 检查 Provider 是否返回了流式响应（Content-Type: text/event-stream）
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) {
    // Provider 返回了流式响应，但客户端请求的是非流式
    // 转发流式响应给客户端
    logger.warn(
      { provider: provider.name, model: originalModelName },
      'Provider returned streaming response for non-streaming request, forwarding as stream'
    );

    const latencyMs = Date.now() - startTime;
    const providerResponseHeaders = extractProviderResponseHeaders(response);
    const clientResponseHeaders = getClientStreamingHeaders(providerResponseHeaders['content-type']);

    // 返回 SSE 流
    const mergedHeaders = mergeResponseHeaders(
      clientResponseHeaders,
      providerResponseHeaders
    );

    // 记录日志（流式）- 使用实际发送给客户端的 mergedHeaders
    logRequest({
      virtualKey,
      modelName: resolvedModelName || originalModelName,
      originalModelName,
      mappingType,
      isMapped,
      providerId: provider.id,
      providerName: provider.name,
      status: 'success',
      statusCode: 200,
      latencyMs,
      requestHeaders,
      providerRequestHeaders: params.providerRequestHeaders,
      requestBody: rawBody,
      transformedRequestBody: params.transformedBody,
      providerResponseHeaders,
      clientResponseHeaders: mergedHeaders,
      clientIp,
      userAgent,
      requestPath,
      requestMethod,
      streaming: true,
      incomingProtocol,
      targetProtocol,
      conversationId: params.conversationId,
      clientType: params.clientType,
      logId: params.logId,
      gatewayOverheadMs: preprocessEndTime - startTime,
      providerTtfbMs: providerTtfbTime - preprocessEndTime,
      retryCount: params.retryCount,
      routingTrace: routingTraceParam,
    });

    return new Response(response.body, {
      headers: mergedHeaders,
    });
  }

  // 同协议透传模式：直接转发响应，不进行协议转换
  if (params.isPassthroughEnabled) {
    const latencyMs = Date.now() - startTime;
    const providerResponseHeaders = extractProviderResponseHeaders(response);
    const clientResponseHeaders = getClientNonStreamingHeaders();

    // 获取 Provider 原始响应
    const providerResponseClone = response.clone();
    let providerResponseData;
    try {
      providerResponseData = await providerResponseClone.json();
    } catch {
      const text = await response.text();
      logger.error(
        {
          requestId: ctx.requestId,
          provider: provider.name,
          statusCode: response.status,
        },
        'Failed to parse provider response as JSON'
      );
      throw new Error(`Invalid JSON response from provider: ${text}`);
    }

    const mergedHeaders = mergeResponseHeaders(
      clientResponseHeaders,
      providerResponseHeaders
    );

    // 设置响应头
    for (const [key, value] of Object.entries(mergedHeaders)) {
      c.header(key, value);
    }

    // 记录日志 - 使用实际发送给客户端的 mergedHeaders
    await logRequest({
      virtualKey,
      modelName: resolvedModelName || originalModelName,
      originalModelName,
      mappingType,
      isMapped,
      providerId: provider.id,
      providerName: provider.name,
      status: 'success',
      statusCode: 200,
      latencyMs,
      requestHeaders,
      providerRequestHeaders: params.providerRequestHeaders,
      requestBody: rawBody,
      transformedRequestBody: params.transformedBody,
      providerResponseHeaders,
      clientResponseHeaders: mergedHeaders,
      providerResponseBody: providerResponseData,
      standardResponseBody: providerResponseData, // 透传模式下相同
      responseBody: providerResponseData,
      clientIp,
      userAgent,
      requestPath,
      requestMethod,
      streaming: false,
      incomingProtocol,
      targetProtocol,
      conversationId: params.conversationId,
      clientType: params.clientType,
      logId: params.logId,
      gatewayOverheadMs: preprocessEndTime - startTime,
      providerTtfbMs: providerTtfbTime - preprocessEndTime,
      retryCount: params.retryCount,
      routingTrace: routingTraceParam,
    });

    // 模型映射时将响应体中的 model 字段回写为客户端请求的原始模型名
    if (isMapped && originalModelName && providerResponseData?.model !== undefined) {
      providerResponseData.model = originalModelName;
    }

    return c.json(providerResponseData);
  }

  // 检查响应体是否存在
  if (!response.body) {
    logger.error(
      { requestId: ctx.requestId, provider: provider.name },
      'Provider returned response without body'
    );
    throw new Error('Provider returned empty response body');
  }

  // 1. 获取 Provider 原始响应（添加错误处理）
  const providerResponseClone = response.clone();
  let providerResponseData;
  try {
    providerResponseData = await providerResponseClone.json();
  } catch {
    const text = await response.text();
    logger.error(
      {
        requestId: ctx.requestId,
        provider: provider.name,
        statusCode: response.status,
      },
      'Failed to parse provider response as JSON'
    );
    throw new Error(`Invalid JSON response from provider: ${text}`);
  }

  // 检查阿里云特定错误格式
  if (providerResponseData.error) {
    logger.error(
      { requestId: ctx.requestId, provider: provider.name, error: providerResponseData.error },
      'Provider returned error response'
    );
    throw new Error(
      `Provider error: ${providerResponseData.error.message || JSON.stringify(providerResponseData.error)}`
    );
  }

  // 2. 标准化响应
  const ingressTransformer = getTransformer(targetProtocol);
  if (!ingressTransformer?.normalizeResponse) {
    throw new Error(`No response normalizer for protocol: ${targetProtocol}`);
  }

  const standardRes = await ingressTransformer.normalizeResponse(response, ctx);

  // 3. 适配到用户协议
  const egressTransformer = getTransformer(incomingProtocol);
  if (!egressTransformer?.adaptResponse) {
    throw new Error(`No response adapter for protocol: ${incomingProtocol}`);
  }

  const adaptedRes = await egressTransformer.adaptResponse(standardRes, ctx);
  const responseData = await adaptedRes.json();

  const latencyMs = Date.now() - startTime;
  const providerResponseHeaders = extractProviderResponseHeaders(response);
  const clientResponseHeaders = getClientNonStreamingHeaders();

  const mergedHeaders = mergeResponseHeaders(
    clientResponseHeaders,
    providerResponseHeaders
  );

  // 设置响应头
  for (const [key, value] of Object.entries(mergedHeaders)) {
    c.header(key, value);
  }

  // 记录日志 - 包含完整的响应链路，clientResponseHeaders 使用实际发送的 mergedHeaders
  await logRequest({
    virtualKey,
    modelName: resolvedModelName || originalModelName,
    originalModelName,
    mappingType,
    isMapped,
    providerId: provider.id,
    providerName: provider.name,
    status: 'success',
    statusCode: 200,
    latencyMs,
    inputTokens: standardRes.usage?.prompt_tokens,
    outputTokens: standardRes.usage?.completion_tokens,
    requestHeaders,
    providerRequestHeaders: params.providerRequestHeaders,
    requestBody: rawBody,
    standardRequestBody: params.standardRequestBody,
    transformedRequestBody: params.transformedBody,
    providerResponseHeaders,
    clientResponseHeaders: mergedHeaders,
    providerResponseBody: providerResponseData,      // Provider 原始响应
    standardResponseBody: standardRes,                // 标准格式
    responseBody: responseData,                       // 客户端最终响应
    clientIp,
    userAgent,
    requestPath,
    requestMethod,
    streaming: false,
    incomingProtocol,
    targetProtocol,
    conversationId: params.conversationId,
    clientType: params.clientType,
    logId: params.logId,
    gatewayOverheadMs: preprocessEndTime - startTime,
    providerTtfbMs: providerTtfbTime - preprocessEndTime,
    retryCount: params.retryCount,
    routingTrace: {
      ...params.routingTrace,
      responseModelName: providerResponseData?.model ?? undefined,
    },
  });

  // 模型映射时将响应体中的 model 字段回写为客户端请求的原始模型名
  if (isMapped && originalModelName && responseData?.model !== undefined) {
    responseData.model = originalModelName;
  }

  return c.json(responseData);
}

/**
 * 处理流式响应
 */
export async function handleStreamingResponse(
  params: ResponseHandlerParams,
): Promise<Response> {
  const {
    response,
    ctx,
    virtualKey,
    provider,
    originalModelName,
    resolvedModelName,
    mappingType,
    isMapped,
    startTime,
    preprocessEndTime,
    providerTtfbTime,
    requestHeaders,
    rawBody,
    clientIp,
    userAgent,
    requestPath,
    requestMethod,
    incomingProtocol,
    targetProtocol,
  } = params;

  // 复用 chat-completion-handler 预创建的日志 ID，升级为流式状态
  const logId = params.logId || 'temp-' + Date.now();
  await upgradeToStreamLog(logId);

  // 通知实时面板：流式请求已开始
  logEventBus.emitLog({
    event: 'started',
    logId,
    modelName: resolvedModelName || originalModelName || 'unknown',
    originalModelName: originalModelName ?? undefined,
    providerName: provider.name,
    virtualKeyName: virtualKey.name ?? undefined,
    startTime,
    incomingProtocol,
  });

  // 创建三个收集器，分别收集响应链路的三个阶段
  const providerCollector = new StreamResponseCollector();
  const standardCollector = new StreamResponseCollector();
  const clientCollector = new StreamResponseCollector();

  // chunk 事件节流：每 N 个 chunk 或每 500ms emit 一次，避免频繁触发
  let chunkEmitCount = 0;
  let lastChunkEmitTime = Date.now();

  // 提前提取响应头（流式响应在开始时即可获取）
  const providerResponseHeaders = extractProviderResponseHeaders(response);
  const clientResponseHeaders = getClientStreamingHeaders(providerResponseHeaders['content-type']);

  let transformedStream = response.body;

  // 检查是否需要协议转换
  // 透传模式下也跳过转换
  const needsTransformation = targetProtocol !== incomingProtocol && !params.isPassthroughEnabled;

  if (needsTransformation && transformedStream) {
    // 已移除：stream transformation debug 日志，减少日志噪音

    // 收集 Provider 原始响应（第一次转换前）
    transformedStream = transformedStream.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          const text = new TextDecoder().decode(chunk);
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.startsWith('data:')) {
              const data = line.slice(5).trim();
              if (data !== '[DONE]') {
                providerCollector.processEvent(data);
              }
            }
          }
          controller.enqueue(chunk);
        },
      })
    );

    // Ingress: Provider 协议 → 标准格式
    ctx.state.set('streamDirection', 'normalize');
    const ingressTransformer = getTransformer(targetProtocol);
    if (ingressTransformer?.transformStream) {
      // 已移除：stream normalization debug 日志，减少日志噪音
      transformedStream = await ingressTransformer.transformStream(transformedStream, ctx);
    } else {
      // 警告保留：异常情况需要记录
      logger.warn(
        { protocol: targetProtocol },
        'No stream normalizer available, skipping ingress transformation'
      );
    }

    // 收集标准格式响应（两次转换之间）
    transformedStream = transformedStream.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          const text = new TextDecoder().decode(chunk);
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.startsWith('data:')) {
              const data = line.slice(5).trim();
              if (data !== '[DONE]') {
                standardCollector.processEvent(data);
              }
            }
          }
          controller.enqueue(chunk);
        },
      })
    );

    // Egress: 标准格式 → 客户端协议
    ctx.state.set('streamDirection', 'adapt');
    const egressTransformer = getTransformer(incomingProtocol);
    if (egressTransformer?.transformStream) {
      // 已移除：stream adaptation debug 日志，减少日志噪音
      transformedStream = await egressTransformer.transformStream(transformedStream, ctx);
    } else {
      // 警告保留：异常情况需要记录
      logger.warn(
        { protocol: incomingProtocol },
        'No stream adapter available, skipping egress transformation'
      );
    }
  } else if (transformedStream) {
    // 同协议场景：仍然收集 Provider 原始响应用于日志
    // 已移除：same protocol debug 日志，减少日志噪音

    // 收集 Provider 原始响应
    transformedStream = transformedStream.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          const text = new TextDecoder().decode(chunk);
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.startsWith('data:')) {
              const data = line.slice(5).trim();
              if (data !== '[DONE]') {
                providerCollector.processEvent(data);
              }
            }
          }
          controller.enqueue(chunk);
        },
      })
    );
  }

  // 提前计算 mergedHeaders，供 flush 闭包记录实际发送给客户端的 headers
  const mergedHeaders = mergeResponseHeaders(
    clientResponseHeaders,
    providerResponseHeaders
  );

  // Phase 2: 创建 TransformStream 提取 usage、收集响应并定期更新日志
  // 标记是否已完成日志，避免重复调用
  let isLogFinalized = false;

  // 提取 finalizeLog 函数，确保在任何情况下都能被调用
  const finalizeLog = async (status: 'success' | 'failure' = 'success') => {
    if (isLogFinalized) return;
    isLogFinalized = true;

    try {
      const usage = clientCollector.getUsage();
      const fullContent = clientCollector.getFullContent();
      const providerProgress = providerCollector.getProgress();
      // 统一使用 provider 的 lastChunkAt，避免因处理延迟导致时间戳不一致
      const progress = {
        ...clientCollector.getProgress(),
        lastChunkAt: providerProgress.lastChunkAt,
      };

      const now = Date.now();

      // 计算首 token 相对时间（从 providerTtfbTime 起算）
      const { firstThinkingChunkTime, firstTextChunkTime } = clientCollector.getFirstChunkTimes();
      const ttfbToFirstThinkingMs = firstThinkingChunkTime != null && providerTtfbTime > 0
        ? firstThinkingChunkTime - providerTtfbTime
        : undefined;
      const ttfbToFirstTextMs = firstTextChunkTime != null && providerTtfbTime > 0
        ? firstTextChunkTime - providerTtfbTime
        : undefined;
      // 实际思考时长：首 thinking token → 首 text token
      const thinkingDurationMs =
        firstThinkingChunkTime != null && firstTextChunkTime != null
          ? firstTextChunkTime - firstThinkingChunkTime
          : undefined;

      const metadata = extractMetadata({
        requestBody: rawBody,
        standardRequestBody: params.standardRequestBody,
        // 同协议时，standardResponseBody 与 providerResponseBody 相同
        standardResponseBody: needsTransformation
          ? standardCollector.getFullContent()
          : providerCollector.getFullContent(),
        responseBody: fullContent,
        latencyMs: now - startTime,
        gatewayOverheadMs: preprocessEndTime - startTime,
        providerTtfbMs: providerTtfbTime - preprocessEndTime,
        streamDurationMs: now - providerTtfbTime,
        conversationId: params.conversationId,
      });

      // 将路由追踪写入 metadata，防止 finalizeStreamLog 覆盖掉 logRequestStart 写入的值
      if (params.routingTrace || params.originalModelName) {
        metadata.routing = {
          requestedModel: params.originalModelName,
          ...params.routingTrace,
          responseModelName: providerCollector.getProviderModel() ?? params.routingTrace?.responseModelName,
        };
      }

      await finalizeStreamLog(logId, {
        status,
        statusCode: status === 'success' ? 200 : 500,
        startTime,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        usageEstimated: usage.estimated,
        providerResponseHeaders,
        clientResponseHeaders: mergedHeaders,
        providerResponseBody: {
          ...(providerCollector.getSummary(targetProtocol) as Record<string, unknown>),
          streamContent: providerCollector.getFullContent(),
          streamProgress: providerCollector.getProgress(),
        },
        // 同协议时，standardResponseBody 与 providerResponseBody 相同
        standardResponseBody: needsTransformation
          ? standardCollector.getFullContent()
          : providerCollector.getFullContent(),
        responseBody: {
          ...(clientCollector.getSummary(incomingProtocol) as Record<string, unknown>),
          streamContent: fullContent,
          streamProgress: progress,
        },
        streamContent: fullContent,
        streamProgress: progress,
        metadata,
        toolCallsCount: metadata.toolCalls?.tools?.length,
        retryCount: params.retryCount,
        ttfbToFirstThinkingMs,
        ttfbToFirstTextMs,
        thinkingDurationMs,
      });

      // 通知实时面板：流已完成
      logEventBus.emitLog({
        event: 'completed',
        logId,
        status,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        latencyMs: now - startTime,
        thinkingDurationMs,
      });
    } catch (error) {
      logger.error({ error, logId }, 'Failed to finalize stream log');
      await markStreamFailed(logId, {
        message: error instanceof Error ? error.message : 'Unknown error',
        type: 'log_finalization_error',
      });
    }
  };

  // 流空闲超时：如果超过指定时间没有收到任何数据，终止流
  const STREAM_IDLE_TIMEOUT_MS = 120000; // 2 分钟无数据则超时
  let streamIdleTimer: ReturnType<typeof setTimeout> | null = null;

  const resetStreamIdleTimer = (controller: TransformStreamDefaultController<Uint8Array>) => {
    if (streamIdleTimer) clearTimeout(streamIdleTimer);
    streamIdleTimer = setTimeout(() => {
      logger.warn({ logId }, `Stream idle timeout after ${STREAM_IDLE_TIMEOUT_MS / 1000}s, terminating`);
      controller.terminate();
      finalizeLog('failure').catch(() => {});
    }, STREAM_IDLE_TIMEOUT_MS);
  };

  const usageExtractor = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      // 每次收到数据，重置空闲超时
      resetStreamIdleTimer(controller);

      // 解析 SSE chunk 提取 usage 和收集响应
      const text = new TextDecoder().decode(chunk);
      const lines = text.split('\n');

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;

          // Phase 1: 完整收集（无截断）
          clientCollector.processEvent(data);

          // 节流：每 10 个 chunk 或每 500ms 发送一次实时事件（不写 DB）
          chunkEmitCount++;
          const nowEmit = Date.now();
          if (chunkEmitCount % 10 === 0 || nowEmit - lastChunkEmitTime >= 500) {
            const usage = clientCollector.getUsage();
            const fullContent = clientCollector.getFullContent();
            logEventBus.emitLog({
              event: 'chunk',
              logId,
              outputTokens: usage.outputTokens,
              totalChunks: chunkEmitCount,
              hasThinking: fullContent.thinkingBlocks.length > 0,
              elapsedMs: nowEmit - startTime,
            });
            lastChunkEmitTime = nowEmit;
          }
        }
      }

      controller.enqueue(chunk);
    },
    async flush() {
      // 流正常结束，清理空闲超时
      if (streamIdleTimer) clearTimeout(streamIdleTimer);
      await finalizeLog('success');
    },
  });

  // 模型映射时先 remap，再让 usageExtractor 收集
  // 顺序：remap → usageExtractor → 客户端
  // 这样 clientCollector 收集到的 allChunks 里 model 字段已是原始请求模型名
  if (isMapped && originalModelName && transformedStream) {
    transformedStream = transformedStream.pipeThrough(
      createModelRemapStream(originalModelName)
    ) as unknown as ReadableStream<Uint8Array<ArrayBuffer>>;
  }

  // 通过 usage 提取器返回最终流
  const finalStream = transformedStream?.pipeThrough(usageExtractor);

  // Phase 2: 监听客户端断开
  if (params.request?.signal) {
    params.request.signal.addEventListener('abort', async () => {
      logger.info({ logId }, 'Client disconnected, finalizing stream log');
      if (streamIdleTimer) clearTimeout(streamIdleTimer);
      // 先保存已收集的部分数据（status=failure），再覆盖 streamStatus=aborted
      await finalizeLog('failure');
      await markStreamAborted(logId);
      logEventBus.emitLog({ event: 'aborted', logId });
    }, { once: true });
  }

  return new Response(finalStream, {
    headers: mergedHeaders,
  });
}
