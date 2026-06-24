import logger from '../../../lib/logger';

import { getTransformer } from '../../transformer';
import { logRequest } from '../log-service';
import type { ResponseHandlerParams } from './params';
import {
  extractProviderResponseHeaders,
  getClientNonStreamingHeaders,
  getClientStreamingHeaders,
  mergeResponseHeaders,
} from './shared';

function buildBaseLogParams(params: ResponseHandlerParams, responseTimeMs: number, providerResponseHeaders: Record<string, string>, mergedHeaders: Record<string, string>) {
  const { virtualKey, provider, resolvedModelName, originalModelName, mappingType, isMapped, requestHeaders, rawBody, clientIp, userAgent, requestPath, requestMethod, incomingProtocol, targetProtocol, startTime, preprocessEndTime, providerTtfbTime } = params;
  return {
    virtualKey, modelName: resolvedModelName || originalModelName, originalModelName, mappingType, isMapped,
    providerId: provider.id, providerName: provider.name, status: 'success' as const, statusCode: 200,
    responseTimeMs, requestHeaders, providerRequestHeaders: params.providerRequestHeaders,
    requestBody: rawBody, transformedRequestBody: params.transformedBody,
    providerResponseHeaders, clientResponseHeaders: mergedHeaders,
    clientIp, userAgent, requestPath, requestMethod, incomingProtocol, targetProtocol,
    conversationId: params.conversationId, clientType: params.clientType,
    logId: params.logId, attemptId: params.attemptId,
    gatewayOverheadMs: preprocessEndTime - startTime, providerTtfbMs: providerTtfbTime - preprocessEndTime,
    retryCount: params.retryCount, routingTrace: params.routingTrace,
  };
}

async function parseJsonSafely(response: Response, ctx: ResponseHandlerParams['ctx'], provider: ResponseHandlerParams['provider']): Promise<unknown> {
  const clone = response.clone();
  try {
    return await clone.json();
  } catch {
    const text = await response.text();
    logger.error({ requestId: ctx.requestId, provider: provider.name, statusCode: response.status }, 'Failed to parse provider response as JSON');
    throw new Error(`Invalid JSON response from provider: ${text}`);
  }
}

async function handleUnexpectedSSE(params: ResponseHandlerParams, response: Response): Promise<Response> {
  const { provider, originalModelName } = params;
  logger.warn({ provider: provider.name, model: originalModelName }, 'Provider returned streaming response for non-streaming request, forwarding as stream');
  const responseTimeMs = Date.now() - params.startTime;
  const providerResponseHeaders = extractProviderResponseHeaders(response);
  const mergedHeaders = mergeResponseHeaders(getClientStreamingHeaders(providerResponseHeaders['content-type']), providerResponseHeaders);
  logRequest({ ...buildBaseLogParams(params, responseTimeMs, providerResponseHeaders, mergedHeaders), streaming: true });
  return new Response(response.body, { headers: mergedHeaders });
}

async function handlePassthrough(params: ResponseHandlerParams, response: Response): Promise<Response> {
  const { c, ctx, provider, isMapped, originalModelName } = params;
  const responseTimeMs = Date.now() - params.startTime;
  const providerResponseHeaders = extractProviderResponseHeaders(response);
  const mergedHeaders = mergeResponseHeaders(getClientNonStreamingHeaders(), providerResponseHeaders);
  const providerResponseData = await parseJsonSafely(response, ctx, provider) as Record<string, unknown>;
  for (const [key, value] of Object.entries(mergedHeaders)) c.header(key, value);
  await logRequest({ ...buildBaseLogParams(params, responseTimeMs, providerResponseHeaders, mergedHeaders), streaming: false, providerResponseBody: providerResponseData, responseBody: providerResponseData });
  if (isMapped && originalModelName && providerResponseData?.model !== undefined) providerResponseData.model = originalModelName;
  return c.json(providerResponseData);
}

async function handleTransformed(params: ResponseHandlerParams, response: Response): Promise<Response> {
  const { c, ctx, provider, incomingProtocol, targetProtocol, isMapped, originalModelName } = params;

  if (!response.body) {
    logger.error({ requestId: ctx.requestId, provider: provider.name }, 'Provider returned response without body');
    throw new Error('Provider returned empty response body');
  }

  const providerResponseData = await parseJsonSafely(response, ctx, provider) as Record<string, unknown>;
  if (providerResponseData.error) {
    logger.error({ requestId: ctx.requestId, provider: provider.name, error: providerResponseData.error }, 'Provider returned error response');
    throw new Error(`Provider error: ${(providerResponseData.error as Record<string, unknown>)?.message || JSON.stringify(providerResponseData.error)}`);
  }

  const ingressTransformer = getTransformer(targetProtocol);
  if (!ingressTransformer?.normalizeResponse) throw new Error(`No response normalizer for protocol: ${targetProtocol}`);
  const standardRes = await ingressTransformer.normalizeResponse(response, ctx);

  const egressTransformer = getTransformer(incomingProtocol);
  if (!egressTransformer?.adaptResponse) throw new Error(`No response adapter for protocol: ${incomingProtocol}`);
  const adaptedRes = await egressTransformer.adaptResponse(standardRes, ctx);
  const responseData = await adaptedRes.json() as Record<string, unknown>;

  const responseTimeMs = Date.now() - params.startTime;
  const providerResponseHeaders = extractProviderResponseHeaders(response);
  const mergedHeaders = mergeResponseHeaders(getClientNonStreamingHeaders(), providerResponseHeaders);
  for (const [key, value] of Object.entries(mergedHeaders)) c.header(key, value);

  await logRequest({
    ...buildBaseLogParams(params, responseTimeMs, providerResponseHeaders, mergedHeaders),
    streaming: false,
    inputTokens: standardRes.usage?.prompt_tokens, outputTokens: standardRes.usage?.completion_tokens,
    providerResponseBody: providerResponseData, responseBody: responseData,
    routingTrace: { ...params.routingTrace, responseModelName: providerResponseData?.model as string | undefined },
  });

  if (isMapped && originalModelName && responseData?.model !== undefined) responseData.model = originalModelName;
  return c.json(responseData);
}

export async function handleNonStreamingResponse(params: ResponseHandlerParams): Promise<Response> {
  const { response } = params;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) return handleUnexpectedSSE(params, response);
  if (params.isPassthroughEnabled) return handlePassthrough(params, response);
  return handleTransformed(params, response);
}
