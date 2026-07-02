/**
 * OpenAI 协议转换器
 * 按 Pipeline 方向拆分后的模块组装
 */

import type {
  Transformer,
  TransformerContext,
  StandardRequest,
  StandardResponse,
} from '@xartifact/x-llm-gateway-shared'

import { adaptOpenAIRequest } from './egress'
import { normalizeOpenAIRequest } from './ingress'
import { adaptOpenAIResponse } from './response-egress'
import { normalizeOpenAIResponse } from './response-ingress'
import { transformOpenAIStream } from './stream'

export class OpenAITransformer implements Transformer {
  readonly name = 'openai'
  readonly supportedProtocols: ('openai' | 'anthropic' | 'gemini' | 'vertex' | 'custom')[] = [
    'openai',
  ]

  async normalizeRequest(request: unknown, ctx: TransformerContext): Promise<StandardRequest> {
    return normalizeOpenAIRequest(request, ctx)
  }

  async adaptRequest(
    request: StandardRequest,
    ctx: TransformerContext,
  ): Promise<{ body: unknown; url?: string; headers?: Record<string, string> }> {
    return adaptOpenAIRequest(request, ctx)
  }

  async normalizeResponse(response: Response, ctx: TransformerContext): Promise<StandardResponse> {
    return normalizeOpenAIResponse(response, ctx)
  }

  async adaptResponse(response: StandardResponse, ctx: TransformerContext): Promise<Response> {
    return adaptOpenAIResponse(response, ctx)
  }

  async transformStream(stream: ReadableStream, ctx: TransformerContext): Promise<ReadableStream> {
    return transformOpenAIStream(stream, ctx)
  }
}
