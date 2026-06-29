import type { MessageContent } from '@xartifact/x-llm-gateway-shared';

import type { GeminiPart } from '../types';

export function convertGeminiPart(parts: GeminiPart[]): string | MessageContent[] {
  throw new Error('Gemini content converter not yet implemented');
}

export function convertToGeminiParts(content: string | MessageContent[]): GeminiPart[] {
  throw new Error('Gemini content converter not yet implemented');
}
