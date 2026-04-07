import type { Context } from 'hono';

import type { VirtualKey } from '@/features/keys/db';

import { logRequest } from './log-service';
import {
  ModelNotFoundError,
  ModelDisabledError,
  NoAvailableInstanceError,
  NoSuitableInstanceError,
} from './model-group-router';
import { mergeResponseHeaders } from './response-handlers';



/**
 * 将字节数转为带一位小数的 MB 字符串
 */
function bytesToMB(bytes: number): string {
  return (Math.round(bytes / 1024 / 1024 * 10) / 10).toFixed(1);
}

/**
 * 规范化 Provider 错误消息
 * 将技术性原始错误转为用户可读描述，并返回结构化 code
 */
export function normalizeProviderErrorMessage(rawMessage: string): {
  message: string;
  code: string;
} {
  // 1. 消息体超 Provider 限制
  // 例：total message size 10852702 exceeds limit 2097152
  const sizeMatch = rawMessage.match(/total message size (\d+) exceeds limit (\d+)/i);
  if (sizeMatch) {
    const actualMB = bytesToMB(parseInt(sizeMatch[1], 10));
    const limitMB = bytesToMB(parseInt(sizeMatch[2], 10));
    return {
      code: 'context_length_exceeded',
      message: `Message content too large (~${actualMB} MB). Model limit is ${limitMB} MB. Please reduce conversation history.`,
    };
  }

  // 2. Provider 服务连接失败
  // 例：Cannot connect to host 10.86.0.141:8131 ssl:default [Connect call failed]
  if (/Cannot connect to host|Connect call failed/i.test(rawMessage)) {
    return {
      code: 'provider_service_unavailable',
      message: 'Provider service is temporarily unavailable. Please try again later.',
    };
  }

  // 3. 请求体超网关大小限制
  // 例：Exceeded limit on max bytes to request body : 6291456
  const bodyLimitMatch = rawMessage.match(/Exceeded limit on max bytes to request body\s*:\s*(\d+)/i);
  if (bodyLimitMatch) {
    const limitMB = bytesToMB(parseInt(bodyLimitMatch[1], 10));
    return {
      code: 'request_too_large',
      message: `Request body too large (~${limitMB} MB). Please reduce request size.`,
    };
  }

  // 4. Tool call 格式错误
  // 例：an assistant message with 'tool_calls' must be followed by tool messages...
  if (/an assistant message with 'tool_calls' must be followed by tool messages/i.test(rawMessage)) {
    const idsMatch = rawMessage.match(/tool_call_ids did not have response messages:\s*(.+)$/i);
    const idsPart = idsMatch ? ` Missing IDs: ${idsMatch[1].trim()}.` : '';
    return {
      code: 'invalid_tool_call_format',
      message: `Invalid message format: tool_call responses are missing.${idsPart}`,
    };
  }

  // 5. 兜底：未识别错误，保留原始消息
  return {
    code: 'provider_error',
    message: rawMessage,
  };
}

interface ErrorHandlerParams {
  error: unknown;
  c: Context;
  virtualKey: VirtualKey;
  requestHeaders: Record<string, string>;
  clientIp: string;
  userAgent: string;
  requestPath: string;
  requestMethod: string;
  isStreaming: boolean;
  startTime: number;
  transformedBody?: unknown;
  rawBody?: unknown;
  incomingProtocol?: string;
  targetProtocol?: string;
  providerRequestHeaders?: Record<string, string>;
  logId?: string;
}

/**
 * 提取详细错误消息，包括 cause 链
 * Bun/Node fetch 失败时真实原因在 error.cause 里
 */
function extractDetailedErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Internal server error';
  }
  let msg = error.message;
  if (error.cause instanceof Error) {
    msg += `: ${error.cause.message}`;
  } else if (error.cause != null) {
    msg += `: ${String(error.cause)}`;
  }
  return msg;
}

/**
 * 提取 Provider 响应头信息（保留所有信息）
 */
function extractProviderResponseHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

/**
 * 生成客户端错误响应头
 */
function getClientErrorHeaders(): Record<string, string> {
  return {
    'content-type': 'application/json; charset=utf-8',
  };
}

/**
 * 处理网关错误
 */
