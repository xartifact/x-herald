import type { ToolDefinition } from '@/types';
import type { GeminiTool } from '../types';

export function convertGeminiTool(tool: GeminiTool): ToolDefinition {
  throw new Error('Gemini tool converter not yet implemented');
}

export function convertToGeminiTool(tool: ToolDefinition): GeminiTool {
  throw new Error('Gemini tool converter not yet implemented');
}
