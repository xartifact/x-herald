import type {
  Transformer,
  TransformerContext,
  StandardRequest,
  StandardResponse,
} from '@xartifact/x-herald-shared'

import { adaptAnthropicRequest } from './egress'
import { normalizeAnthropicRequest } from './ingress'
import { adaptAnthropicResponse } from './response-egress'
import { normalizeAnthropicResponse } from './response-ingress'
import { transformAnthropicStream } from './stream'

export class AnthropicTransformer implements Transformer {
  readonly name = 'anthropic'
  readonly supportedProtocols: ('openai' | 'anthropic' | 'gemini' | 'vertex' | 'custom')[] = [
    'anthropic',
  ]

  async normalizeRequest(request: unknown, ctx: TransformerContext): Promise<StandardRequest> {
    return normalizeAnthropicRequest(request, ctx)
  }
  async adaptRequest(
    request: StandardRequest,
    ctx: TransformerContext,
  ): Promise<{ body: unknown; url?: string; headers?: Record<string, string> }> {
    return adaptAnthropicRequest(request, ctx)
  }
  async normalizeResponse(response: Response, ctx: TransformerContext): Promise<StandardResponse> {
    return normalizeAnthropicResponse(response, ctx)
  }
  async adaptResponse(response: StandardResponse, ctx: TransformerContext): Promise<Response> {
    return adaptAnthropicResponse(response, ctx)
  }
  async transformStream(stream: ReadableStream, ctx: TransformerContext): Promise<ReadableStream> {
    return transformAnthropicStream(stream, ctx)
  }
}
