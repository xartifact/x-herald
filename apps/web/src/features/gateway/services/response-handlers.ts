import { getTransformer } from '../transformer';
import { logRequest, type LogRequestParams } from './log-service';
import logger from '@/core/lib/logger';
import type { TransformerContext } from '@/types';
import type { VirtualKey } from '@/features/keys/db';
import type { Context } from 'hono';

interface ResponseHandlerParams {
  c: Context;
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
}

/**
 * 提取响应头信息（排除敏感信息）
 */
function extractResponseHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    // 排除敏感信息和二进制内容
    if (
      !key.toLowerCase().includes('authorization') &&
      !key.toLowerCase().includes('cookie') &&
      !key.toLowerCase().includes('set-cookie') &&
      key.toLowerCase() !== 'content-encoding'
    ) {
      headers[key] = value;
    }
  });
  return headers;
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
    const responseHeaders = extractResponseHeaders(response);

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
      responseHeaders,
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
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }

  // 1. 获取 Provider 原始响应
  const providerResponseClone = response.clone();
  const providerResponseData = await providerResponseClone.json();

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
  const responseHeaders = extractResponseHeaders(response);

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
    responseHeaders,
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

  return c.json(responseData);
}

/**
 * 流式响应摘要收集器
 * 收集流式响应的关键信息用于日志记录
 */
class StreamResponseCollector {
  private eventCount = 0;
  private contentChunks: string[] = [];
  private contentLength = 0;
  private firstChunk: unknown = null;
  private lastChunk: unknown = null;
  private hasToolCalls = false;
  private finishReason: string | null = null;
  private readonly maxContentLength = 500; // 只保留前 500 字符

  /**
   * 处理一个 SSE 事件
   */
  processEvent(data: string): void {
    this.eventCount++;

    try {
      const json = JSON.parse(data);

      // 记录第一个事件
      if (!this.firstChunk) {
        this.firstChunk = json;
      }

      // 更新最后一个事件
      this.lastChunk = json;

      // 提取内容（如果还没达到长度限制）
      if (this.contentLength < this.maxContentLength) {
        const content = this.extractContent(json);
        if (content) {
          const remaining = this.maxContentLength - this.contentLength;
          const toAdd = content.slice(0, remaining);
          this.contentChunks.push(toAdd);
          this.contentLength += toAdd.length;
        }
      }

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
  private extractContent(json: any): string | null {
    // OpenAI 格式
    if (json.choices?.[0]?.delta?.content) {
      return json.choices[0].delta.content;
    }
    // Anthropic 格式
    if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
      return json.delta.text;
    }

    return null;
  }

  /**
   * 生成响应摘要
   */
  getSummary(protocol: string): unknown {
    return {
      type: 'stream_summary',
      protocol,
      eventCount: this.eventCount,
      contentPreview: this.contentChunks.join(''),
      contentLength: this.contentLength,
      firstChunk: this.firstChunk,
      lastChunk: this.lastChunk,
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
        prompt_tokens: undefined,
        completion_tokens: json.usage.output_tokens,
      };
    }

    // 后备：Anthropic 原始格式 - message_start 事件中的 usage (input tokens)
    if (json.type === 'message_start' && json.message?.usage) {
      return {
        prompt_tokens: json.message.usage.input_tokens,
        completion_tokens: undefined,
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

  // 用于收集 usage 信息
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;

  // 创建三个收集器，分别收集响应链路的三个阶段
  const providerCollector = new StreamResponseCollector();
  const standardCollector = new StreamResponseCollector();
  const clientCollector = new StreamResponseCollector();

  // 提前提取响应头（流式响应在开始时即可获取）
  const responseHeaders = extractResponseHeaders(response);

  let transformedStream = response.body;

  // 检查是否需要协议转换
  const needsTransformation = targetProtocol !== incomingProtocol;

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
  } else {
    logger.debug(
      { protocol: incomingProtocol },
      'Same protocol, skipping stream transformation'
    );
  }

  // 创建 TransformStream 提取 usage 信息、收集客户端响应并记录日志
  const usageExtractor = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      // 解析 SSE chunk 提取 usage 和收集响应
      const text = new TextDecoder().decode(chunk);
      const lines = text.split('\n');

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;

          // 提取 usage 信息
          const usage = extractUsageFromChunk(data);
          if (usage) {
            // 合并 usage 信息（可能来自不同的事件）
            if (usage.prompt_tokens !== undefined) {
              promptTokens = usage.prompt_tokens;
            }
            if (usage.completion_tokens !== undefined) {
              completionTokens = usage.completion_tokens;
            }

            // 添加调试日志
            logger.debug({
              promptTokens,
              completionTokens,
              source: 'stream_chunk'
            }, 'Usage extracted from stream');
          }

          // 收集客户端响应
          clientCollector.processEvent(data);
        }
      }

      controller.enqueue(chunk);
    },
    flush() {
      // 流结束时记录日志 - 包含完整的响应链路
      const latencyMs = Date.now() - startTime;

      // 添加 usage 验证日志
      if (!promptTokens && !completionTokens) {
        logger.warn({
          modelName: originalModelName,
          provider: provider.name
        }, 'No usage information extracted from stream');
      }

      logRequest({
        virtualKey,
        modelName: originalModelName,
        providerId: provider.id,
        providerName: provider.name,
        status: 'success',
        statusCode: 200,
        latencyMs,
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        requestHeaders,
        requestBody: rawBody,
        standardRequestBody: params.standardRequestBody,
        transformedRequestBody: params.transformedBody,
        responseHeaders,
        providerResponseBody: providerCollector.getSummary(targetProtocol),
        standardResponseBody: standardCollector.getSummary('standard'),
        responseBody: clientCollector.getSummary(incomingProtocol),
        clientIp,
        userAgent,
        requestPath,
        requestMethod,
        streaming: true,
        incomingProtocol,
        targetProtocol,
        conversationId: params.conversationId,
      });
    },
  });

  // 通过 usage 提取器返回最终流
  const finalStream = transformedStream?.pipeThrough(usageExtractor);

  return new Response(finalStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
