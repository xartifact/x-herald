import type { Context } from 'hono';

import type { VirtualKey } from '@/features/keys/db';

import { normalizeProviderErrorMessage, parseProviderError, extractProviderResponseHeaders } from './error-classifier';
import { logRequest } from './log-service';
import { mergeResponseHeaders } from './response-handlers';

export interface ProviderErrorParams {
  c: Context;
  response: Response;
  provider: { id: string; name: string };
  virtualKey: VirtualKey;
  originalModelName: string;
  requestHeaders: Record<string, string>;
  providerRequestHeaders: Record<string, string>;
  rawBody: unknown;
  clientIp: string;
  userAgent: string;
  requestPath: string;
  requestMethod: string;
  isStreaming: boolean;
  startTime: number;
  transformedBody?: unknown;
  incomingProtocol?: string;
  targetProtocol?: string;
  logId?: string;
  retryCount?: number;
}

export async function handleProviderError(params: ProviderErrorParams): Promise<Response> {
  const {
    c, response, provider, virtualKey, originalModelName,
    requestHeaders, providerRequestHeaders, rawBody,
    clientIp, userAgent, requestPath, requestMethod,
    isStreaming, startTime, transformedBody,
    incomingProtocol, targetProtocol, logId, retryCount,
  } = params;

  const errorData = await parseProviderError(response);
  const rawErrorMessage = errorData.error?.message || 'Provider request failed';
  const normalized = normalizeProviderErrorMessage(rawErrorMessage);
  const responseTimeMs = Date.now() - startTime;
  const providerResponseHeaders = extractProviderResponseHeaders(response);
  const clientResponseHeaders = { 'content-type': 'application/json; charset=utf-8' };
  const mergedHeaders = mergeResponseHeaders(clientResponseHeaders, providerResponseHeaders);

  for (const [key, value] of Object.entries(mergedHeaders)) { c.header(key, value); }

  await logRequest({
    virtualKey, modelName: originalModelName, providerId: provider.id, providerName: provider.name,
    status: 'failure', statusCode: response.status, responseTimeMs,
    requestHeaders, providerRequestHeaders, requestBody: rawBody, transformedRequestBody: transformedBody,
    providerResponseHeaders, clientResponseHeaders: mergedHeaders,
    providerResponseBody: errorData, responseBody: errorData,
    errorMessage: rawErrorMessage, errorType: 'provider_error',
    clientIp, userAgent, requestPath, requestMethod, streaming: isStreaming,
    incomingProtocol, targetProtocol, logId, retryCount,
  });

  return c.json(
    { error: { type: 'provider_error', code: normalized.code, message: normalized.message, provider: provider.name } },
    response.status as 400 | 401 | 403 | 429 | 500,
  );
}

export async function handleProviderErrorPassthrough(params: ProviderErrorParams): Promise<Response> {
  const {
    c, response, provider, virtualKey, originalModelName,
    requestHeaders, providerRequestHeaders, rawBody,
    clientIp, userAgent, requestPath, requestMethod,
    isStreaming, startTime, transformedBody,
    incomingProtocol, targetProtocol, logId, retryCount,
  } = params;

  const responseClone = response.clone();
  const errorData = await parseProviderError(responseClone);
  const rawErrorMessage = errorData.error?.message || 'Provider request failed';
  const responseTimeMs = Date.now() - startTime;
  const providerResponseHeaders = extractProviderResponseHeaders(response);

  await logRequest({
    virtualKey, modelName: originalModelName, providerId: provider.id, providerName: provider.name,
    status: 'failure', statusCode: response.status, responseTimeMs,
    requestHeaders, providerRequestHeaders, requestBody: rawBody, transformedRequestBody: transformedBody,
    providerResponseHeaders, providerResponseBody: errorData, responseBody: errorData,
    errorMessage: rawErrorMessage, errorType: 'provider_error',
    clientIp, userAgent, requestPath, requestMethod, streaming: isStreaming,
    incomingProtocol, targetProtocol, logId, retryCount,
  });

  const passthroughHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(providerResponseHeaders)) {
    const lower = key.toLowerCase();
    if (lower === 'transfer-encoding' || lower === 'connection') continue;
    passthroughHeaders[key] = value;
  }
  for (const [key, value] of Object.entries(passthroughHeaders)) { c.header(key, value); }

  return c.json(errorData, response.status as 400 | 401 | 403 | 429 | 500);
}
