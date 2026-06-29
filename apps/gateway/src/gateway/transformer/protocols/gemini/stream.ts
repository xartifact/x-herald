import type { TransformerContext } from '@xartifact/x-llm-gateway-shared';

export function normalizeGeminiStream(stream: ReadableStream, ctx: TransformerContext): ReadableStream {
  throw new Error('Gemini normalizeStream not yet implemented');
}

export function adaptStreamToGemini(stream: ReadableStream, ctx: TransformerContext): ReadableStream {
  throw new Error('Gemini adaptStream not yet implemented');
}

export function transformGeminiStream(stream: ReadableStream, ctx: TransformerContext): ReadableStream {
  const direction = ctx.state.get('streamDirection') as 'normalize' | 'adapt' | undefined;
  if (direction === 'adapt') return adaptStreamToGemini(stream, ctx);
  return normalizeGeminiStream(stream, ctx);
}
