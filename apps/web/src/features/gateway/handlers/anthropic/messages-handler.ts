import type { Context } from 'hono';

import { loadConfig } from '@/core/config';
import logger from '@/core/lib/logger';
import type { VirtualKey } from '@/features/keys/db';

import { normalizeAnthropicPassthroughMessages, hasAssistantMessagesWithoutThinking, injectSyntheticThinkingBlocks } from './thinking-validator';
import { circuitBreakerRegistry } from '../../services/circuit-breaker';
import { identifyClient } from '../../services/client-identifier';
import { handleGatewayError, handleProviderError, handleProviderErrorPassthrough } from '../../services/error-handler';
import { shouldFilterHeader } from '../../services/headers';
import { logEventBus } from '../../services/log-event-bus';
import { logRequestStart, markLogAsFailed } from '../../services/log-service';
import { ModelNotFoundError } from '../../services/model-group-router';
import { getProviderProtocol, getProviderUrl, getEndpoint } from '../../services/protocol-detector';
import { handleNonStreamingResponse, handleStreamingResponse } from '../../services/response-handlers';
import { virtualModelRouter } from '../../services/virtual-model-router';
import { getTransformer, createTransformerContext } from '../../transformer';
import { buildHeaders } from '../../transformer/shared/parameter-transformer';
import { AbortManager } from '../shared/abort-manager';
import { executeFailoverIteration, type PreparedRequest } from '../shared/failover-executor';
import { joinUrl } from '../shared/join-url';

/**
 * Anthropic messages handler with failover support.
 *
 * Pipeline:
 *  1. Parse + normalize request
 *  2. Check model permissions
 *  3. Resolve ordered candidate list (strategy: priority / round_robin / weighted)
 *  4. For each candidate:
 *     a. Select target protocol, build request body + headers (incl. Anthropic-specific thinking logic)
 *     b. Log request start (pending)
 *     c. Execute with per-instance retry (exponential backoff)
 *     d. On abort (client disconnect / TTFB timeout): return immediately
 *     e. On server error (5xx/429): record circuit breaker failure, failover to next candidate
 *     f. On success: record circuit breaker success, return response
 *  5. If all candidates exhausted: return last provider error
 */
