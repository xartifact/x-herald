import type { Context } from 'hono';

import { loadConfig } from '@/core/config';
import logger from '@/core/lib/logger';
import type { VirtualKey } from '@/features/keys/db';

import { getTransformer, createTransformerContext } from '../../transformer';
import { buildHeaders } from '../../transformer/shared/parameter-transformer';
import { identifyClient } from '../../services/client-identifier';
import { circuitBreakerRegistry } from '../../services/circuit-breaker';
import { handleGatewayError, handleProviderError, handleProviderErrorPassthrough } from '../../services/error-handler';
import { PROVIDER_FILTERED_HEADERS } from '../../services/headers';
import { logRequestStart, markLogAsFailed } from '../../services/log-service';
import { ModelNotFoundError, FAILOVER_STATUS_CODES } from '../../services/model-group-router';
import { getProviderProtocol, getProviderUrl, getEndpoint } from '../../services/protocol-detector';
import { handleNonStreamingResponse, handleStreamingResponse } from '../../services/response-handlers';
import { virtualModelRouter } from '../../services/virtual-model-router';
import { AbortManager } from '../shared/abort-manager';
import { joinUrl } from '../shared/join-url';
import { executeWithRetry } from '../shared/retry-executor';
import type { RetryConfig } from '../shared/retry-executor';

/**
 * OpenAI chat completion handler with failover support.
 *
 * Pipeline:
 *  1. Parse + normalize request
 *  2. Check model permissions
 *  3. Resolve ordered candidate list (strategy: priority / round_robin / weighted)
 *  4. For each candidate:
 *     a. Select target protocol, build request body + headers
 *     b. Log request start (pending)
 *     c. Execute with per-instance retry (exponential backoff)
 *     d. On abort (client disconnect / TTFB timeout): return immediately
 *     e. On server error (5xx/429): record circuit breaker failure, failover to next candidate
 *     f. On success: record circuit breaker success, return response
 *  5. If all candidates exhausted: return last provider error
 */
