import type { Context } from 'hono';

import type { VirtualKey } from '@x-llm-gateway/db';

import {
  normalizeProviderErrorMessage,
  parseProviderError,
  extractProviderResponseHeaders,
} from './error-classifier';
import { logRequest } from './log-service';
import { mergeResponseHeaders } from './response-handlers';
import {
  ModelNotFoundError,
  ModelDisabledError,
  NoAvailableInstanceError,
  NoSuitableInstanceError,
  RequestRejectedError,
} from './model-group-router';

export { normalizeProviderErrorMessage } from './error-classifier';

export interface GatewayErrorParams {
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
  retryCount?: number;
}

export type { GatewayErrorParams as ErrorHandlerParams };

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
  attemptId?: string;
  retryCount?: number;
}

export type { ProviderErrorParams as ProviderErrorHandlerParams };

function extractDetailedErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Internal server error';
  let msg = error.message;
  if (error.cause instanceof Error) msg += `: ${error.cause.message}`;
  else if (error.cause != null) msg += `: ${String(error.cause)}`;
  return msg;
}

async function logFailure(
  params: GatewayErrorParams,
  opts: { statusCode: number; errorMessage: string; errorType: string; requestedModel: string; responseTimeMs: number },
): Promise<void> {
  const { virtualKey, requestHeaders, clientIp, userAgent, requestPath, requestMethod, isStreaming, incomingProtocol, targetProtocol, logId, retryCount } = params;
  await logRequest({
    virtualKey,
    modelName: opts.requestedModel,
    status: 'failure',
    statusCode: opts.statusCode,
    responseTimeMs: opts.responseTimeMs,
    requestHeaders,
    requestBody: params.rawBody,
    errorMessage: opts.errorMessage,
    errorType: opts.errorType,
    clientIp,
    userAgent,
    requestPath,
    requestMethod,
    streaming: isStreaming,
    incomingProtocol,
    targetProtocol,
    logId,
    retryCount,
  });
}

export async function handleGatewayError(params: GatewayErrorParams): Promise<Response> {
  const { error, c } = params;
  const responseTimeMs = Date.now() - params.startTime;
  const rawBody = params.rawBody as { model?: string } | undefined;
  const requestedModel = rawBody?.model || 'unknown';
  const logBase = { ...params, requestedModel, responseTimeMs };

  if (error instanceof ModelNotFoundError) {
    await logFailure(logBase, { statusCode: 404, errorMessage: error.message, errorType: 'model_not_found', requestedModel, responseTimeMs });
    return c.json({ error: { type: 'not_found_error', message: error.message } }, 404);
  }

  if (error instanceof ModelDisabledError) {
    await logFailure(logBase, { statusCode: 400, errorMessage: error.message, errorType: 'model_disabled', requestedModel, responseTimeMs });
    return c.json({ error: { type: 'invalid_request_error', message: error.message } }, 400);
  }

  if (error instanceof RequestRejectedError) {
    await logFailure(logBase, { statusCode: 403, errorMessage: error.message, errorType: 'request_rejected', requestedModel, responseTimeMs });
    return c.json({ error: { type: 'permission_error', message: error.message } }, 403);
  }

  if (error instanceof NoAvailableInstanceError || error instanceof NoSuitableInstanceError) {
    await logFailure(logBase, { statusCode: 503, errorMessage: error.message, errorType: 'service_unavailable', requestedModel, responseTimeMs });
    return c.json({ error: { type: 'service_unavailable', message: error.message } }, 503);
  }

  const detailedErrorMessage = extractDetailedErrorMessage(error);
  await logRequest({
    virtualKey: params.virtualKey,
    modelName: requestedModel,
    status: 'failure',
    statusCode: 500,
    responseTimeMs,
    requestHeaders: params.requestHeaders,
    providerRequestHeaders: params.providerRequestHeaders,
    requestBody: params.rawBody,
    transformedRequestBody: params.transformedBody,
    errorMessage: detailedErrorMessage,
    errorType: 'internal_error',
    clientIp: params.clientIp,
    userAgent: params.userAgent,
    requestPath: params.requestPath,
    requestMethod: params.requestMethod,
    streaming: params.isStreaming,
    incomingProtocol: params.incomingProtocol,
    targetProtocol: params.targetProtocol,
    logId: params.logId,
    retryCount: params.retryCount,
  });

  return c.json({ error: { type: 'internal_error', message: detailedErrorMessage } }, 500);
}

export async function handleProviderError(params: ProviderErrorParams): Promise<Response> {
  const {
    c, response, provider, virtualKey, originalModelName,
    requestHeaders, providerRequestHeaders, rawBody,
    clientIp, userAgent, requestPath, requestMethod,
    isStreaming, startTime, transformedBody,
    incomingProtocol, targetProtocol, logId, attemptId, retryCount,
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
    incomingProtocol, targetProtocol, logId, attemptId, retryCount,
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
    incomingProtocol, targetProtocol, logId, attemptId, retryCount,
  } = params;

  const responseClone = response.clone();
  const errorData = await parseProviderError(responseClone as any);
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
    incomingProtocol, targetProtocol, logId, attemptId, retryCount,
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
