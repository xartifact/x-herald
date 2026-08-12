import type { TransformerContext, StandardRequest } from '@xartifact/x-herald-shared'

import { convertMessage } from './converters/message-converter'
import { convertAnthropicTool, convertToolChoice } from './converters/tool-converter'
import type { AnthropicRequest } from './types'

/**
 * Normalize Anthropic request to standard format (ingress pipeline)
 */
export function normalizeAnthropicRequest(
  request: unknown,
  ctx: TransformerContext,
): StandardRequest {
  const anthropicReq = request as AnthropicRequest

  const standardMessages = anthropicReq.messages.map((msg) => convertMessage(msg))

  let systemContent: string | { type: 'text'; text: string }[] | undefined
  if (anthropicReq.system) {
    if (typeof anthropicReq.system === 'string') {
      systemContent = anthropicReq.system
    } else if (Array.isArray(anthropicReq.system)) {
      systemContent = anthropicReq.system
        .filter((s) => s.type === 'text')
        .map((s) => ({
          type: 'text' as const,
          text: s.text,
          ...(s.cache_control && { cache_control: s.cache_control }),
        }))
    }
  }

  if (systemContent) {
    const systemText =
      typeof systemContent === 'string'
        ? systemContent
        : systemContent.map((s) => s.text).join('\n')
    standardMessages.unshift({
      role: 'system',
      content: systemText,
    })
  }

  return {
    model: anthropicReq.model,
    messages: standardMessages,
    temperature: anthropicReq.temperature,
    max_tokens: anthropicReq.max_tokens,
    top_p: anthropicReq.top_p,
    top_k: anthropicReq.top_k,
    stream: anthropicReq.stream,
    tools: anthropicReq.tools?.map((t) => convertAnthropicTool(t)),
    tool_choice: convertToolChoice(anthropicReq.tool_choice),
    stop: anthropicReq.stop_sequences,
    system: systemContent,
    output_config: anthropicReq.output_config,
    reasoning: anthropicReq.thinking
      ? {
          enabled: true,
          max_tokens: anthropicReq.thinking.budget_tokens,
        }
      : undefined,
    metadata: {
      originalProvider: 'anthropic',
      userId: anthropicReq.metadata?.user_id,
      ...ctx.metadata,
    },
  }
}
