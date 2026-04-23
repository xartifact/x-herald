import type { ToolDefinition, StandardRequest } from '@/types';
import type { AnthropicTool, AnthropicRequest } from '../types';
import { cleanSchemaForOpenAI } from '../../../shared/schema-cleaner';

/**
 * Convert Anthropic tool to Standard tool definition
 */
export function convertAnthropicTool(tool: AnthropicTool): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: cleanSchemaForOpenAI(tool.input_schema) as ToolDefinition['function']['parameters'],
    },
    ...(tool.cache_control && { cache_control: tool.cache_control }),
  };
}

/**
 * Convert Anthropic tool_choice to Standard tool_choice
 */
export function convertToolChoice(
  choice?: AnthropicRequest['tool_choice'],
): StandardRequest['tool_choice'] {
  if (!choice) return undefined;
  if (choice.type === 'auto') return 'auto';
  if (choice.type === 'any') return 'required';
  if (choice.type === 'tool') {
    return {
      type: 'function',
      function: { name: choice.name },
    };
  }
  return undefined;
}

/**
 * Convert Standard tool definition to Anthropic tool
 */
export function convertToAnthropicTool(tool: ToolDefinition): AnthropicTool {
  const cleanedParams = tool.function.parameters
    ? cleanSchemaForOpenAI(tool.function.parameters)
    : { type: 'object' };

  return {
    name: tool.function.name,
    description: tool.function.description || '',
    input_schema: cleanedParams as AnthropicTool['input_schema'],
    ...(tool.cache_control && { cache_control: tool.cache_control }),
  };
}

/**
 * Convert Standard tool_choice to Anthropic tool_choice
 */
export function convertToAnthropicToolChoice(
  choice: NonNullable<StandardRequest['tool_choice']>,
): AnthropicRequest['tool_choice'] {
  if (choice === 'auto') return { type: 'auto' };
  if (choice === 'none') return { type: 'auto' };
  if (choice === 'required') return { type: 'any' };
  if (typeof choice === 'object' && choice.type === 'function') {
    return { type: 'tool', name: choice.function.name };
  }
  return { type: 'auto' };
}
