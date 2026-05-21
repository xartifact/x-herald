import { logger } from '@x-llm-gateway/engine';
import type { TransformerContext, StandardRequest } from '@/types';

import { convertToAnthropicMessages } from './converters/message-converter';
import { convertToAnthropicTool, convertToAnthropicToolChoice } from './converters/tool-converter';
import type { AnthropicMessage, AnthropicRequest } from './types';

/**
 * Apply thinking type mapping if configured on provider
 */
function applyThinkingMapping(anthropicReq: AnthropicRequest, ctx: TransformerContext): void {
  if (!anthropicReq.thinking?.type) return;
  const protocolConfig = ctx.provider?.protocols?.anthropic;
  const thinkingMapping = protocolConfig?.thinkingMapping;
  if (!thinkingMapping?.enabled || !thinkingMapping.mappings) return;

  const originalType = anthropicReq.thinking.type;
  const mappedType = thinkingMapping.mappings[originalType];
  if (mappedType) {
    logger.debug({ originalType, mappedType, provider: ctx.provider?.name }, 'Applying thinking type mapping');
    anthropicReq.thinking!.type = mappedType as 'enabled' | 'adaptive';
  }
}

function hasThinkingInHistory(messages: AnthropicMessage[]): boolean {
  return messages.some((msg) => {
    if (msg.role !== 'assistant' || typeof msg.content === 'string') return false;
    if (!Array.isArray(msg.content) || msg.content.length === 0) return false;
    return msg.content.some((b) => b.type === 'thinking');
  });
}

function injectSyntheticThinking(messages: AnthropicMessage[]): AnthropicMessage[] {
  return messages.map((msg) => {
    if (msg.role !== 'assistant' || typeof msg.content === 'string') return msg;
    if (!Array.isArray(msg.content)) return msg;
    if (msg.content.some((b) => b.type === 'thinking')) return msg;
    return { ...msg, content: [{ type: 'thinking' as const, thinking: '...' }, ...msg.content] };
  });
}

/**
 * Adapt standard request to Anthropic format
 */
export async function adaptAnthropicRequest(
  request: StandardRequest,
  ctx: TransformerContext,
): Promise<{ body: unknown; url?: string; headers?: Record<string, string> }> {
  const systemMessages = request.messages.filter(m => m.role === 'system');
  const nonSystemMessages = request.messages.filter(m => m.role !== 'system');

  let systemContent: string | undefined;
  if (request.system) {
    if (typeof request.system === 'string') systemContent = request.system;
  } else if (systemMessages.length > 0) {
    systemContent = systemMessages.map(m => typeof m.content === 'string' ? m.content : '').filter(Boolean).join('\n');
  }

  let messages = convertToAnthropicMessages(nonSystemMessages);

  let shouldDisableThinking = false;
  if (request.reasoning?.enabled) {
    const hasAssistantMessages = messages.some(m => m.role === 'assistant');
    const missingThinking = hasAssistantMessages && !hasThinkingInHistory(messages);
    if (missingThinking) {
      const syntheticStrategy = ctx.provider?.protocols?.anthropic?.syntheticThinking ?? 'strip';
      if (syntheticStrategy === 'inject') {
        logger.info({ provider: ctx.provider?.name }, 'Injecting synthetic thinking blocks');
        messages = injectSyntheticThinking(messages);
      } else {
        logger.info({ provider: ctx.provider?.name }, 'Stripping thinking: history lacks thinking blocks');
        shouldDisableThinking = true;
      }
    }
  }

  const anthropicReq: AnthropicRequest = {
    model: request.model, messages, max_tokens: request.max_tokens ?? 4096,
    temperature: request.temperature, top_p: request.top_p, top_k: request.top_k, stream: request.stream,
  };

  if (request.system) {
    if (typeof request.system === 'string') anthropicReq.system = request.system;
    else if (Array.isArray(request.system)) {
      anthropicReq.system = request.system.map((s) => ({ type: 'text' as const, text: s.text, ...(s.cache_control && { cache_control: s.cache_control }) }));
    }
  } else if (systemContent) anthropicReq.system = systemContent;

  if (request.tools?.length) {
    anthropicReq.tools = request.tools.map((t) => convertToAnthropicTool(t));
    if (request.tool_choice) anthropicReq.tool_choice = convertToAnthropicToolChoice(request.tool_choice);
  }

  if (request.stop) anthropicReq.stop_sequences = Array.isArray(request.stop) ? request.stop : [request.stop];
  if (request.reasoning?.enabled && !shouldDisableThinking) {
    anthropicReq.thinking = { type: 'enabled', budget_tokens: request.reasoning.max_tokens ?? 1024 };
  }
  if (request.output_config) anthropicReq.output_config = request.output_config;
  if (request.metadata?.userId) anthropicReq.metadata = { user_id: request.metadata.userId as string };

  applyThinkingMapping(anthropicReq, ctx);

  return { body: anthropicReq, headers: { 'anthropic-version': '2023-06-01' } };
}
