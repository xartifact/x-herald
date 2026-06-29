import type { TransformerContext, StandardResponse } from '@xartifact/x-llm-gateway-shared';

export function mapGeminiFinishReason(reason: string | null): 'stop' | 'length' | 'tool_calls' | 'content_filter' | null {
  if (!reason) return null;
  switch (reason) {
    case 'STOP': return 'stop';
    case 'MAX_TOKENS': return 'length';
    default: return null;
  }
}

export async function normalizeGeminiResponse(response: Response, ctx: TransformerContext): Promise<StandardResponse> {
  throw new Error('Gemini normalizeResponse not yet implemented');
}
