import type { StandardMessage, ToolCall, ToolResult } from '@/types';
import type { AnthropicMessage } from '../types';
import { convertAnthropicContent, convertToAnthropicContent } from './content-converter';
import { parseToolArguments } from '../../../shared/tool-arguments-parser';
import logger from '@/core/lib/logger';

/**
 * Extract tool_call and tool_use blocks from Anthropic content
 */
function extractToolInfo(content: AnthropicMessage['content']): {
  toolCalls: ToolCall[] | undefined;
  toolResults: ToolResult[];
  toolCallId: string | undefined;
  reasoning_content: string;
} {
  const toolCalls: ToolCall[] = [];
  const toolResults: ToolResult[] = [];
  let toolCallId: string | undefined;
  let reasoning_content = '';

  if (Array.isArray(content)) {
    for (const item of content) {
      if (item.type === 'thinking' && 'thinking' in item) {
        reasoning_content = item.thinking || '';
      }

      if (item.type === 'tool_use') {
        const argsString = parseToolArguments(
          JSON.stringify(item.input || {}),
          logger
        );

        toolCalls.push({
          id: item.id || '',
          type: 'function' as const,
          function: {
            name: item.name || '',
            arguments: argsString,
          },
          ...('cache_control' in item && item.cache_control && { cache_control: item.cache_control }),
        });
      } else if (item.type === 'tool_result') {
        toolResults.push({
          tool_call_id: item.tool_use_id,
          content: typeof item.content === 'string' ? item.content : '',
          ...(item.is_error !== undefined && { is_error: item.is_error }),
          ...('cache_control' in item && item.cache_control && { cache_control: item.cache_control }),
        });
        toolCallId = item.tool_use_id;
      }
    }
  }

  return {
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    toolResults,
    toolCallId,
    reasoning_content,
  };
}

/**
 * Convert Anthropic message to Standard format
 */
export function convertMessage(msg: AnthropicMessage): StandardMessage {
  const content = convertAnthropicContent(msg.content);
  const { toolCalls, toolResults, toolCallId, reasoning_content } = extractToolInfo(msg.content);

  let role: 'user' | 'assistant' | 'system' | 'tool' = msg.role;
  const anthropicOriginalRole = msg.role;
  if ((toolCallId || toolResults.length > 0) && !toolCalls) {
    role = 'tool';
  }

  return {
    role,
    content,
    tool_calls: toolCalls,
    tool_call_id: toolCallId,
    tool_results: toolResults.length > 0 ? toolResults : undefined,
    reasoning_content: reasoning_content || undefined,
    metadata: {
      anthropicOriginalRole,
      hasToolResult: !!toolCallId || toolResults.length > 0,
      hasToolUse: !!toolCalls?.length,
    },
  };
}

/**
 * Convert Standard messages to Anthropic format
 */
export function convertToAnthropicMessages(messages: StandardMessage[]): AnthropicMessage[] {
  return messages.flatMap((msg) => {
    const content: AnthropicMessage['content'] = convertToAnthropicContent(msg);

    if (msg.reasoning_content && Array.isArray(content)) {
      content.unshift({
        type: 'thinking',
        thinking: msg.reasoning_content,
      });
    }

    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (Array.isArray(content)) {
          let parsedInput = {};
          try {
            const argumentsStr = tc.function.arguments || '{}';
            const validatedArgs = parseToolArguments(argumentsStr, logger);
            parsedInput = JSON.parse(validatedArgs);
          } catch (error) {
            logger.warn({ error, toolCall: tc }, 'Failed to parse tool arguments');
            parsedInput = { text: tc.function.arguments || '' };
          }

          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: parsedInput,
            ...(tc.cache_control && { cache_control: tc.cache_control }),
          });
        }
      }
    }

    if (msg.tool_results && msg.tool_results.length > 0) {
      for (const tr of msg.tool_results) {
        if (Array.isArray(content)) {
          content.push({
            type: 'tool_result',
            tool_use_id: tr.tool_call_id,
            content: tr.content,
            ...(tr.is_error !== undefined && { is_error: tr.is_error }),
            ...(tr.cache_control && { cache_control: tr.cache_control }),
          });
        }
      }
    } else if (msg.tool_call_id) {
      if (Array.isArray(content)) {
        content.push({
          type: 'tool_result',
          tool_use_id: msg.tool_call_id,
          content: typeof msg.content === 'string' ? msg.content : '',
        });
      }
    }

    const role: 'user' | 'assistant' = msg.role === 'assistant' ? 'assistant' : 'user';

    if (role === 'user' && Array.isArray(content)) {
      const hasToolResult = content.some((b) => b.type === 'tool_result');
      const hasNonToolResult = content.some((b) => b.type !== 'tool_result');

      if (hasToolResult && hasNonToolResult) {
        const toolResultBlocks = content.filter((b) => b.type === 'tool_result');
        const otherBlocks = content.filter((b) => b.type !== 'tool_result');
        const result: AnthropicMessage[] = [{ role, content: toolResultBlocks }];
        if (otherBlocks.length > 0) {
          result.push({ role, content: otherBlocks });
        }
        return result;
      }
    }

    return [{ role, content }];
  });
}
