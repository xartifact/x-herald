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
 * 支持 OpenAI 和 Anthropic 格式
 */
function extractUsageFromChunk(data: string): { prompt_tokens?: number; completion_tokens?: number } | null {
  try {
    const json = JSON.parse(data);

    // OpenAI 格式: usage 在最后一个 chunk
    if (json.usage) {
      return {
        prompt_tokens: json.usage.prompt_tokens,
        completion_tokens: json.usage.completion_tokens,
      };
    }

    // Anthropic 格式: message_delta 事件中的 usage
    if (json.type === 'message_delta' && json.usage) {
      return {
        prompt_tokens: undefined, // Anthropic 通常在 message_start 中提供
        completion_tokens: json.usage.output_tokens,
      };
    }

    // Anthropic 格式: message_start 事件中的 usage (input tokens)
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

  // 创建 TransformStream 解析 SSE
  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      // 解析 SSE chunk
      const text = new TextDecoder().decode(chunk);
      const lines = text.split('\n');

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

  // 通过 TransformStream 返回响应
  const transformedBody = response.body?.pipeThrough(transformStream);
  return new Response(transformedBody, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
