import { logger } from '@x-llm-gateway/engine';
import type { TransformerContext, StandardResponse, StandardMessage } from '@/types';

import type { OpenAIChoice } from './types';

/**
 * Map OpenAI finish reason to standard format
 */
export function mapFinishReason(reason: string | null): 'stop' | 'length' | 'tool_calls' | 'content_filter' | null {
  if (!reason) return null;
  if (['stop', 'length', 'tool_calls', 'content_filter'].includes(reason)) {
    return reason as 'stop' | 'length' | 'tool_calls' | 'content_filter';
  }
  return null;
}

/**
 * Normalize OpenAI response to standard format
 */
export async function normalizeOpenAIResponse(
  response: Response,
  ctx: TransformerContext,
): Promise<StandardResponse> {
  if (!response.body) {
    logger.error({ requestId: ctx.requestId }, 'Provider returned empty response body');
    throw new Error('Provider returned empty response body');
  }

  let data;
  try {
    data = await response.json();
  } catch {
    const text = await response.text();
    logger.error(
      { requestId: ctx.requestId, statusCode: response.status },
      'Failed to parse provider response as JSON'
    );
    throw new Error(`Invalid JSON response from provider: ${text.slice(0, 100)}`);
  }

  return {
    id: data.id,
    object: data.object || 'chat.completion',
    created: data.created || Math.floor(Date.now() / 1000),
    model: data.model,
    choices: (data.choices as OpenAIChoice[])?.map((choice) => {
      let reasoning_content: string | undefined;
      if (choice.message?.reasoning_content) {
        reasoning_content = choice.message.reasoning_content;
      }

      return {
        index: choice.index,
        message: choice.message
          ? {
              role: choice.message.role as StandardMessage['role'],
              content: choice.message.content || '',
              tool_calls: choice.message.tool_calls,
              reasoning_content,
            }
          : undefined,
        finish_reason: mapFinishReason(choice.finish_reason),
      };
    }),
    usage: data.usage
      ? {
          prompt_tokens: data.usage.prompt_tokens || 0,
          completion_tokens: data.usage.completion_tokens || 0,
          total_tokens: data.usage.total_tokens || 0,
          prompt_tokens_details: data.usage.prompt_tokens_details,
        }
      : undefined,
  };
}