export async function handleAnthropicMessages(
  c: Context,
  isStreaming: boolean,
  preprocessedBody?: Record<string, unknown>,
): Promise<Response> {
  const startTime = Date.now();
  const requestId = c.get('requestId') ?? crypto.randomUUID();
  const virtualKey = c.get('virtualKey') as VirtualKey;
  const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  const userAgent = c.req.header('user-agent') || 'unknown';
  const requestPath = c.req.path;
  const requestMethod = c.req.method;

  const clientRequestHeaders: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    clientRequestHeaders[key.toLowerCase()] = value;
  });

  const clientInfo = identifyClient(userAgent, clientRequestHeaders);
  const clientType = clientInfo.type;
  const conversationId = c.req.header('x-conversation-id') || undefined;

  let rawBody: { model?: string; [key: string]: unknown } | undefined;
  let transformedBody: unknown;
  const incomingProtocol: 'anthropic' = 'anthropic';
  let targetProtocol: 'openai' | 'anthropic' | undefined;
  let providerRequestHeaders: Record<string, string> | undefined;
  let logId: string | undefined;
  let retryCount = 0;

  try {
    rawBody = (preprocessedBody ?? (await c.req.json())) as { model?: string; [key: string]: unknown };

    logger.info(
      { requestId, model: rawBody.model, protocol: incomingProtocol },
      'Processing Anthropic messages request',
    );

    const ingressTransformer = getTransformer(incomingProtocol);
    if (!ingressTransformer?.normalizeRequest) {
      throw new Error(`No transformer found for protocol: ${incomingProtocol}`);
    }

    const ctx = createTransformerContext(requestId);
    const standardReq = await ingressTransformer.normalizeRequest(rawBody, ctx);
    const standardRequestBody = standardReq;

    if (virtualKey.allowedModels?.length && !virtualKey.allowedModels.includes(standardReq.model)) {
      return c.json(
        { type: 'error', error: { type: 'permission_error', message: 'Your API key does not have permission to use this model' } },
        403,
      );
    }

    const routingContext = {
      requestedModel: standardReq.model,
      streaming: standardReq.stream || false,
      hasTools: !!standardReq.tools?.length,
      hasVision: standardReq.messages.some((m) =>
        Array.isArray(m.content) && m.content.some((c) => c.type === 'image_url')
      ),
      virtualKeyId: virtualKey.id,
    };

    // 获取按策略排序的候选实例列表（支持故障转移）
    const candidates = await virtualModelRouter.routeCandidates(routingContext);
    if (!candidates.length) {
      throw new ModelNotFoundError(standardReq.model);
    }

    const config = loadConfig();
    const abortManager = new AbortManager(c.req.raw.signal);
    abortManager.registerClientDisconnect();

    try {
      for (let candidateIdx = 0; candidateIdx < candidates.length; candidateIdx++) {
        const routeResult = candidates[candidateIdx];
        const { instance, provider, group, decision, mapping, matchedRule, perf } = routeResult;
        const isLastCandidate = candidateIdx === candidates.length - 1;
        const baselineTtfbP95 = perf?.ttfbP95 ?? perf?.ttfbAvg ?? undefined;

        if (candidateIdx > 0) {
          logger.info(
            { requestId, instanceId: instance.id, instanceName: instance.name, candidateIdx },
            '[Failover] Trying next candidate instance',
          );
        }

        logger.debug(
          {
            requestId,
            originalModel: mapping.originalModel,
            resolvedModel: mapping.modelName,
            mappingType: mapping.mappingType,
            groupName: group.name,
            provider: provider.name,
            actualModel: instance.actualModelName,
            strategy: decision.strategy,
          },
          'Model routed via group',
        );

        targetProtocol = getProviderProtocol(incomingProtocol, provider);
        const providerUrl = getProviderUrl(provider, targetProtocol);

        const isSameProtocol = incomingProtocol === targetProtocol;
        const isPassthroughEnabled =
          isSameProtocol &&
          config.sameProtocolPassthrough.enabled &&
          config.sameProtocolPassthrough.allowedProtocols.includes(incomingProtocol);

        if (!providerUrl) {
          if (!isLastCandidate) continue;
          return c.json(
            { type: 'error', error: { type: 'protocol_error', message: `Protocol '${targetProtocol}' not configured for provider` } },
            400,
          );
        }

        const retryConfig = {
          maxRetries: instance.config?.retryConfig?.maxRetries ?? 2,
          baseDelay: instance.config?.retryConfig?.retryDelay ?? 500,
          maxDelay: 30000,
          retryableStatusCodes: instance.config?.retryConfig?.retryableStatusCodes ?? [429, 500, 502, 503, 524],
        };

        const circuitBreakerMeta = { instanceName: instance.name, groupName: group.name, providerName: provider.name };

        let providerTtfbTime = 0;
        let _preprocessEndTime = Date.now();

        const result = await executeFailoverIteration({
          c,
          abortManager,
          onPrepareRequest: async (): Promise<PreparedRequest> => {
            standardReq.model = instance.actualModelName;
            // targetProtocol is guaranteed here because we checked providerUrl before calling executeFailoverIteration
            const protocol = targetProtocol!;

            ctx.provider = {
              name: provider.name,
              baseUrl: providerUrl,
              apiKey: provider.apiKey || '',
              protocol: protocol,
              models: [],
              protocols: provider.protocols,
            };
            ctx.instanceConfig = instance.config ?? undefined;

            let targetUrl: string;

            if (isPassthroughEnabled) {
              const passthroughBody: { model?: string; messages?: unknown[]; [key: string]: unknown } = {
                ...rawBody,
                model: instance.actualModelName,
              };

              if (Array.isArray(passthroughBody.messages)) {
                passthroughBody.messages = normalizeAnthropicPassthroughMessages(
                  passthroughBody.messages as Array<{ role: string; content: unknown }>,
                );
              }

              const providerSupportsThinking =
                provider.protocols?.anthropic?.enabled &&
                (instance.config?.supportsThinking === true ||
                  instance.actualModelName.includes('claude-3-7-') ||
                  instance.actualModelName.includes('claude-4'));

              if (
                Array.isArray(passthroughBody.messages) &&
                providerSupportsThinking &&
                hasAssistantMessagesWithoutThinking(
                  passthroughBody.messages as Array<{ role: string; content: unknown }>,
                )
              ) {
                passthroughBody.messages = injectSyntheticThinkingBlocks(
                  passthroughBody.messages as Array<{ role: string; content: unknown }>,
                );
              }

              transformedBody = passthroughBody;
              targetUrl = joinUrl(providerUrl, getEndpoint(protocol, isStreaming));
              providerRequestHeaders = {
                ...Object.fromEntries(
                  Object.entries(clientRequestHeaders).filter(([key]) => !shouldFilterHeader(key))
                ),
                'x-api-key': provider.apiKey || '',
              };
            } else {
              const egressTransformer = getTransformer(protocol);
              if (!egressTransformer?.adaptRequest) {
                throw new Error(`No adapter found for protocol: ${protocol}`);
              }
              const adapted = await egressTransformer.adaptRequest(standardReq, ctx);
              transformedBody = adapted.body;
              targetUrl = adapted.url || joinUrl(providerUrl, getEndpoint(protocol, isStreaming));

              if (protocol === 'anthropic') {
                providerRequestHeaders = {
                  ...Object.fromEntries(
                    Object.entries(clientRequestHeaders).filter(([key]) => !shouldFilterHeader(key))
                  ),
                  ...Object.fromEntries(
                    Object.entries(adapted.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
                  ),
                  'x-api-key': provider.apiKey || '',
                };
              } else {
                providerRequestHeaders = {
                  ...Object.fromEntries(
                    Object.entries(clientRequestHeaders).filter(([key]) => !shouldFilterHeader(key))
                  ),
                  ...Object.fromEntries(
                    Object.entries(adapted.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
                  ),
                  'authorization': `Bearer ${provider.apiKey}`,
                };
              }
            }

            if (ctx.instanceConfig?.customHeaders) {
              providerRequestHeaders = buildHeaders(providerRequestHeaders, ctx.instanceConfig.customHeaders, ctx);
            }

            logger.debug(
              { requestId, targetUrl, targetProtocol: protocol, model: standardReq.model, isPassthrough: isPassthroughEnabled },
              'Forwarding to provider',
            );

            logId = await logRequestStart({
              virtualKey,
              modelName: mapping.modelName,
              originalModelName: mapping.originalModel,
              mappingType: mapping.mappingType,
              isMapped: mapping.isMapped,
              providerId: provider.id,
              providerName: provider.name,
              requestHeaders: clientRequestHeaders,
              providerRequestHeaders,
              requestBody: rawBody,
              standardRequestBody,
              transformedRequestBody: transformedBody,
              clientIp,
              userAgent,
              clientType,
              requestPath,
              requestMethod,
              incomingProtocol,
              targetProtocol: protocol,
              conversationId,
              routingTrace: {
                matchedRuleId: matchedRule?.id,
                matchedRuleName: matchedRule?.name,
                matchedRulePriority: matchedRule?.priority,
                modelGroupId: group.id,
                modelGroupName: group.name,
                instanceId: instance.id,
                actualModelName: instance.actualModelName,
                strategy: decision.strategy,
              },
            });

            _preprocessEndTime = Date.now();

            return {
              url: targetUrl,
              headers: providerRequestHeaders,
              body: JSON.stringify(transformedBody),
              isPassthroughEnabled,
              targetProtocol: protocol,
            } as PreparedRequest;
          },
          isStreaming,
          isLastCandidate,
          requestId,
          startTime,
          logId,
          preprocessEndTime: _preprocessEndTime,
          clientIp,
          userAgent,
          requestPath,
          requestMethod,
          rawBody: rawBody as { model?: string; [key: string]: unknown },
          baselineTtfbP95,
          retryConfig,
          onBeforeFetch: () => {
            if (isStreaming && logId) {
              logEventBus.emitLog({
                event: 'waiting',
                logId,
                modelName: mapping.modelName || mapping.originalModel || (rawBody?.model) || 'unknown',
                originalModelName: mapping.originalModel ?? undefined,
                providerName: provider.name,
                virtualKeyName: virtualKey.name ?? undefined,
                startTime,
                incomingProtocol,
              });
            }
          },
          onRetry: (attempt, delay, lastResponse) => {
            logger.info(
              { requestId, attempt, statusCode: lastResponse?.status, retryDelay: delay },
              '[Retry] Retrying upstream request',
            );
            circuitBreakerRegistry.recordFailure(instance.id, circuitBreakerMeta);
          },
          onRecordFailure: () => circuitBreakerRegistry.recordFailure(instance.id, circuitBreakerMeta),
          onRecordSuccess: () => circuitBreakerRegistry.recordSuccess(instance.id, circuitBreakerMeta),
          onMarkLogAsFailed: async (id, statusCode, errorMessage, retryCountParam, duration, body) => {
            await markLogAsFailed(id, statusCode, errorMessage, retryCountParam, duration, body);
          },
          onLogEventBusEmitAborted: (id) => logEventBus.emitLog({ event: 'aborted', logId: id }),
          handleGatewayError: async (errorCode, message) => {
            return handleGatewayError({
              error: new Error(message),
              c,
              virtualKey,
              requestHeaders: clientRequestHeaders,
              providerRequestHeaders: providerRequestHeaders || {},
              rawBody: rawBody || {},
              clientIp,
              userAgent,
              requestPath,
              requestMethod,
              isStreaming,
              startTime,
              transformedBody,
              incomingProtocol,
              targetProtocol,
              logId,
              retryCount,
            });
          },
          handleProviderError: async (response, _rb) => {
            const errorHandler = isPassthroughEnabled ? handleProviderErrorPassthrough : handleProviderError;
            return errorHandler({
              c,
              response,
              provider,
              virtualKey,
              originalModelName: (rawBody?.model as string) || 'unknown',
              requestHeaders: clientRequestHeaders,
              providerRequestHeaders: providerRequestHeaders || {},
              rawBody: rawBody || {},
              clientIp,
              userAgent,
              requestPath,
              requestMethod,
              isStreaming,
              startTime,
              transformedBody,
              incomingProtocol,
              targetProtocol,
              logId,
              retryCount,
            });
          },
          handleProviderErrorPassthrough: async (response, _rb) => {
            return handleProviderErrorPassthrough({
              c,
              response,
              provider,
              virtualKey,
              originalModelName: (rawBody?.model as string) || 'unknown',
              requestHeaders: clientRequestHeaders,
              providerRequestHeaders: providerRequestHeaders || {},
              rawBody: rawBody || {},
              clientIp,
              userAgent,
              requestPath,
              requestMethod,
              isStreaming,
              startTime,
              transformedBody,
              incomingProtocol,
              targetProtocol,
              logId,
              retryCount,
            });
          },
        });

        providerTtfbTime = Date.now();
        retryCount = result.retryCount ?? 0;

        // Handle result types
        if (result.type === 'abort') {
          return handleGatewayError({
            error: new Error(`Request aborted`),
            c,
            virtualKey,
            requestHeaders: clientRequestHeaders,
            providerRequestHeaders,
            rawBody,
            clientIp,
            userAgent,
            requestPath,
            requestMethod,
            isStreaming,
            startTime,
            transformedBody,
            incomingProtocol,
            targetProtocol,
            logId,
            retryCount,
          });
        }

        if (result.type === 'failover') {
          logger.warn(
            { requestId, instanceId: instance.id, statusCode: result.response?.status },
            '[Failover] Instance failed, switching to next candidate',
          );
          continue;
        }

        if (result.type === 'error') {
          return result.response!;
        }

        // result.type === 'success' (onRecordSuccess already called by executor)
        const response = result.response!;

        const actualStreaming = standardReq.stream === true;
        const modelName = rawBody.model || 'unknown';
        const handlerParams = {
          c,
          response,
          ctx,
          incomingProtocol,
          targetProtocol,
          virtualKey,
          provider,
          originalModelName: modelName,
          resolvedModelName: mapping.modelName,
          mappingType: mapping.mappingType,
          isMapped: mapping.isMapped,
          startTime,
          preprocessEndTime: _preprocessEndTime,
          providerTtfbTime,
          requestHeaders: clientRequestHeaders,
          providerRequestHeaders,
          rawBody,
          standardRequestBody,
          transformedBody,
          clientIp,
          userAgent,
          requestPath,
          requestMethod,
          conversationId,
          isPassthroughEnabled,
          clientType,
          logId,
          retryCount,
          request: c.req.raw,
          routingTrace: {
            matchedRuleId: matchedRule?.id,
            matchedRuleName: matchedRule?.name,
            matchedRulePriority: matchedRule?.priority,
            modelGroupId: group.id,
            modelGroupName: group.name,
            instanceId: instance.id,
            actualModelName: instance.actualModelName,
            strategy: decision.strategy,
          },
        };

        return actualStreaming
          ? handleStreamingResponse(handlerParams)
          : handleNonStreamingResponse(handlerParams);
      }
    } finally {
      abortManager.dispose();
    }

    throw new Error('All candidate instances exhausted');
  } catch (error) {
    logger.error({ error, requestId }, 'Gateway error');
    if (isStreaming && logId) logEventBus.emitLog({ event: 'aborted', logId });
    return handleGatewayError({
      error, c, virtualKey, requestHeaders: clientRequestHeaders, providerRequestHeaders,
      rawBody, clientIp, userAgent, requestPath, requestMethod,
      isStreaming, startTime, transformedBody, incomingProtocol, targetProtocol, logId, retryCount,
    });
  }
}
