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
  clientIp: string;
  userAgent: string;
  requestPath: string;
  requestMethod: string;
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
      clientIp,
      userAgent,
      requestPath,
      requestMethod,
      streaming: true,
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
    responseBody: responseData,
    clientIp,
    userAgent,
    requestPath,
    requestMethod,
    streaming: false,
  });

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

  const latencyMs = Date.now() - startTime;

  // 记录流式请求开始
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
    clientIp,
    userAgent,
    requestPath,
    requestMethod,
    streaming: true,
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
