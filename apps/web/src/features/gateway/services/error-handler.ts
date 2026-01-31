import {
  ModelNotFoundError,
  ModelDisabledError,
  NoAvailableInstanceError,
  NoSuitableInstanceError,
} from './model-group-router';
import { logRequest } from './log-service';
import type { VirtualKey } from '@/features/keys/db';
import type { Context } from 'hono';

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

  // 处理特定错误类型
  if (error instanceof ModelNotFoundError) {
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

  await logRequest({
    virtualKey,
    modelName: 'unknown',
    status: 'failure',
    statusCode: 500,
    latencyMs,
    requestHeaders,
    errorMessage: error instanceof Error ? error.message : 'Internal server error',
    errorType: 'internal_error',
    clientIp,
    userAgent,
    requestPath,
    requestMethod,
    streaming: isStreaming,
  });

  return c.json(
    {
      error: {
        type: 'internal_error',
        message: error instanceof Error ? error.message : 'Internal server error',
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
    return { error: { message: text.substring(0, 500) } };
  }

  // 尝试解析为 JSON
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text.substring(0, 500) || 'Provider request failed' } };
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
  rawBody: unknown,
  clientIp: string,
  userAgent: string,
  requestPath: string,
  requestMethod: string,
  isStreaming: boolean,
  startTime: number,
): Promise<Response> {
  const errorData = await parseProviderError(response);
  const latencyMs = Date.now() - startTime;

  await logRequest({
    virtualKey,
    modelName: originalModelName,
    providerId: provider.id,
    providerName: provider.name,
    status: 'failure',
    statusCode: response.status,
    latencyMs,
    requestHeaders,
    requestBody: rawBody,
    responseBody: errorData,
    errorMessage: errorData.error?.message || 'Provider request failed',
    errorType: 'provider_error',
    clientIp,
    userAgent,
    requestPath,
    requestMethod,
    streaming: isStreaming,
  });

  return c.json(
    {
      error: {
        type: 'provider_error',
        message: errorData.error?.message || 'Provider request failed',
        provider: provider.name,
      },
    },
    response.status as 400 | 401 | 403 | 429 | 500,
  );
}
