import type { LogMetadata } from '@/features/logs/db';

import type { MetadataExtractionParams } from './metadata-extractor';

export function extractConversationContext(params: MetadataExtractionParams): LogMetadata['conversation'] | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (params.standardRequestBody || params.requestBody) as any;

  let roleSwitches = 0;
  let hasToolInteraction = false;
  let lastRole: string | null = null;

  if (body?.messages && Array.isArray(body.messages)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body.messages.forEach((msg: any) => {
      if (lastRole && msg.role !== lastRole) roleSwitches++;
      lastRole = msg.role;
      if (msg.role === 'tool' || msg.tool_calls) hasToolInteraction = true;
    });
  }

  if (!params.conversationId && roleSwitches === 0 && !hasToolInteraction) return null;

  return {
    messageId: undefined,
    parentMessageId: undefined,
    turnNumber: undefined,
    role: 'assistant',
    roleSwitches: roleSwitches > 0 ? roleSwitches : undefined,
    hasToolInteraction: hasToolInteraction || undefined,
  };
}

export function extractContentTypes(requestBody?: unknown, standardRequestBody?: unknown): LogMetadata['content'] | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (standardRequestBody || requestBody) as any;
  if (!body || typeof body !== 'object') return null;

  const types: string[] = [];
  let hasFunctionCalling = false;

  const messages = body.messages;
  if (Array.isArray(messages)) {
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        if (!types.includes('text')) types.push('text');
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text' && !types.includes('text')) types.push('text');
          else if (part.type === 'image_url' && !types.includes('image')) types.push('image');
        }
      }
    }
  }

  if (body.tools || body.functions) hasFunctionCalling = true;
  if (types.length === 0 && !hasFunctionCalling) return null;

  return {
    types: types.length > 0 ? types : undefined,
    hasFunctionCalling: hasFunctionCalling || undefined,
    responseFormat: body.response_format?.type,
  };
}

export function extractRequestFeatures(
  standardRequestBody?: unknown,
  rawRequestBody?: unknown,
  responseBody?: unknown,
  standardResponseBody?: unknown,
): LogMetadata['request'] | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = standardRequestBody as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = rawRequestBody as any;
  const primaryBody = (body && typeof body === 'object') ? body : (raw && typeof raw === 'object') ? raw : null;
  if (!primaryBody) return null;

  const r = primaryBody.reasoning;
  let thinkingMode =
    r != null && (r.enabled === true || r.enable_thinking === true || typeof r.effort === 'string' || (typeof r.max_tokens === 'number' && r.max_tokens > 0));

  if (!thinkingMode) {
    const rawBody = (raw && typeof raw === 'object') ? raw : primaryBody;
    thinkingMode = typeof rawBody.reasoning_effort === 'string' ||
      (rawBody.thinking != null && (rawBody.thinking.type === 'enabled' || rawBody.thinking.type === 'adaptive'));
  }

  if (!thinkingMode) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = responseBody as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sRes = standardResponseBody as any;
    if (Array.isArray(res?.thinkingBlocks) && res.thinkingBlocks.length > 0) thinkingMode = true;
    else if (Array.isArray(sRes?.thinkingBlocks) && sRes.thinkingBlocks.length > 0) thinkingMode = true;
    else if (Array.isArray(res?.content) && res.content.some((b: { type?: string }) => b.type === 'thinking')) thinkingMode = true;
    else if (res?.choices?.[0]?.message?.reasoning_content) thinkingMode = true;
  }

  return {
    temperature: primaryBody.temperature,
    maxTokens: primaryBody.max_tokens,
    topP: primaryBody.top_p,
    ...(thinkingMode && { thinkingMode: true }),
  };
}
