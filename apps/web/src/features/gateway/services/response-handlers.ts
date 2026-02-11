import type { Context } from 'hono';

import type { TransformerContext } from '@/types';
import logger from '@/core/lib/logger';
import type { VirtualKey } from '@/features/keys/db';
import type { StreamProgress, StreamContent } from '@/features/logs/db';

import { getTransformer } from '../transformer';
import {
  logRequest,
  logStreamStart,
  updateStreamProgress,
  finalizeStreamLog,
  markStreamFailed,
  markStreamAborted,
} from './log-service';
import { estimateTokens } from './token-estimator';
import { extractMetadata } from './metadata-extractor';

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
  startTime: number;
  requestHeaders: Record<string, string>;
  rawBody: unknown;
  standardRequestBody?: unknown;
  transformedBody?: unknown;
  clientIp: string;
  userAgent: string;
  requestPath: string;
  requestMethod: string;
  conversationId?: string;
  isPassthroughEnabled?: boolean;
}

/**
 * 提取 Provider 响应头信息（保留所有信息）
 */
function extractProviderResponseHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return headers;
}

/**
 * 必须过滤的敏感 headers（安全原因）
 * 这些 headers 可能包含敏感信息或不应该暴露给客户端
 */
const SENSITIVE_HEADERS = new Set([
  // 认证相关 - 绝对不能透传
  'authorization',
  'www-authenticate',
  'proxy-authorization',
  'proxy-authenticate',
  // Cookie 相关 - 防止 session 泄露
  'set-cookie',
  'cookie',
  // 内部网络信息
  'host',
]);

/**
 * Header 值最大长度限制 (防止内存膨胀)
 */
const MAX_HEADER_VALUE_LENGTH = 8192; // 8KB

/**
 * 判断 header 是否应该被过滤
 *
 * 作为网关，默认透传所有 headers，只过滤真正敏感的
 * 这样可以让客户端获取完整的 Provider 响应信息
 */
function shouldFilterHeader(headerName: string): boolean {
  const lowerName = headerName.toLowerCase();

  // 只过滤明确敏感的 headers
  if (SENSITIVE_HEADERS.has(lowerName)) {
    return true;
  }

  // 默认不透传（透传所有其他 headers）
  return false;
}

/**
 * 清理 header 值,防止注入攻击和内存膨胀
 */
function sanitizeHeaderValue(value: string): string {
  // 1. 移除控制字符 (ASCII 0-31, 127)
  let sanitized = value.replace(/[\x00-\x1F\x7F]/g, '');

  // 2. 截断过长的 header 值
  if (sanitized.length > MAX_HEADER_VALUE_LENGTH) {
    logger.warn(
      { headerLength: sanitized.length },
      'Truncating oversized header value'
    );
    sanitized = sanitized.substring(0, MAX_HEADER_VALUE_LENGTH);
  }

  return sanitized;
}

/**
 * 过滤 Provider 响应头
 *
 * 默认透传所有 headers，只过滤敏感 headers
 * 这样可以让客户端获取完整的 Provider 响应信息
 */
function filterProviderHeaders(
  providerHeaders: Record<string, string>
): Record<string, string> {
  const filtered: Record<string, string> = {};
  const filteredOut: string[] = [];

  for (const [key, value] of Object.entries(providerHeaders)) {
    // 过滤空值
    if (!value || value.trim() === '') {
      continue;
    }

    // 只过滤敏感 headers，其他全部透传
    if (shouldFilterHeader(key)) {
      filteredOut.push(key);
      continue;
    }

    filtered[key] = sanitizeHeaderValue(value);
  }

  if (filteredOut.length > 0) {
    logger.debug(
      { filteredHeaders: filteredOut },
      'Filtered sensitive headers from provider response'
    );
  }

  return filtered;
}

/**
 * 合并响应头: Gateway headers + 过滤后的 Provider headers
 *
 * @param gatewayHeaders - Gateway 必需的 headers (优先级最高)
 * @param providerHeaders - Provider 返回的所有 headers
 * @returns 合并后的 headers 对象
 */
