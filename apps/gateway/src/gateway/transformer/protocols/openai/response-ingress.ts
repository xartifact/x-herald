import logger from '../../../../lib/logger'
import type {
  TransformerContext,
  StandardResponse,
  StandardMessage,
} from '@xartifact/x-herald-shared'

import type { OpenAIChoice } from './types'
import { getValueByPath, setValueByPath } from '../../shared/parameter-transformer'

/**
 * Map OpenAI finish reason to standard format
 */
export function mapFinishReason(
  reason: string | null,
): 'stop' | 'length' | 'tool_calls' | 'content_filter' | null {
  if (!reason) return null
  if (['stop', 'length', 'tool_calls', 'content_filter'].includes(reason)) {
    return reason as 'stop' | 'length' | 'tool_calls' | 'content_filter'
  }
  return null
}

/**
 * Normalize OpenAI response to standard format
 */
export async function normalizeOpenAIResponse(
  response: Response,
  ctx: TransformerContext,
): Promise<StandardResponse> {
  if (!response.body) {
    logger.error({ requestId: ctx.requestId }, 'Provider returned empty response body')
    throw new Error('Provider returned empty response body')
  }

  let data: Record<string, unknown>
  try {
    data = (await response.json()) as Record<string, unknown>
  } catch {
    const text = await response.text()
    logger.error(
      { requestId: ctx.requestId, statusCode: response.status },
      'Failed to parse provider response as JSON',
    )
    throw new Error(`Invalid JSON response from provider: ${text.slice(0, 100)}`)
  }

  const responseExtract = ctx.instanceConfig?.responseExtract as Record<string, string> | undefined
  if (responseExtract) {
    for (const [sourcePath, targetPath] of Object.entries(responseExtract)) {
      const value = getValueByPath(data, sourcePath)
      if (value !== undefined) {
        setValueByPath(data, targetPath, value)
      }
    }
  }

  const rawData = data as {
    id?: string
    object?: string
    created?: number
    model?: string
    choices?: OpenAIChoice[]
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      total_tokens?: number
      prompt_tokens_details?: unknown
    }
  }

  return {
    id: rawData.id as string,
    object: (rawData.object as 'chat.completion' | 'chat.completion.chunk') || 'chat.completion',
    created: rawData.created || Math.floor(Date.now() / 1000),
    model: rawData.model as string,
    choices: (rawData.choices as OpenAIChoice[])?.map((choice) => {
      let reasoning_content: string | undefined
      if (choice.message?.reasoning_content) {
        reasoning_content = choice.message.reasoning_content
      }

      return {
        index: choice.index,
        message: choice.message
          ? {
              role: choice.message.role as StandardMessage['role'],
              content: choice.message.content || '',
              tool_calls: choice.message.tool_calls,
              reasoning_content,
            }
          : undefined,
        finish_reason: mapFinishReason(choice.finish_reason),
      }
    }),
    usage: rawData.usage
      ? {
          prompt_tokens: rawData.usage.prompt_tokens || 0,
          completion_tokens: rawData.usage.completion_tokens || 0,
          total_tokens: rawData.usage.total_tokens || 0,
          prompt_tokens_details: rawData.usage.prompt_tokens_details as
            | { cached_tokens?: number }
            | undefined,
        }
      : undefined,
  }
}
