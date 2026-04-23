import type { Context } from 'hono';

import logger from '@/core/lib/logger';
import type { VirtualKey } from '@/features/keys/db';
import type { StreamProgress, StreamContent } from '@/features/logs/db';
import type { TransformerContext } from '@/types';

import { getTransformer } from '../transformer';
import {
  logRequest,
  upgradeToStreamLog,
  updateStreamProgress,
  finalizeStreamLog,
  markStreamFailed,
  markStreamAborted,
} from './log-service';
import { extractMetadata } from './metadata-extractor';
import { estimateTokens } from './token-estimator';

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
  };
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
 * 透传 Provider 响应头（不过滤任何 header）
 */
function filterProviderHeaders(
  providerHeaders: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(providerHeaders)) {
    if (value && value.trim() !== '') {
      result[key] = value;
    }
  }
  return result;
}

/**
 * 合并响应头: Provider headers 全量透传，Gateway headers 覆盖同名项
 */
export function mergeResponseHeaders(
  gatewayHeaders: Record<string, string>,
  providerHeaders: Record<string, string>
): Record<string, string> {
  return {
    ...filterProviderHeaders(providerHeaders),
    ...gatewayHeaders,
  };
}

/**
 * 将 SSE chunk 中的 model 字段替换为客户端原始请求的模型名
 * 支持 OpenAI 格式（顶层 model）和 Anthropic 格式（message_start.message.model）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function remapModelInChunk(json: any, targetModel: string): boolean {
  let modified = false;
  if (json.model !== undefined) {
    json.model = targetModel;
    modified = true;
  }
  if (json.type === 'message_start' && json.message?.model !== undefined) {
    json.message.model = targetModel;
    modified = true;
  }
  return modified;
}

/**
 * 创建 SSE 流的 model 回写 TransformStream
 * 将 provider 实际模型名替换回客户端请求的原始模型名
 */
function createModelRemapStream(originalModelName: string): TransformStream<Uint8Array, Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  return new TransformStream({
    transform(chunk, controller) {
      const text = decoder.decode(chunk);
      const lines = text.split('\n');
      const remapped = lines.map((line) => {
        if (!line.startsWith('data:')) return line;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return line;
        try {
          const json = JSON.parse(data);
          if (remapModelInChunk(json, originalModelName)) {
            return `data: ${JSON.stringify(json)}`;
          }
        } catch {
          // 解析失败，原样透传
        }
        return line;
      });
      controller.enqueue(encoder.encode(remapped.join('\n')));
    },
  });
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
 * 透明代理原则：不主动添加 provider 没有的 header
 * 若 provider 已返回 text/event-stream 类型，保留其完整值（含 charset 等参数）
 * 否则强制设为标准 SSE 类型（provider 未发 content-type 时的兜底）
 */
function getClientStreamingHeaders(providerContentType?: string): Record<string, string> {
  const contentType =
    providerContentType?.startsWith('text/event-stream')
      ? providerContentType
      : 'text/event-stream';
  return {
    'content-type': contentType,
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
    routingTrace: params.routingTrace,
  });

  // 模型映射时将响应体中的 model 字段回写为客户端请求的原始模型名
  if (isMapped && originalModelName && responseData?.model !== undefined) {
    responseData.model = originalModelName;
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
  private firstThinkingChunkTime: number | null = null;
  private firstTextChunkTime: number | null = null;

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
        if (!this.firstThinkingChunkTime) this.firstThinkingChunkTime = now;
        this.thinkingBlocks.push(thinking);
      }

      // Phase 1: 提取完整 content（无截断）
      const content = this.extractContent(json);
      if (content) {
        if (!this.firstTextChunkTime) this.firstTextChunkTime = now;
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
   * 获取首 token 时间戳（绝对时间）
   */
  getFirstChunkTimes(): { firstThinkingChunkTime: number | null; firstTextChunkTime: number | null } {
    return {
      firstThinkingChunkTime: this.firstThinkingChunkTime,
      firstTextChunkTime: this.firstTextChunkTime,
    };
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

    // 调试日志：仅在需要时记录未提取到 usage 的事件类型
    // 已移除：高频 debug 日志，减少日志噪音
  } catch (error) {
    // 解析失败，静默处理以避免影响性能
    // 已移除：高频 debug 日志，减少日志噪音
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

  // 创建三个收集器，分别收集响应链路的三个阶段
  const providerCollector = new StreamResponseCollector();
  const standardCollector = new StreamResponseCollector();
  const clientCollector = new StreamResponseCollector();

  // Phase 2: 定期更新配置
  let lastUpdateTime = Date.now();
  const UPDATE_INTERVAL = parseInt(process.env.LOG_UPDATE_INTERVAL_MS || '5000', 10); // 默认 5 秒

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
      // 客户端断开时，完成日志记录（使用已收集的数据）
      // isLogFinalized 标记会防止 flush() 重复调用
      await finalizeLog('success');
    }, { once: true }); // 使用 once: true 确保只触发一次
  }

  return new Response(finalStream, {
    headers: mergedHeaders,
  });
}
