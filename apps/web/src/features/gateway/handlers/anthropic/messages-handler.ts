import type { Context } from 'hono';

import { loadConfig } from '@/core/config';
import logger from '@/core/lib/logger';
import type { VirtualKey } from '@/features/keys/db';

import { getTransformer, createTransformerContext } from '../../transformer';
import { buildHeaders } from '../../transformer/shared/parameter-transformer';
import { identifyClient } from '../../services/client-identifier';
import { handleGatewayError, handleProviderError, handleProviderErrorPassthrough } from '../../services/error-handler';
import { PROVIDER_FILTERED_HEADERS } from '../../services/headers';
import { logRequestStart } from '../../services/log-service';
import { ModelNotFoundError } from '../../services/model-group-router';
import { detectProtocol, getProviderProtocol, getProviderUrl, getEndpoint } from '../../services/protocol-detector';
import { handleNonStreamingResponse, handleStreamingResponse } from '../../services/response-handlers';
import { virtualModelRouter } from '../../services/virtual-model-router';
import { AbortManager } from '../shared/abort-manager';
import { joinUrl } from '../shared/join-url';
import { executeWithRetry, type RetryConfig } from '../shared/retry-executor';
import { normalizeAnthropicPassthroughMessages, hasAssistantMessagesWithoutThinking, injectSyntheticThinkingBlocks } from './thinking-validator';

