import type { TransformerContext, StandardRequest } from '@/types';

export async function adaptGeminiRequest(request: StandardRequest, ctx: TransformerContext): Promise<{ body: unknown; url?: string; headers?: Record<string, string> }> {
  throw new Error('Gemini adaptRequest not yet implemented');
}