export function mergeResponseHeaders(
  gatewayHeaders: Record<string, string>,
  providerHeaders: Record<string, string>
): Record<string, string> {
  // 1. 过滤 Provider headers
  const filteredProviderHeaders = filterProviderHeaders(providerHeaders);

  // 2. 合并: Provider headers 在前,Gateway headers 覆盖
  const merged = {
    ...filteredProviderHeaders,
    ...gatewayHeaders, // Gateway headers 优先级更高
  };

  logger.debug(
    {
      providerHeaderCount: Object.keys(providerHeaders).length,
      filteredCount: Object.keys(providerHeaders).length - Object.keys(filteredProviderHeaders).length,
      finalCount: Object.keys(merged).length,
      providerHeaders: Object.keys(filteredProviderHeaders),
      gatewayHeaders: Object.keys(gatewayHeaders),
    },
    'Response headers: provider headers passed through (sensitive headers filtered)'
  );

  return merged;
}

/**
 * 生成客户端响应头（非流式）
 */
function getClientNonStreamingHeaders(): Record<string, string> {
  return {
    'content-type': 'application/json; charset=utf-8',
  };
}

/**
 * 生成客户端响应头（流式）
 */
function getClientStreamingHeaders(): Record<string, string> {
  return {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    'connection': 'keep-alive',
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
    startTime,
    requestHeaders,
    rawBody,
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
    const clientResponseHeaders = getClientStreamingHeaders();

    // 记录日志（流式）
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
      transformedRequestBody: params.transformedBody,
      providerResponseHeaders,
      clientResponseHeaders,
      clientIp,
      userAgent,
      requestPath,
      requestMethod,
      streaming: true,
      incomingProtocol,
      targetProtocol,
      conversationId: params.conversationId,
    });

    // 返回 SSE 流
    const mergedHeaders = mergeResponseHeaders(
      clientResponseHeaders,
      providerResponseHeaders
    );

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
          bodyPreview: text,
        },
        'Failed to parse provider response as JSON'
      );
      throw new Error(`Invalid JSON response from provider: ${text}`);
    }

    // 记录日志
    await logRequest({
      virtualKey,
      modelName: originalModelName,
      providerId: provider.id,
      providerName: provider.name,
      status: 'success',
      statusCode: 200,
      latencyMs,
      requestHeaders,
      requestBody: rawBody,
      transformedRequestBody: params.transformedBody,
      providerResponseHeaders,
      clientResponseHeaders,
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
    });

    const mergedHeaders = mergeResponseHeaders(
      clientResponseHeaders,
      providerResponseHeaders
    );

    // 设置响应头
    for (const [key, value] of Object.entries(mergedHeaders)) {
      c.header(key, value);
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
        bodyPreview: text
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

  // 记录日志 - 包含完整的响应链路
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
    standardRequestBody: params.standardRequestBody,
    transformedRequestBody: params.transformedBody,
    providerResponseHeaders,
    clientResponseHeaders,
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
  });

  const mergedHeaders = mergeResponseHeaders(
    clientResponseHeaders,
    providerResponseHeaders
  );

  // 设置响应头
  for (const [key, value] of Object.entries(mergedHeaders)) {
    c.header(key, value);
  }

  return c.json(responseData);
}

/**
 * 流式响应摘要收集器（Phase 1 增强版）
 * 完整收集流式响应的所有数据用于日志记录
 */
class StreamResponseCollector {
  private eventCount = 0;
  private bytesReceived = 0;

  // Phase 1: 完整内容存储（移除截断限制）
  private thinkingBlocks: string[] = [];
  private contentChunks: string[] = [];
  private allChunks: unknown[] = [];  // 小规模：存储所有 chunks

  // 时间戳
  private firstChunkTime: number | null = null;
  private lastChunkTime: number | null = null;

  // 真实 usage（从流中提取）
  private realUsage: { prompt_tokens?: number; completion_tokens?: number } | null = null;