/**
 * Anthropic-specific messages handler.
 *
 * Handles requests arriving in Anthropic protocol format. Unlike the OpenAI handler,
 * this handler includes Anthropic-specific passthrough logic:
 * - Message normalization (splitting mixed tool_result/text blocks)
 * - Thinking block validation and injection for assistant messages
 *
 * Pipeline:
 *  1. Parse body → incomingProtocol = 'anthropic' (fixed)
 *  2. Normalize using getTransformer('anthropic').normalizeRequest
 *  3. Check model permissions
 *  4. Route via virtualModelRouter
 *  5. Select target protocol
 *  6. If passthrough (same protocol):
 *     a. Normalize messages using normalizeAnthropicPassthroughMessages
 *     b. Check for missing thinking blocks via hasAssistantMessagesWithoutThinking
 *     c. Inject synthetic thinking blocks if missing (when provider supports it)
 *     d. Update model name in raw body
 *  7. If transform: use egress transformer to adapt request
 *  8. Build provider headers (x-api-key instead of Authorization Bearer)
 *  9. Log request start
 * 10. Execute with retry (using executeWithRetry + AbortManager)
 * 11. Handle response (streaming or non-streaming)
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

  // Extract client request headers (for logging)
  // Use lowercase keys to avoid Content-Type and content-type duplication
  const clientRequestHeaders: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    clientRequestHeaders[key.toLowerCase()] = value;
  });

  // Identify client type
  const clientInfo = identifyClient(userAgent, clientRequestHeaders);
  const clientType = clientInfo.type;

  // Extract or generate conversationId
  const conversationId = c.req.header('x-conversation-id') || undefined;

  // Declare variables for access in catch block
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

    // 1. Request normalization (external protocol → standard format)
    const ingressTransformer = getTransformer(incomingProtocol);
    if (!ingressTransformer?.normalizeRequest) {
      throw new Error(`No transformer found for protocol: ${incomingProtocol}`);
    }

    const ctx = createTransformerContext(requestId);
    const standardReq = await ingressTransformer.normalizeRequest(rawBody, ctx);

    // Save standard format request data (for logging)
    const standardRequestBody = standardReq;

    // 2. Check virtual key model permissions
    if (virtualKey.allowedModels?.length && !virtualKey.allowedModels.includes(standardReq.model)) {
      return c.json(
        {
          type: 'error',
          error: {
            type: 'permission_error',
            message: 'Your API key does not have permission to use this model',
          },
        },
        403,
      );
    }

    // 3. Virtual model routing (single entry point)
    const routingContext = {
      requestedModel: standardReq.model,
      streaming: standardReq.stream || false,
      hasTools: !!standardReq.tools?.length,
      hasVision: standardReq.messages.some((m) =>
        Array.isArray(m.content) && m.content.some((c) => c.type === 'image')
      ),
      virtualKeyId: virtualKey.id,
    };

    const routeResult = await virtualModelRouter.route(routingContext);

    if (!routeResult) {
      throw new ModelNotFoundError(standardReq.model);
    }

    const { instance, provider, group, decision, mapping, matchedRule } = routeResult;

    logger.debug(
      {
        requestId,
        originalModel: mapping.originalModel,
        resolvedModel: mapping.modelName,
        mappingType: mapping.mappingType,
        isMapped: mapping.isMapped,
        groupName: group.name,
        provider: provider.name,
        actualModel: instance.actualModelName,
        strategy: decision.strategy,
        reason: decision.reason,
      },
      'Model routed via group',
    );

    // 4. Determine target protocol (smart matching)
    targetProtocol = getProviderProtocol(incomingProtocol, provider);
    const providerUrl = getProviderUrl(provider, targetProtocol);

    // Check if same-protocol passthrough is enabled
    const config = loadConfig();
    const isSameProtocol = incomingProtocol === targetProtocol;

    // Anthropic passthrough requires thinking block validation
    const isPassthroughEnabled =
      isSameProtocol &&
      config.sameProtocolPassthrough.enabled &&
      config.sameProtocolPassthrough.allowedProtocols.includes(incomingProtocol);

    logger.debug(
      {
        requestId,
        clientProtocol: incomingProtocol,
        selectedProtocol: targetProtocol,
        isNativeMatch: isSameProtocol,
        isPassthroughEnabled,
      },
      'Protocol selected',
    );

    if (!providerUrl) {
      return c.json(
        {
          type: 'error',
          error: {
            type: 'protocol_error',
            message: `Protocol '${targetProtocol}' not configured for provider`,
          },
        },
        400,
      );
    }

    // 5. Update request model to actual model name
    standardReq.model = instance.actualModelName;

    // 6. Request adaptation (standard format → Provider protocol)
    // Prepare ctx (needed for both passthrough and transform modes)
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
      // Same protocol passthrough: skip transformation, use raw request body
      logger.debug(
        { requestId, protocol: incomingProtocol },
        'Same protocol passthrough enabled, skipping transformation',
      );

      // Build the passthrough body from the raw request
      const passthroughBody: { model?: string; messages?: unknown[]; [key: string]: unknown } = {
        ...rawBody,
        model: instance.actualModelName,
      };

      // --- Anthropic-specific passthrough logic ---

      // Normalize messages: split mixed tool_result/text content blocks
      if (Array.isArray(passthroughBody.messages)) {
        passthroughBody.messages = normalizeAnthropicPassthroughMessages(
          passthroughBody.messages as Array<{ role: string; content: unknown }>,
        );
      }

      // Validate thinking blocks: if provider supports extended thinking,
      // inject synthetic thinking blocks for assistant messages that lack them
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
        logger.debug(
          { requestId, model: instance.actualModelName },
          'Injecting synthetic thinking blocks for passthrough request',
        );

        passthroughBody.messages = injectSyntheticThinkingBlocks(
          passthroughBody.messages as Array<{ role: string; content: unknown }>,
        );
      }

      transformedBody = passthroughBody;

      targetUrl = joinUrl(providerUrl, getEndpoint(targetProtocol, isStreaming));
      requestBody = JSON.stringify(transformedBody);

      // Build Provider request headers: passthrough client headers,
      // filter auth/length/proxy-injection headers
      // Anthropic uses x-api-key instead of Authorization Bearer
      providerRequestHeaders = {
        ...Object.fromEntries(
          Object.entries(clientRequestHeaders).filter(
            ([key]) => !PROVIDER_FILTERED_HEADERS.has(key),
          ),
        ),
        'x-api-key': provider.apiKey || '',
      };
    } else {
      // Protocol conversion required: execute adapt
      const egressTransformer = getTransformer(targetProtocol);
      if (!egressTransformer?.adaptRequest) {
        throw new Error(`No adapter found for protocol: ${targetProtocol}`);
      }

      const adapted = await egressTransformer.adaptRequest(standardReq, ctx);
      transformedBody = adapted.body;

      targetUrl = adapted.url || joinUrl(providerUrl, getEndpoint(targetProtocol, isStreaming));
      requestBody = JSON.stringify(adapted.body);

      // Build Provider request headers: passthrough client headers,
      // filter auth/length/proxy-injection headers
      // When target is anthropic protocol, use x-api-key
      if (targetProtocol === 'anthropic') {
        providerRequestHeaders = {
          ...Object.fromEntries(
            Object.entries(clientRequestHeaders).filter(
              ([key]) => !PROVIDER_FILTERED_HEADERS.has(key),
            ),
          ),
          ...Object.fromEntries(
            Object.entries(adapted.headers || {}).map(([k, v]) => [k.toLowerCase(), v]),
          ),
          'x-api-key': provider.apiKey || '',
        };
      } else {
        // Target is OpenAI protocol — use standard Authorization Bearer
        providerRequestHeaders = {
          ...Object.fromEntries(
            Object.entries(clientRequestHeaders).filter(
              ([key]) => !PROVIDER_FILTERED_HEADERS.has(key),
            ),
          ),
          ...Object.fromEntries(
            Object.entries(adapted.headers || {}).map(([k, v]) => [k.toLowerCase(), v]),
          ),
          'authorization': `Bearer ${provider.apiKey}`,
        };
      }
    }

    // Merge instance custom Headers
    if (ctx.instanceConfig?.customHeaders) {
      providerRequestHeaders = buildHeaders(providerRequestHeaders, ctx.instanceConfig.customHeaders, ctx);
    }

    logger.debug(
      { requestId, targetUrl, targetProtocol, model: standardReq.model, isPassthrough: isPassthroughEnabled },
      'Forwarding to provider',
    );

    // Debug log: record the complete request body sent to Provider
    logger.trace(
      {
        requestId,
        provider: provider.name,
        targetProtocol,
        hasToolCalls: requestBody.includes('tool_calls'),
      },
      'Request body sent to provider',
    );

    // 7.5 Pre-create log record (pending status)
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

    // T2: Pre-processing complete, about to initiate Provider request
    const preprocessEndTime = Date.now();

    const CONNECT_TIMEOUT_MS = 30000;
    const TTFB_TIMEOUT_MS = isStreaming ? 600000 : 300000; // Streaming 10 min, non-streaming 5 min

    // Retry config (from instance config, with sensible defaults)
    const retryConfig: RetryConfig = {
      maxRetries: instance.config?.retryConfig?.maxRetries ?? 2,
      baseDelay: instance.config?.retryConfig?.retryDelay ?? 500,
      maxDelay: 30000,
      retryableStatusCodes: instance.config?.retryConfig?.retryableStatusCodes ?? [429, 500, 502, 503, 524],
    };

    // Listen for client disconnect (shared across retries, no duplicate registration)
    const abortManager = new AbortManager(c.req.raw.signal);
    abortManager.registerClientDisconnect();

    let response: Response | undefined;
    let providerTtfbTime = 0;

    try {
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

      const { response: rawResponse, retryCount: finalRetryCount } = retryResult;
      retryCount = finalRetryCount;

      if (retryResult.aborted || !rawResponse) {
        const abortMessage = retryResult.aborted === 'client_disconnect'
          ? 'Client disconnected'
          : retryResult.aborted === 'timeout'
            ? `Request TTFB timeout after ${TTFB_TIMEOUT_MS / 1000}s`
            : 'Client disconnected';
        return handleGatewayError({
          error: new Error(abortMessage),
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

      response = rawResponse;
    } finally {
      abortManager.dispose();
    }

    // response is guaranteed defined here — the null/aborted case returns early above
    const upstreamResponse = response!;

    if (!upstreamResponse.ok) {
      if (retryCount > 0) {
        logger.info({ requestId, retryCount, statusCode: upstreamResponse.status }, '[Retry] All retries exhausted');
      }

      // Passthrough mode: forward Provider raw error response, no rewriting
      const errorHandler = isPassthroughEnabled
        ? handleProviderErrorPassthrough
        : handleProviderError;

      return errorHandler(
        c,
        upstreamResponse,
        provider,
        virtualKey,
        rawBody.model || 'unknown',
        clientRequestHeaders,
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
      );
    }

    // 8. Handle response
    const actualStreaming = standardReq.stream === true;
    const modelName = rawBody.model || 'unknown';
    const handlerParams = {
      c,
      response: upstreamResponse,
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
      preprocessEndTime,
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
      request: c.req.raw, // Pass original request object for client disconnect monitoring
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

    if (actualStreaming) {
      return handleStreamingResponse(handlerParams);
    } else {
      return handleNonStreamingResponse(handlerParams);
    }
  } catch (error) {
    logger.error({ error, requestId }, 'Gateway error');

    return handleGatewayError({
      error,
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
}