export async function handleOpenAIChatCompletion(
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
  const incomingProtocol: 'openai' = 'openai';
  let targetProtocol: 'openai' | 'anthropic' | undefined;
  let providerRequestHeaders: Record<string, string> | undefined;
  let logId: string | undefined;
  let retryCount = 0;

  try {
    rawBody = preprocessedBody as { model?: string; [key: string]: unknown } ??
      (await c.req.json()) as { model?: string; [key: string]: unknown };

    logger.info(
      { requestId, model: rawBody.model, protocol: incomingProtocol },
      'Processing chat completion',
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
        { error: { type: 'permission_error', message: 'Your API key does not have permission to use this model' } },
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
        const { instance, provider, group, decision, mapping, matchedRule } = routeResult;
        const isLastCandidate = candidateIdx === candidates.length - 1;

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
            { error: { type: 'protocol_error', message: `Protocol '${targetProtocol}' not configured for provider` } },
            400,
          );
        }

        standardReq.model = instance.actualModelName;

        ctx.provider = {
          name: provider.name,
          baseUrl: providerUrl,
          apiKey: provider.apiKey || '',
          protocol: targetProtocol,
          models: [],
          protocols: provider.protocols,
        };
        ctx.instanceConfig = instance.config ?? undefined;

        let targetUrl: string;
        let requestBody: string;

        if (isPassthroughEnabled) {
          transformedBody = { ...rawBody, model: instance.actualModelName };
          targetUrl = joinUrl(providerUrl, getEndpoint(targetProtocol, isStreaming));
          requestBody = JSON.stringify(transformedBody);
          providerRequestHeaders = {
            ...Object.fromEntries(
              Object.entries(clientRequestHeaders).filter(([key]) => !PROVIDER_FILTERED_HEADERS.has(key))
            ),
            'authorization': `Bearer ${provider.apiKey}`,
          };
        } else {
          const egressTransformer = getTransformer(targetProtocol);
          if (!egressTransformer?.adaptRequest) {
            throw new Error(`No adapter found for protocol: ${targetProtocol}`);
          }
          const adapted = await egressTransformer.adaptRequest(standardReq, ctx);
          transformedBody = adapted.body;
          targetUrl = adapted.url || joinUrl(providerUrl, getEndpoint(targetProtocol, isStreaming));
          requestBody = JSON.stringify(adapted.body);
          providerRequestHeaders = {
            ...Object.fromEntries(
              Object.entries(clientRequestHeaders).filter(([key]) => !PROVIDER_FILTERED_HEADERS.has(key))
            ),
            ...Object.fromEntries(
              Object.entries(adapted.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
            ),
            'authorization': `Bearer ${provider.apiKey}`,
          };
        }

        if (ctx.instanceConfig?.customHeaders) {
          providerRequestHeaders = buildHeaders(providerRequestHeaders, ctx.instanceConfig.customHeaders, ctx);
        }

        logger.debug(
          { requestId, targetUrl, targetProtocol, model: standardReq.model, isPassthrough: isPassthroughEnabled },
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
          targetProtocol,
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

        const preprocessEndTime = Date.now();

        const CONNECT_TIMEOUT_MS = 30000;
        const TTFB_TIMEOUT_MS = isStreaming ? 600000 : 300000;

        const retryConfig: RetryConfig = {
          maxRetries: instance.config?.retryConfig?.maxRetries ?? 2,
          baseDelay: instance.config?.retryConfig?.retryDelay ?? 500,
          maxDelay: 30000,
          retryableStatusCodes: instance.config?.retryConfig?.retryableStatusCodes ?? [429, 500, 502, 503, 504, 521, 524],
        };

        let response: Response | undefined;
        let providerTtfbTime = 0;

        const retryResult = await executeWithRetry({
          abortManager,
          operation: async (signal) => {
            return await fetch(targetUrl, {
              method: 'POST',
              headers: providerRequestHeaders,
              body: requestBody,
              signal,
              connectTimeout: CONNECT_TIMEOUT_MS,
            } as RequestInit);
          },
          timeout: TTFB_TIMEOUT_MS,
          requestId,
          isStreaming,
          config: retryConfig,
          onRetry: (attempt, delay, lastResponse) => {
            logger.info(
              { requestId, attempt, statusCode: lastResponse?.status, retryDelay: delay },
              '[Retry] Retrying upstream request',
            );
          },
        });

        providerTtfbTime = Date.now();
        retryCount = retryResult.retryCount;

        // 客户端断开或超时：立即返回，不进行故障转移
        if (retryResult.aborted || !retryResult.response) {
          const abortMessage = retryResult.aborted === 'client_disconnect'
            ? 'Client disconnected'
            : `Request TTFB timeout after ${TTFB_TIMEOUT_MS / 1000}s`;
          return handleGatewayError({
            error: new Error(abortMessage),
            c, virtualKey, requestHeaders: clientRequestHeaders, providerRequestHeaders,
            rawBody, clientIp, userAgent, requestPath, requestMethod,
            isStreaming, startTime, transformedBody, incomingProtocol, targetProtocol, logId, retryCount,
          });
        }

        response = retryResult.response;

        if (!response.ok) {
          if (retryCount > 0) {
            logger.info({ requestId, retryCount, statusCode: response.status }, '[Retry] All retries exhausted');
          }

          // 判断是否触发故障转移
          const shouldFailover = !isLastCandidate && FAILOVER_STATUS_CODES.has(response.status);
          if (shouldFailover) {
            circuitBreakerRegistry.recordFailure(instance.id);
            await markLogAsFailed(logId, response.status, `Failover: HTTP ${response.status}`);
            response.body?.cancel().catch(() => {});
            logger.warn(
              { requestId, instanceId: instance.id, statusCode: response.status },
              '[Failover] Instance failed, switching to next candidate',
            );
            continue;
          }

          // 最后一个候选或不可转移的错误码（4xx）：返回错误
          const errorHandler = isPassthroughEnabled ? handleProviderErrorPassthrough : handleProviderError;
          return errorHandler(
            c, response, provider, virtualKey, rawBody.model || 'unknown',
            clientRequestHeaders, providerRequestHeaders, rawBody,
            clientIp, userAgent, requestPath, requestMethod,
            isStreaming, startTime, transformedBody, incomingProtocol, targetProtocol, logId, retryCount,
          );
        }

        // 成功：重置熔断器
        circuitBreakerRegistry.recordSuccess(instance.id);

        const actualStreaming = standardReq.stream === true;
        const modelName = rawBody.model || 'unknown';
        const handlerParams = {
          c, response, ctx, incomingProtocol, targetProtocol, virtualKey, provider,
          originalModelName: modelName, resolvedModelName: mapping.modelName,
          mappingType: mapping.mappingType, isMapped: mapping.isMapped,
          startTime, preprocessEndTime, providerTtfbTime,
          requestHeaders: clientRequestHeaders, providerRequestHeaders,
          rawBody, standardRequestBody, transformedBody,
          clientIp, userAgent, requestPath, requestMethod, conversationId,
          isPassthroughEnabled, clientType, logId, retryCount,
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

    // 理论上不会到达这里（循环内每个分支都有 return 或 continue）
    throw new Error('All candidate instances exhausted');
  } catch (error) {
    logger.error({ error, requestId }, 'Gateway error');
    return handleGatewayError({
      error, c, virtualKey, requestHeaders: clientRequestHeaders, providerRequestHeaders,
      rawBody, clientIp, userAgent, requestPath, requestMethod,
      isStreaming, startTime, transformedBody, incomingProtocol, targetProtocol, logId, retryCount,
    });
  }
}
