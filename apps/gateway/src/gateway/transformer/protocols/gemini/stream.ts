import type { TransformerContext } from '@xartifact/x-herald-shared'

export function normalizeGeminiStream(
  _stream: ReadableStream,
  _ctx: TransformerContext,
): ReadableStream {
  throw new Error('Gemini normalizeStream not yet implemented')
}

export function adaptStreamToGemini(
  _stream: ReadableStream,
  _ctx: TransformerContext,
): ReadableStream {
  throw new Error('Gemini adaptStream not yet implemented')
}

export function transformGeminiStream(
  stream: ReadableStream,
  ctx: TransformerContext,
): ReadableStream {
  const direction = ctx.state.get('streamDirection') as 'normalize' | 'adapt' | undefined
  if (direction === 'adapt') return adaptStreamToGemini(stream, ctx)
  return normalizeGeminiStream(stream, ctx)
}
