import type { TransformerContext, StandardResponse } from '@xartifact/x-llm-gateway-shared'

export function mapToGeminiFinishReason(reason: string | null): string {
  switch (reason) {
    case 'stop':
      return 'STOP'
    case 'length':
      return 'MAX_TOKENS'
    case 'tool_calls':
      return 'STOP'
    default:
      return 'STOP'
  }
}

export async function adaptGeminiResponse(
  response: StandardResponse,
  ctx: TransformerContext,
): Promise<Response> {
  throw new Error('Gemini adaptResponse not yet implemented')
}