export async function handleGatewayError(
  params: ErrorHandlerParams,
): Promise<Response> {
  const {
    error,
    c,
    virtualKey,
    requestHeaders,
    clientIp,
    userAgent,
    requestPath,
    requestMethod,
    isStreaming,
    startTime,
  } = params;

  const latencyMs = Date.now() - startTime;
  const rawBody = params.rawBody as { model?: string } | undefined;
  const requestedModel = rawBody?.model || 'unknown';

  // 处理特定错误类型 - 记录日志后返回
  if (error instanceof ModelNotFoundError) {
    await logRequest({
      virtualKey,
      modelName: requestedModel,
      status: 'failure',
      statusCode: 404,
      latencyMs,
      requestHeaders,
      requestBody: params.rawBody,
      errorMessage: error.message,
      errorType: 'model_not_found',
      clientIp,
      userAgent,
      requestPath,
      requestMethod,
      streaming: isStreaming,
      incomingProtocol: params.incomingProtocol,
      targetProtocol: params.targetProtocol,
      logId: params.logId,
    });
    return c.json(
      {
        error: {
          type: 'not_found_error',
          message: error.message,
        },
      },
      404,
    );
  }

  if (error instanceof ModelDisabledError) {
    await logRequest({
      virtualKey,
      modelName: requestedModel,
      status: 'failure',
      statusCode: 400,
      latencyMs,
      requestHeaders,
      requestBody: params.rawBody,
      errorMessage: error.message,
      errorType: 'model_disabled',
      clientIp,
      userAgent,
      requestPath,
      requestMethod,
      streaming: isStreaming,
      incomingProtocol: params.incomingProtocol,
      targetProtocol: params.targetProtocol,
      logId: params.logId,
    });
    return c.json(
      {
        error: {
          type: 'invalid_request_error',
          message: error.message,
        },
      },
      400,
    );
  }

  if (error instanceof NoAvailableInstanceError || error instanceof NoSuitableInstanceError) {
    await logRequest({
      virtualKey,
      modelName: requestedModel,
      status: 'failure',
      statusCode: 503,
      latencyMs,
      requestHeaders,
      requestBody: params.rawBody,
      errorMessage: error.message,
      errorType: 'service_unavailable',
      clientIp,
      userAgent,
      requestPath,
      requestMethod,
      streaming: isStreaming,
      incomingProtocol: params.incomingProtocol,
      targetProtocol: params.targetProtocol,
      logId: params.logId,
    });
    return c.json(
      {
        error: {
          type: 'service_unavailable',
          message: error.message,
        },
      },
      503,
    );
  }

  const detailedErrorMessage = extractDetailedErrorMessage(error);

  await logRequest({
    virtualKey,
    modelName: requestedModel,
    status: 'failure',
    statusCode: 500,
    latencyMs,
    requestHeaders,
    providerRequestHeaders: params.providerRequestHeaders,
    requestBody: params.rawBody,
    transformedRequestBody: params.transformedBody,
    errorMessage: detailedErrorMessage,
    errorType: 'internal_error',
    clientIp,
    userAgent,
    requestPath,
    requestMethod,
    streaming: isStreaming,
    incomingProtocol: params.incomingProtocol,
    targetProtocol: params.targetProtocol,
    logId: params.logId,
  });

  return c.json(
    {
      error: {
        type: 'internal_error',
        message: detailedErrorMessage,
      },
    },
    500,
  );
}

/**
 * 解析 Provider 错误响应
 * 处理 JSON 和 SSE 两种格式
 */
async function parseProviderError(response: Response): Promise<{ error?: { message?: string }; [key: string]: unknown }> {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text().catch(() => '');

  // 如果是 SSE 格式，解析 data: 行
  if (contentType.includes('text/event-stream') || text.startsWith('data:')) {
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          return JSON.parse(data);
        } catch {
          // 解析失败，继续尝试下一行
        }
      }
    }
    return { error: { message: text } };
  }

  // 尝试解析为 JSON
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text || 'Provider request failed' } };
  }
}

/**
 * 处理 Provider 错误
 */
