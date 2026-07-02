import type { ToolDefinition, StandardRequest } from '@xartifact/x-llm-gateway-shared'

import type { AnthropicTool, AnthropicRequest } from '../types'

/**
 * Convert Anthropic tool to Standard tool definition
 */
export function convertAnthropicTool(tool: AnthropicTool): ToolDefinition {
  const { name, description, input_schema, cache_control, ...rest } = tool
  const passthrough = Object.keys(rest).length > 0 ? rest : undefined
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: input_schema as ToolDefinition['function']['parameters'],
    },
    ...(cache_control && { cache_control }),
    ...(passthrough && { _passthrough: passthrough }),
  }
}

/**
 * Convert Anthropic tool_choice to Standard tool_choice
 */
export function convertToolChoice(
  choice?: AnthropicRequest['tool_choice'],
): StandardRequest['tool_choice'] {
  if (!choice) return undefined
  if (choice.type === 'auto') return 'auto'
  if (choice.type === 'any') return 'required'
  if (choice.type === 'tool') {
    return {
      type: 'function',
      function: { name: choice.name },
    }
  }
  return undefined
}

/**
 * Convert Standard tool definition to Anthropic tool
 */
export function convertToAnthropicTool(tool: ToolDefinition): AnthropicTool {
  return {
    name: tool.function.name,
    description: tool.function.description || '',
    input_schema: (tool.function.parameters ?? { type: 'object' }) as AnthropicTool['input_schema'],
    ...(tool.cache_control && { cache_control: tool.cache_control }),
    ...tool._passthrough,
  }
}

/**
 * Convert Standard tool_choice to Anthropic tool_choice
 */
export function convertToAnthropicToolChoice(
  choice: NonNullable<StandardRequest['tool_choice']>,
): AnthropicRequest['tool_choice'] {
  if (choice === 'auto') return { type: 'auto' }
  if (choice === 'none') return { type: 'auto' }
  if (choice === 'required') return { type: 'any' }
  if (typeof choice === 'object' && choice.type === 'function') {
    return { type: 'tool', name: choice.function.name }
  }
  return { type: 'auto' }
}