  // 保留原有字段
  private hasToolCalls = false;
  private finishReason: string | null = null;

  /**
   * 处理一个 SSE 事件
   */
  processEvent(data: string): void {
    this.eventCount++;
    const now = Date.now();

    if (!this.firstChunkTime) {
      this.firstChunkTime = now;
    }
    this.lastChunkTime = now;

    try {
      const json = JSON.parse(data);

      // Phase 1: 存储所有原始 chunks（小规模完整存储）
      this.allChunks.push(json);

      // Phase 1: 提取完整 thinking content（无截断）
      const thinking = this.extractReasoning(json);
      if (thinking) {
        this.thinkingBlocks.push(thinking);
      }

      // Phase 1: 提取完整 content（无截断）
      const content = this.extractContent(json);
      if (content) {
        this.contentChunks.push(content);
      }

      // Phase 1: 提取真实 usage
      const usage = extractUsageFromChunk(data);
      if (usage) {
        if (!this.realUsage) {
          this.realUsage = {};
        }
        if (usage.prompt_tokens !== undefined) {
          this.realUsage.prompt_tokens = usage.prompt_tokens;
        }
        if (usage.completion_tokens !== undefined) {
          this.realUsage.completion_tokens = usage.completion_tokens;
        }
      }

      this.bytesReceived += data.length;

      // 检测工具调用
      if (
        json.choices?.[0]?.delta?.tool_calls ||
        (json.type === 'content_block_start' && json.content_block?.type === 'tool_use')
      ) {
        this.hasToolCalls = true;
      }

      // 记录结束原因
      if (json.choices?.[0]?.finish_reason) {
        this.finishReason = json.choices[0].finish_reason;
      } else if (json.delta?.stop_reason) {
        this.finishReason = json.delta.stop_reason;
      }
    } catch {
      // 解析失败，忽略
    }
  }

  /**
   * 从事件中提取文本内容
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractContent(json: any): string | null {
    let content: string | null = null;

    // OpenAI 格式
    if (json.choices?.[0]?.delta?.content) {
      content = json.choices[0].delta.content;
    }
    // Anthropic 格式
    else if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
      content = json.delta.text;
    }

    return content;
  }

  /**
   * 从事件中提取推理内容
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractReasoning(json: any): string | null {
    let reasoning: string | null = null;

    // OpenAI 格式（阿里云百炼）
    if (json.choices?.[0]?.delta?.reasoning_content) {
      reasoning = json.choices[0].delta.reasoning_content;
    }
    // Anthropic 格式 - thinking_delta 事件
    else if (json.type === 'content_block_delta' && json.delta?.type === 'thinking_delta') {
      reasoning = json.delta.thinking;
    }

    return reasoning;
  }

  /**
   * Phase 1 新增：获取当前进度
   */
  getProgress(): StreamProgress {
    return {
      chunksProcessed: this.eventCount,
      bytesReceived: this.bytesReceived,
      lastChunkAt: this.lastChunkTime || Date.now(),
    };
  }

  /**
   * Phase 1 新增：获取完整内容
   */
  getFullContent(): StreamContent {
    return {
      thinkingBlocks: this.thinkingBlocks,
      contentChunks: this.contentChunks,
      allChunks: this.allChunks,
    };
  }

  /**
   * Phase 1 新增：获取真实 usage 或基于完整内容的估算
   */
  getUsage(): { inputTokens: number; outputTokens: number; estimated: boolean } {
    // 只要有任意一个真实 usage 数据，就视为非完全估算
    const hasRealInput = this.realUsage?.prompt_tokens !== undefined;
    const hasRealOutput = this.realUsage?.completion_tokens !== undefined;

    if (hasRealInput || hasRealOutput) {
      // 回退：基于完整内容估算缺失的部分
      const fullContent = this.contentChunks.join('');
      const fullThinking = this.thinkingBlocks.join('');
      const estimatedOutput = estimateTokens(fullContent) + estimateTokens(fullThinking);

      return {
        inputTokens: this.realUsage?.prompt_tokens ?? 0,
        outputTokens: this.realUsage?.completion_tokens ?? estimatedOutput,
        estimated: !hasRealOutput, // 如果 output tokens 是估算的，标记为 estimated
      };
    }

    // 完全没有真实 usage 数据，完全基于内容估算
    const fullContent = this.contentChunks.join('');
    const fullThinking = this.thinkingBlocks.join('');

    const estimatedOutput = estimateTokens(fullContent);
    const estimatedThinking = estimateTokens(fullThinking);

    return {
      inputTokens: 0,
      outputTokens: estimatedOutput + estimatedThinking,
      estimated: true,
    };
  }

