import type { TransformerContext, StandardRequest } from '@xartifact/x-herald-shared'

import { convertMessages } from './converters/message-converter'
import type { OpenAIRequest } from './types'

/**
 * Normalize OpenAI request to standard format
 */
export function normalizeOpenAIRequest(request: unknown, ctx: TransformerContext): StandardRequest {
  const openaiReq = request as OpenAIRequest

  const outputConfig = openaiReq.response_format
    ? {
        type: openaiReq.response_format.type,
        schema: openaiReq.response_format.schema,
      }
    : undefined

  return {
    model: openaiReq.model,
    messages: convertMessages(openaiReq.messages),
    temperature: openaiReq.temperature,
    max_tokens: openaiReq.max_completion_tokens ?? openaiReq.max_tokens,
    top_p: openaiReq.top_p,
    frequency_penalty: openaiReq.frequency_penalty,
    presence_penalty: openaiReq.presence_penalty,
    stream: openaiReq.stream,
    tools: openaiReq.tools,
    tool_choice: openaiReq.tool_choice,
    stop: openaiReq.stop,
    seed: openaiReq.seed,
    stream_options: openaiReq.stream_options,
    response_format: openaiReq.response_format,
    output_config: outputConfig,
    reasoning: openaiReq.reasoning_effort
      ? { effort: openaiReq.reasoning_effort, enabled: true }
      : undefined,
    metadata: {
      originalProvider: 'openai',
      ...ctx.metadata,
    },
  }
}
