import type { Context } from 'hono';

import type { VirtualKey } from '../../features/keys/db';

import { logRequest } from './log-service';
import {
  ModelNotFoundError,
  ModelDisabledError,
  NoAvailableInstanceError,
  NoSuitableInstanceError,
  RequestRejectedError,
} from './model-group-router';

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