export async function handleProviderError(
  c: Context,
  response: Response,
  provider: { id: string; name: string },
  virtualKey: VirtualKey,
  originalModelName: string,
  requestHeaders: Record<string, string>,
  providerRequestHeaders: Record<string, string>,
  rawBody: unknown,
  clientIp: string,
  userAgent: string,
  requestPath: string,
  requestMethod: string,
  isStreaming: boolean,
  startTime: number,
  transformedBody?: unknown,
  incomingProtocol?: string,
  targetProtocol?: string,
  logId?: string,
): Promise<Response> {
  const errorData = await parseProviderError(response);
  const rawErrorMessage = errorData.error?.message || 'Provider request failed';
  const normalized = normalizeProviderErrorMessage(rawErrorMessage);
  const latencyMs = Date.now() - startTime;
  const providerResponseHeaders = extractProviderResponseHeaders(response);
  const clientResponseHeaders = getClientErrorHeaders();

  const mergedHeaders = mergeResponseHeaders(
    clientResponseHeaders,
    providerResponseHeaders
  );

  // 设置响应头
  for (const [key, value] of Object.entries(mergedHeaders)) {
    c.header(key, value);
  }

  await logRequest({
    virtualKey,
    modelName: originalModelName,
    providerId: provider.id,
    providerName: provider.name,
    status: 'failure',
    statusCode: response.status,
    latencyMs,
    requestHeaders,
    providerRequestHeaders,
    requestBody: rawBody,
    transformedRequestBody: transformedBody,
    providerResponseHeaders,
    clientResponseHeaders: mergedHeaders,
    providerResponseBody: errorData,
    responseBody: errorData,
    errorMessage: rawErrorMessage,
    errorType: 'provider_error',
    clientIp,
    userAgent,
    requestPath,
    requestMethod,
    streaming: isStreaming,
    incomingProtocol,
    targetProtocol,
    logId,
  });

  return c.json(
    {
      error: {
        type: 'provider_error',
        code: normalized.code,
        message: normalized.message,
        provider: provider.name,
      },
    },
    response.status as 400 | 401 | 403 | 429 | 500,
  );
}

/**
 * 透传模式下处理 Provider 错误
 * 直接将 Provider 的原始错误响应转发给客户端，不做任何重写
 */
export async function handleProviderErrorPassthrough(
  c: Context,
  response: Response,
  provider: { id: string; name: string },
  virtualKey: VirtualKey,
  originalModelName: string,
  requestHeaders: Record<string, string>,
  providerRequestHeaders: Record<string, string>,
  rawBody: unknown,
  clientIp: string,
  userAgent: string,
  requestPath: string,
  requestMethod: string,
  isStreaming: boolean,
  startTime: number,
  transformedBody?: unknown,
  incomingProtocol?: string,
  targetProtocol?: string,
  logId?: string,
): Promise<Response> {
  const responseClone = response.clone();
  const errorData = await parseProviderError(responseClone);
  const rawErrorMessage = errorData.error?.message || 'Provider request failed';
  const latencyMs = Date.now() - startTime;
  const providerResponseHeaders = extractProviderResponseHeaders(response);

  // 记录日志（仍需记录用于监控和排查）
  await logRequest({
    virtualKey,
    modelName: originalModelName,
    providerId: provider.id,
    providerName: provider.name,
    status: 'failure',
    statusCode: response.status,
    latencyMs,
    requestHeaders,
    providerRequestHeaders,
    requestBody: rawBody,
    transformedRequestBody: transformedBody,
    providerResponseHeaders,
    providerResponseBody: errorData,
    responseBody: errorData,
    errorMessage: rawErrorMessage,
    errorType: 'provider_error',
    clientIp,
    userAgent,
    requestPath,
    requestMethod,
    streaming: isStreaming,
    incomingProtocol,
    targetProtocol,
    logId,
  });

  // 透传 Provider 原始响应：保留原始状态码和响应头
  const passthroughHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(providerResponseHeaders)) {
    // 过滤 hop-by-hop 头和传输编码头
    const lower = key.toLowerCase();
    if (lower === 'transfer-encoding' || lower === 'connection') continue;
    passthroughHeaders[key] = value;
  }

  for (const [key, value] of Object.entries(passthroughHeaders)) {
    c.header(key, value);
  }

  return c.json(
    errorData,
    response.status as 400 | 401 | 403 | 429 | 500,
  );
}
