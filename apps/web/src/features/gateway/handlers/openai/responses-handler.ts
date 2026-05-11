import type { Context } from 'hono';

import { loadConfig } from '@/core/config';
import logger from '@/core/lib/logger';
import type { VirtualKey } from '@/features/keys/db';

import { identifyClient } from '../../services/client-identifier';
import { handleGatewayError, handleProviderError, handleProviderErrorPassthrough } from '../../services/error-handler';
import { PROVIDER_FILTERED_HEADERS } from '../../services/headers';
import { logRequestStart } from '../../services/log-service';
import { ModelNotFoundError } from '../../services/model-group-router';
import { getProviderProtocol, getProviderUrl, getEndpoint } from '../../services/protocol-detector';
import { handleNonStreamingResponse, handleStreamingResponse } from '../../services/response-handlers';
import { virtualModelRouter } from '../../services/virtual-model-router';
import { getTransformer, createTransformerContext } from '../../transformer';
import { buildHeaders } from '../../transformer/shared/parameter-transformer';
import { AbortManager } from '../shared/abort-manager';
import {
  CONNECT_TIMEOUT_MS,
  TTFB_TIMEOUT_MS_NON_STREAMING,
  TTFB_TIMEOUT_MS_STREAMING,
} from '../shared/constants';
import { joinUrl } from '../shared/join-url';
import { executeWithRetry, type RetryConfig } from '../shared/retry-executor';

// ─── Responses API → Chat Completions conversion helpers ─────────────────

/**
 * Convert Responses API content items to Chat Completions content format.
 *
 * - input_text / output_text → { type: 'text', text }
 * - input_image              → { type: 'image_url', image_url }
 * - other types              → pass through as-is
 */
function convertContentToChatFormat(content: unknown): string | unknown[] {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return String(content ?? '');
  }

  // Convert content array
  const converted: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
  for (const item of content) {
    if (typeof item !== 'object' || item === null) continue;

    const contentItem = item as { type?: string; text?: string; image_url?: { url: string } };

    if (contentItem.type === 'input_text' || contentItem.type === 'output_text') {
      converted.push({
        type: 'text',
        text: contentItem.text || '',
      });
    } else if (contentItem.type === 'input_image' && contentItem.image_url) {
      converted.push({
        type: 'image_url',
        image_url: contentItem.image_url,
      });
    } else {
      converted.push(item as { type: string });
    }
  }

  return converted.length === 1 && typeof converted[0] === 'object'
    ? (converted[0] as { text?: string }).text || converted
    : converted;
}

/**
 * Convert a full Responses API request body to Chat Completions format.
 */
function convertResponsesToChatFormat(body: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {
    model: body.model,
    stream: body.stream ?? false,
  };

  // Convert input array → messages
  if (Array.isArray(body.input)) {
    const messages: Array<{ role: string; content: string | unknown[] }> = [];

    // Prepend instructions as system message
    if (body.instructions && typeof body.instructions === 'string') {
      messages.push({
        role: 'system',
        content: body.instructions,
      });
    }

    for (const item of body.input) {
      if (typeof item !== 'object' || item === null) continue;

      const inputItem = item as { role?: string; content?: unknown; type?: string; text?: string };

      if (inputItem.role) {
        const role = inputItem.role === 'assistant' ? 'assistant' : 'user';
        const content = convertContentToChatFormat(inputItem.content);
        messages.push({ role, content });
      } else if (inputItem.type === 'input_text' && inputItem.text) {
        messages.push({
          role: 'user',
          content: inputItem.text,
        });
      }
    }

    result.messages = messages;
  }

  // Parameter mapping
  if (body.max_output_tokens !== undefined) {
    result.max_tokens = body.max_output_tokens;
  }
  if (body.temperature !== undefined) {
    result.temperature = body.temperature;
  }
  if (body.top_p !== undefined) {
    result.top_p = body.top_p;
  }
  if (body.tools !== undefined) {
    result.tools = body.tools;
  }
  if (body.tool_choice !== undefined) {
    result.tool_choice = body.tool_choice;
  }
  if (body.stop !== undefined) {
    result.stop = body.stop;
  }
  if (body.stream_options !== undefined) {
    result.stream_options = body.stream_options;
  }

  return result;
}

