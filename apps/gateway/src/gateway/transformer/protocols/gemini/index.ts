import type { Transformer, TransformerContext, StandardRequest, StandardResponse } from '@xartifact/x-llm-gateway-shared';

import { adaptGeminiRequest } from './egress';
import { normalizeGeminiRequest } from './ingress';
import { adaptGeminiResponse } from './response-egress';
import { normalizeGeminiResponse } from './response-ingress';
import { transformGeminiStream } from './stream';

export class GeminiTransformer implements Transformer {
  readonly name = 'gemini';
  readonly supportedProtocols: ('openai' | 'anthropic' | 'gemini' | 'vertex' | 'custom')[] = ['gemini'];

  async normalizeRequest(request: unknown, ctx: TransformerContext): Promise<StandardRequest> { return normalizeGeminiRequest(request, ctx); }
  async adaptRequest(request: StandardRequest, ctx: TransformerContext): Promise<{ body: unknown; url?: string; headers?: Record<string, string> }> { return adaptGeminiRequest(request, ctx); }
  async normalizeResponse(response: Response, ctx: TransformerContext): Promise<StandardResponse> { return normalizeGeminiResponse(response, ctx); }
  async adaptResponse(response: StandardResponse, ctx: TransformerContext): Promise<Response> { return adaptGeminiResponse(response, ctx); }
  async transformStream(stream: ReadableStream, ctx: TransformerContext): Promise<ReadableStream> { return transformGeminiStream(stream, ctx); }
}
