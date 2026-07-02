import type { TransformerContext, StandardRequest } from '@xartifact/x-llm-gateway-shared'

export function normalizeGeminiRequest(
  _request: unknown,
  _ctx: TransformerContext,
): StandardRequest {
  throw new Error('Gemini normalizeRequest not yet implemented')
}