  /**
   * 生成响应摘要（Phase 1 修改：返回完整内容而非预览）
   */
  getSummary(protocol: string): unknown {
    return {
      type: 'stream_summary',
      protocol,
      eventCount: this.eventCount,
      // Phase 1: 完整内容（非截断预览）
      thinkingContent: this.thinkingBlocks.join(''),
      contentText: this.contentChunks.join(''),
      bytesReceived: this.bytesReceived,
      hasToolCalls: this.hasToolCalls,
      finishReason: this.finishReason,
    };
  }
}

/**
 * 从 SSE chunk 中提取 usage 信息
 * 优先从标准 StreamChunk 提取（转换后的流），后备支持原始 Provider 格式
 */
function extractUsageFromChunk(data: string): { prompt_tokens?: number; completion_tokens?: number } | null {
  try {
    const json = JSON.parse(data);

    // 优先：标准 StreamChunk 格式（转换后的流）
    if (json.object === 'chat.completion.chunk' && json.usage) {
      return {
        prompt_tokens: json.usage.prompt_tokens,
        completion_tokens: json.usage.completion_tokens,
      };
    }

    // 后备：OpenAI 原始格式（同协议场景）
    if (json.usage && json.choices) {
      return {
        prompt_tokens: json.usage.prompt_tokens,
        completion_tokens: json.usage.completion_tokens,
      };
    }

    // 后备：Anthropic 原始格式 - message_delta 事件中的 usage
    if (json.type === 'message_delta' && json.usage) {
      return {
        prompt_tokens: json.usage.input_tokens,
        completion_tokens: json.usage.output_tokens,
      };
    }

    // 后备：Anthropic 原始格式 - message_start 事件中的 usage (input tokens)
    if (json.type === 'message_start' && json.message?.usage) {
      return {
        prompt_tokens: json.message.usage.input_tokens,
        completion_tokens: json.message.usage.output_tokens,
      };
    }

    // 调试日志：记录未提取到 usage 的事件类型
    logger.debug({ eventType: json.type || json.object || 'unknown' }, 'No usage found in chunk');
  } catch (error) {
    // 解析失败，记录调试日志
    logger.debug({ error }, 'Failed to parse chunk for usage extraction');
  }
  return null;
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
    startTime,
    requestHeaders,
    rawBody,
    clientIp,
    userAgent,
    requestPath,
    requestMethod,
    incomingProtocol,
    targetProtocol,
  } = params;

  // Phase 2: 流开始时创建初始日志
  const logId = await logStreamStart({
    virtualKey,
    modelName: originalModelName,
    providerId: provider.id,
    providerName: provider.name,
    requestHeaders,
    requestBody: rawBody,
    standardRequestBody: params.standardRequestBody,
    transformedRequestBody: params.transformedBody,
    clientIp,
    userAgent,
    requestPath,
    requestMethod,
    incomingProtocol,
    targetProtocol,
    conversationId: params.conversationId,
  });

  // 创建三个收集器，分别收集响应链路的三个阶段
  const providerCollector = new StreamResponseCollector();
  const standardCollector = new StreamResponseCollector();
  const clientCollector = new StreamResponseCollector();

  // Phase 2: 定期更新配置
  let lastUpdateTime = Date.now();
  const UPDATE_INTERVAL = parseInt(process.env.LOG_UPDATE_INTERVAL_MS || '5000', 10); // 默认 5 秒

  // 提前提取响应头（流式响应在开始时即可获取）
  const providerResponseHeaders = extractProviderResponseHeaders(response);
  const clientResponseHeaders = getClientStreamingHeaders();

  let transformedStream = response.body;

  // 检查是否需要协议转换
  // 透传模式下也跳过转换
  const needsTransformation = targetProtocol !== incomingProtocol && !params.isPassthroughEnabled;

  if (needsTransformation && transformedStream) {
    logger.debug(
      { from: targetProtocol, to: incomingProtocol },
      'Stream protocol transformation required'
    );

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
      logger.debug({ from: targetProtocol, to: 'standard' }, 'Normalizing stream');
      transformedStream = await ingressTransformer.transformStream(transformedStream, ctx);
    } else {
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
      logger.debug({ from: 'standard', to: incomingProtocol }, 'Adapting stream');
      transformedStream = await egressTransformer.transformStream(transformedStream, ctx);
    } else {
      logger.warn(
        { protocol: incomingProtocol },
        'No stream adapter available, skipping egress transformation'
      );
    }
  } else if (transformedStream) {
    // 同协议场景：仍然收集 Provider 原始响应用于日志
    logger.debug(
      { protocol: incomingProtocol },
      'Same protocol, collecting provider response for logging'
    );

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

  // Phase 2: 创建 TransformStream 提取 usage、收集响应并定期更新日志
  const usageExtractor = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      // 解析 SSE chunk 提取 usage 和收集响应
      const text = new TextDecoder().decode(chunk);
      const lines = text.split('\n');

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;

          // Phase 1: 完整收集（无截断）
          clientCollector.processEvent(data);

          // Phase 2: 定期更新日志
          const now = Date.now();
          if (now - lastUpdateTime > UPDATE_INTERVAL) {
            const progress = clientCollector.getProgress();
            const partialContent = clientCollector.getFullContent();

            // 异步更新，不阻塞流
            updateStreamProgress(logId, progress, {
              thinkingBlocks: partialContent.thinkingBlocks,
              contentChunks: partialContent.contentChunks,
              // 不在增量更新中发送所有 chunks（节省写入成本）
            }).catch((err) => {
              logger.warn({ error: err, logId }, 'Stream progress update failed');
            });

            lastUpdateTime = now;
          }
        }
      }

      controller.enqueue(chunk);
    },
    async flush() {
      // Phase 2: 流结束，最终日志
      try {
        const usage = clientCollector.getUsage();
        const fullContent = clientCollector.getFullContent();
        const progress = clientCollector.getProgress();

        const metadata = extractMetadata({
          requestBody: rawBody,
          standardRequestBody: params.standardRequestBody,
          // 同协议时，standardResponseBody 与 providerResponseBody 相同
          standardResponseBody: needsTransformation
            ? standardCollector.getFullContent()
            : providerCollector.getFullContent(),
          responseBody: fullContent,
          latencyMs: Date.now() - startTime,
          conversationId: params.conversationId,
        });

        await finalizeStreamLog(logId, {
          status: 'success',
          statusCode: 200,
          startTime,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          usageEstimated: usage.estimated,
          providerResponseHeaders,
          clientResponseHeaders,
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
        });
      } catch (error) {
        logger.error({ error, logId }, 'Failed to finalize stream log');
        await markStreamFailed(logId, {
          message: error instanceof Error ? error.message : 'Unknown error',
          type: 'log_finalization_error',
        });
      }
    },
  });

  // 通过 usage 提取器返回最终流
  const finalStream = transformedStream?.pipeThrough(usageExtractor);

  // Phase 2: 监听客户端断开
  if (params.request?.signal) {
    params.request.signal.addEventListener('abort', async () => {
      logger.info({ logId }, 'Client disconnected, marking stream as aborted');
      await markStreamAborted(logId);
    });
  }

  const mergedHeaders = mergeResponseHeaders(
    clientResponseHeaders,
    providerResponseHeaders
  );

  return new Response(finalStream, {
    headers: mergedHeaders,
  });
}
