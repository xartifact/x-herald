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
  transformedBody?: unknown;
  clientIp: string;
  userAgent: string;
  requestPath: string;
  requestMethod: string;
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
  const responseHeaders = extractResponseHeaders(response);

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
    transformedRequestBody: params.transformedBody,
    responseHeaders,
    responseBody: responseData,
    clientIp,
    userAgent,
    requestPath,
    requestMethod,
    streaming: false,
    incomingProtocol,
    targetProtocol,
  });

  return c.json(responseData);
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
  } catch {
    // 解析失败，忽略
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

  // 创建 TransformStream 提取 usage 信息并记录日志
  const usageExtractor = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      // 解析 SSE chunk 提取 usage
      const text = new TextDecoder().decode(chunk);
      const lines = text.split('\\n');

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;

          const usage = extractUsageFromChunk(data);
          if (usage) {
            // 合并 usage 信息（可能来自不同的事件）
            if (usage.prompt_tokens !== undefined) {
              promptTokens = usage.prompt_tokens;
            }
            if (usage.completion_tokens !== undefined) {
              completionTokens = usage.completion_tokens;
            }
          }
        }
      }

      controller.enqueue(chunk);
    },
    flush() {
      // 流结束时记录日志
      const latencyMs = Date.now() - startTime;
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
        transformedRequestBody: params.transformedBody,
        responseHeaders,
        clientIp,
        userAgent,
        requestPath,
        requestMethod,
        streaming: true,
        incomingProtocol,
        targetProtocol,
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
