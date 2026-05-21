import { logger } from '@x-llm-gateway/engine';
import type { StandardMessage, ToolCall, ToolResult } from '@/types';

import type { AnthropicMessage } from '../types';
import { convertAnthropicContent, convertToAnthropicContent } from './content-converter';
import { parseToolArguments } from '../../../shared/tool-arguments-parser';

type MsgContentItem = Extract<AnthropicMessage['content'], unknown[]>[number];
type OriginalContent = Extract<AnthropicMessage['content'], unknown[]>;

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
      // 保留原始 content 数组，egress 时直接透传，避免任何字段丢失
      _originalContent: Array.isArray(msg.content) ? msg.content : undefined,
    },
  };
}

function buildToolUseBlocks(toolCalls: ToolCall[] | undefined): MsgContentItem[] {
  if (!toolCalls) return [];
  return toolCalls.map((tc) => {
    let parsedInput = {};
    try {
      const argumentsStr = tc.function.arguments || '{}';
      const validatedArgs = parseToolArguments(argumentsStr, logger);
      parsedInput = JSON.parse(validatedArgs);
    } catch (error) {
      logger.warn({ error, toolCall: tc }, 'Failed to parse tool arguments');
      parsedInput = { text: tc.function.arguments || '' };
    }
    return {
      type: 'tool_use' as const,
      id: tc.id,
      name: tc.function.name,
      input: parsedInput,
      ...(tc.cache_control && { cache_control: tc.cache_control }),
    };
  });
}

function buildToolResultBlocks(msg: StandardMessage): MsgContentItem[] {
  if (msg.tool_results && msg.tool_results.length > 0) {
    return msg.tool_results.map((tr) => ({
      type: 'tool_result' as const,
      tool_use_id: tr.tool_call_id,
      content: tr.content,
      ...(tr.is_error !== undefined && { is_error: tr.is_error }),
      ...(tr.cache_control && { cache_control: tr.cache_control }),
    }));
  }
  if (msg.tool_call_id) {
    return [{
      type: 'tool_result' as const,
      tool_use_id: msg.tool_call_id,
      content: typeof msg.content === 'string' ? msg.content : '',
    }];
  }
  return [];
}

/**
 * Convert Standard messages to Anthropic format
 */
export function convertToAnthropicMessages(messages: StandardMessage[]): AnthropicMessage[] {
  return messages.map((msg): AnthropicMessage => {
    const originalContent = msg.metadata?._originalContent as OriginalContent | undefined;
    const role: 'user' | 'assistant' = msg.role === 'assistant' ? 'assistant' : 'user';

    // 透明代理路径：有原始 content 时直接透传，完整保留所有字段
    if (originalContent) {
      // 若 reasoning_content 被网关修改过（如 synthetic thinking 注入），同步更新 thinking 块
      const finalContent: AnthropicMessage['content'] = msg.reasoning_content !== undefined
        ? originalContent.map((block) =>
            block.type === 'thinking'
              ? { ...block, thinking: msg.reasoning_content as string }
              : block
          )
        : originalContent;

      return { role, content: finalContent };
    }

    // 跨协议转换路径（如 OpenAI → Anthropic）：从 Standard 格式重建
    const textBlocks = convertToAnthropicContent(msg);

    if (typeof textBlocks === 'string') {
      return { role, content: textBlocks };
    }

    const content: MsgContentItem[] = [...textBlocks as MsgContentItem[]];

    if (msg.reasoning_content) {
      content.unshift({
        type: 'thinking' as const,
        thinking: msg.reasoning_content,
        ...(msg.reasoning_signature !== undefined ? { signature: msg.reasoning_signature } : {}),
      });
    }

    content.push(...buildToolUseBlocks(msg.tool_calls));
    content.push(...buildToolResultBlocks(msg));

    return { role, content };
  });
}
