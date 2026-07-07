import type { ToolDefinition } from '@xartifact/x-llm-gateway-shared'

import type { GeminiTool } from '../types'

export function convertGeminiTool(_tool: GeminiTool): ToolDefinition {
  throw new Error('Gemini tool converter not yet implemented')
}

export function convertToGeminiTool(_tool: ToolDefinition): GeminiTool {
  throw new Error('Gemini tool converter not yet implemented')
}
