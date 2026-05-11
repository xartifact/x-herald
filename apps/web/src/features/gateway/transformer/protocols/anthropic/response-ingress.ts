import logger from '@/core/lib/logger';
import type { TransformerContext, StandardResponse } from '@/types';

import { sanitizeContent } from './sanitize';
import type { AnthropicResponse } from './types';
import { parseToolArguments } from '../../shared/tool-arguments-parser';

export function mapAnthropicFinishReason(reason: string | null): 'stop' | 'length' | 'tool_calls' | 'content_filter' | null {
  if (!reason) return null;
  switch (reason) {
    case 'end_turn': return 'stop';
    case 'max_tokens': return 'length';
    case 'tool_use': return 'tool_calls';
    case 'stop_sequence': return 'stop';
    default: return null;
  }
}

export async function normalizeAnthropicResponse(
  response: Response,
  ctx: TransformerContext,
): Promise<StandardResponse> {
  const data: AnthropicResponse = await response.json();

  let content = '';
  let reasoning_content = '';
  const toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> = [];

  for (const block of data.content) {
    if (block.type === 'text' && block.text) {
      const cleanedText = sanitizeContent(block.text);
      if (cleanedText) content += cleanedText;
    } else if (block.type === 'thinking' && block.thinking) {
      const cleanedThinking = sanitizeContent(block.thinking);
      if (cleanedThinking) reasoning_content += cleanedThinking;
    } else if (block.type === 'tool_use' && block.id) {
      const argsString = parseToolArguments(JSON.stringify(block.input || {}), logger);
      toolCalls.push({ id: block.id, type: 'function', function: { name: block.name || '', arguments: argsString } });
    }
  }

  return {
    id: data.id, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: data.model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content, tool_calls: toolCalls.length > 0 ? toolCalls : undefined, reasoning_content: reasoning_content || undefined },
      finish_reason: mapAnthropicFinishReason(data.stop_reason),
    }],
    usage: {
      prompt_tokens: data.usage.input_tokens, completion_tokens: data.usage.output_tokens,
      total_tokens: data.usage.input_tokens + data.usage.output_tokens,
      prompt_tokens_details: { cached_tokens: data.usage.cache_read_input_tokens || 0 },
    },
  };
}