// ─── Chat Completions → Responses API conversion helpers ─────────────────

/**
 * Convert a non-streaming Chat Completions response body to Responses API format.
 */
function convertChatToResponsesBody(
  chatBody: Record<string, unknown>,
): Record<string, unknown> {
  const output: Array<Record<string, unknown>> = [];

  if (chatBody.choices && Array.isArray(chatBody.choices)) {
    for (const choice of chatBody.choices) {
      const message = choice.message;
      if (!message) continue;

      const content: Array<Record<string, unknown>> = [];

      if (typeof message.content === 'string') {
        content.push({
          type: 'output_text',
          text: message.content,
        });
      } else if (Array.isArray(message.content)) {
        for (const item of message.content) {
          if (item.type === 'text') {
            content.push({
              type: 'output_text',
              text: item.text || '',
            });
          }
        }
      }

      // Handle tool_calls - convert to function_call outputs
      if (message.tool_calls && Array.isArray(message.tool_calls)) {
        for (const toolCall of message.tool_calls) {
          const tc = toolCall as { id?: string; type?: string; function?: { name?: string; arguments?: string } };
          if (tc.function?.name) {
        output.push({
          type: 'function_call',
          id: tc.id || `fc_${Math.random().toString(36).slice(2, 10)}`,
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments || '{}'),
        });
          }
        }
      }

      output.push({
        type: 'message',
        role: message.role || 'assistant',
        content,
      });
    }
  }

  const result: Record<string, unknown> = {
    id: (chatBody.id as string)?.replace('chatcmpl', 'resp') || `resp_${Date.now()}`,
    object: 'response',
    created_at: chatBody.created || Math.floor(Date.now() / 1000),
    model: chatBody.model,
    output,
  };

  if (chatBody.usage) {
    result.usage = {
      input_tokens: (chatBody.usage as Record<string, unknown>).prompt_tokens || 0,
      output_tokens: (chatBody.usage as Record<string, unknown>).completion_tokens || 0,
      total_tokens: (chatBody.usage as Record<string, unknown>).total_tokens || 0,
    };
  }

  return result;
}

/**
 * Wrap a Chat Completions SSE stream so the output conforms to the
 * Responses API event-driven format.
 *
 * Events emitted:
 *  - response.created
 *  - response.output_item.added
 *  - response.output_text.delta   (per content chunk)
 *  - response.output_item.done
 *  - response.completed
 *  - [DONE]
 */
