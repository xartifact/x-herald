import type { TransformerContext, StandardRequest } from '@xartifact/x-herald-shared'

export function normalizeGeminiRequest(
  _request: unknown,
  _ctx: TransformerContext,
): StandardRequest {
  throw new Error('Gemini normalizeRequest not yet implemented')
}