function convertStreamToResponsesFormat(response: Response): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let responseId: string | undefined;
  let responseModel: string | undefined;
  let responseCreated: number | undefined;
  let outputItemId: string | undefined;
  let hasSentCreated = false;
  let hasSentOutputItem = false;
  const outputIndex = 0;

  // Buffer for incomplete lines across chunks
  let buffer = '';

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      // Append new data to buffer and split into complete lines
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data:')) {
          if (line.trim()) {
            controller.enqueue(encoder.encode(line + '\n'));
          }
          continue;
        }

        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          if (responseId) {
            const completedEvent = {
              type: 'response.completed',
              response: {
                id: responseId,
                object: 'response',
                created_at: responseCreated,
                model: responseModel,
                output: [],
              },
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(completedEvent)}\n\n`));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          continue;
        }

        try {
          const json = JSON.parse(data);

          if (!responseId && json.id) {
            responseId = json.id.replace('chatcmpl', 'resp');
            responseModel = json.model;
            responseCreated = json.created;

            if (!hasSentCreated) {
              const createdEvent = {
                type: 'response.created',
                response: {
                  id: responseId,
                  object: 'response',
                  created_at: responseCreated,
                  model: responseModel,
                  output: [],
                },
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(createdEvent)}\n\n`));
              hasSentCreated = true;
            }
          }

          if (json.choices && Array.isArray(json.choices)) {
            for (const choice of json.choices) {
              const delta = choice.delta;
              if (!delta) continue;

              if (!hasSentOutputItem && delta.role) {
                outputItemId = `msg_${Date.now()}`;
                const addedEvent = {
                  type: 'response.output_item.added',
                  output_index: outputIndex,
                  item: {
                    id: outputItemId,
                    type: 'message',
                    role: delta.role,
                    content: [],
                  },
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(addedEvent)}\n\n`));
                hasSentOutputItem = true;
              }

              if (delta.content && outputItemId) {
                const deltaEvent = {
                  type: 'response.output_text.delta',
                  item_id: outputItemId,
                  output_index: outputIndex,
                  delta: delta.content,
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(deltaEvent)}\n\n`));
              }

              // Handle tool_calls in streaming
              if (delta.tool_calls && Array.isArray(delta.tool_calls) && outputItemId) {
                for (const tc of delta.tool_calls) {
                  const toolCall = tc as { index?: number; type?: string; function?: { name?: string; arguments?: string } };
                  if (toolCall.function?.name) {
                    const toolCallEvent = {
                      type: 'response.tool_call.delta',
                      item_id: outputItemId,
                      output_index: outputIndex,
                      tool_call: {
                        name: toolCall.function.name,
                        arguments: toolCall.function.arguments,
                      },
                    };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(toolCallEvent)}\n\n`));
                  }
                }
              }

              if (choice.finish_reason && outputItemId) {
                const doneEvent = {
                  type: 'response.output_item.done',
                  output_index: outputIndex,
                  item: {
                    id: outputItemId,
                    type: 'message',
                    role: delta.role || 'assistant',
                    content: [],
                  },
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneEvent)}\n\n`));
              }
            }
          }
        } catch {
          controller.enqueue(encoder.encode(line + '\n'));
        }
      }
    },
  });

  const transformedBody = response.body?.pipeThrough(transformStream);

  return new Response(transformedBody, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

// ─── Main handler ────────────────────────────────────────────────────────

/**
 * Native OpenAI Responses API handler.
 *
 * Handles `/v1/responses` requests by:
 *  1. Converting the Responses API body to Chat Completions format internally
 *  2. Running the same gateway pipeline (routing, protocol selection, retry, etc.)
 *  3. Converting the provider response back to Responses API format
 *
 * Does NOT delegate to `handleChatCompletion` — the entire pipeline runs inline.
 */
export async function handleResponsesAPI(
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
    // Parse raw Responses API body (use preprocessed if available from route)
    const responsesBody = preprocessedBody ?? (await c.req.json()) as Record<string, unknown>;

    // Convert Responses API → Chat Completions format for the pipeline
    rawBody = convertResponsesToChatFormat(responsesBody) as { model?: string; [key: string]: unknown };

    logger.info(
      { requestId, model: rawBody.model, protocol: incomingProtocol },
      'Processing Responses API request',
    );

    // 1. Normalize via ingress transformer
    const ingressTransformer = getTransformer(incomingProtocol);
    if (!ingressTransformer?.normalizeRequest) {
      throw new Error(`No transformer found for protocol: ${incomingProtocol}`);
    }

    const ctx = createTransformerContext(requestId);
    const standardReq = await ingressTransformer.normalizeRequest(rawBody, ctx);
    const standardRequestBody = standardReq;

    // 2. Check virtual key model permissions
    if (virtualKey.allowedModels?.length && !virtualKey.allowedModels.includes(standardReq.model)) {
      return c.json(
        {
          error: {
            type: 'permission_error',
            message: 'Your API key does not have permission to use this model',
          },
        },
        403,
      );
    }

    // 3. Route via virtual model router
    const routingContext = {
      requestedModel: standardReq.model,
      streaming: standardReq.stream || false,
      hasTools: !!standardReq.tools?.length,
      hasVision: standardReq.messages.some((m) =>
        Array.isArray(m.content) && m.content.some((c) => c.type === 'image_url')
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

    // 4. Determine target protocol
    targetProtocol = getProviderProtocol(incomingProtocol, provider);
    const providerUrl = getProviderUrl(provider, targetProtocol);

    const config = loadConfig();
    const isSameProtocol = incomingProtocol === targetProtocol;

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
          error: {
            type: 'protocol_error',
            message: `Protocol '${targetProtocol}' not configured for provider`,
          },
        },
        400,
      );
    }

    // 5. Update model name to actual model
    standardReq.model = instance.actualModelName;

    // 6. Build request for provider
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
      logger.debug(
        { requestId, protocol: incomingProtocol },
        'Same protocol passthrough enabled, skipping transformation',
      );

      transformedBody = {
        ...rawBody,
        model: instance.actualModelName,
      };

      targetUrl = joinUrl(providerUrl, getEndpoint(targetProtocol, isStreaming));
      requestBody = JSON.stringify(transformedBody);

      providerRequestHeaders = {
        ...Object.fromEntries(
          Object.entries(clientRequestHeaders).filter(
            ([key]) => !PROVIDER_FILTERED_HEADERS.has(key),
          ),
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

    // Merge instance custom headers
    if (ctx.instanceConfig?.customHeaders) {
      providerRequestHeaders = buildHeaders(providerRequestHeaders, ctx.instanceConfig.customHeaders, ctx);
    }

    logger.debug(
      { requestId, targetUrl, targetProtocol, model: standardReq.model, isPassthrough: isPassthroughEnabled },
      'Forwarding to provider',
    );

    logger.trace(
      {
        requestId,
        provider: provider.name,
        targetProtocol,
        hasToolCalls: requestBody.includes('tool_calls'),
      },
      'Request body sent to provider',
    );

    // 7. Pre-create log record
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
      requestBody: responsesBody,
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


    const retryConfig: RetryConfig = {
      maxRetries: instance.config?.retryConfig?.maxRetries ?? 2,
      baseDelay: instance.config?.retryConfig?.retryDelay ?? 500,
      maxDelay: 30000,
      retryableStatusCodes: instance.config?.retryConfig?.retryableStatusCodes ?? [429, 500, 502, 503, 504, 521, 524],
    };

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
        timeout: isStreaming ? TTFB_TIMEOUT_MS_STREAMING : TTFB_TIMEOUT_MS_NON_STREAMING,
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
            ? `Request TTFB timeout after ${(isStreaming ? TTFB_TIMEOUT_MS_STREAMING : TTFB_TIMEOUT_MS_NON_STREAMING) / 1000}s`
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

    const upstreamResponse = response!;

    if (!upstreamResponse.ok) {
      if (retryCount > 0) {
        logger.info({ requestId, retryCount, statusCode: upstreamResponse.status }, '[Retry] All retries exhausted');
      }

      const errorHandler = isPassthroughEnabled
        ? handleProviderErrorPassthrough
        : handleProviderError;

      return errorHandler({
        c,
        response: upstreamResponse,
        provider,
        virtualKey,
        originalModelName: rawBody.model || 'unknown',
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

    // 8. Handle response — convert Chat Completions → Responses API format
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

    if (actualStreaming) {
      const chatResponse = await handleStreamingResponse(handlerParams);
      return convertStreamToResponsesFormat(chatResponse);
    } else {
      const chatResponse = await handleNonStreamingResponse(handlerParams);

      // Read the Chat Completions JSON, convert to Responses API format, return new response
      const chatBody = await chatResponse.json() as Record<string, unknown>;
      const responsesResult = convertChatToResponsesBody(chatBody);
      return c.json(responsesResult);
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
