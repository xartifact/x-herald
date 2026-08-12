import type { ImageContent, StandardMessage, TextContent } from '@xartifact/x-herald-shared'

import type { OpenAIMessage } from '../types'
import { convertContent } from './content-converter'
import { normalizeToolCalls } from './tool-converter'

/**
 * Convert OpenAI messages to Standard format
 */
export function convertMessages(messages: OpenAIMessage[]): StandardMessage[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: convertContent(msg.content),
    tool_calls: msg.tool_calls ? normalizeToolCalls(msg.tool_calls) : undefined,
    tool_call_id: msg.tool_call_id,
    name: msg.name,
    metadata: msg.reasoning_content ? { reasoning_content: msg.reasoning_content } : undefined,
  }))
}

/**
 * Convert Standard messages to OpenAI format
 */
export function convertToOpenAIMessages(messages: StandardMessage[]): OpenAIMessage[] {
  return messages.map((msg) => {
    const openaiMsg: OpenAIMessage = {
      role: msg.role,
    }

    if (typeof msg.content === 'string') {
      openaiMsg.content = msg.content
    } else if (Array.isArray(msg.content)) {
      openaiMsg.content = msg.content
        .filter(
          (item): item is TextContent | ImageContent =>
            item.type === 'text' || item.type === 'image_url',
        )
        .map((item) => {
          if (item.type === 'text') {
            return { type: 'text', text: item.text }
          } else {
            return {
              type: 'image_url',
              image_url: { url: item.image_url.url },
            }
          }
        })
    }

    if (msg.tool_calls) {
      openaiMsg.tool_calls = normalizeToolCalls(msg.tool_calls as typeof msg.tool_calls)
    }

    if (msg.tool_call_id) {
      openaiMsg.tool_call_id = msg.tool_call_id
    }

    if (msg.name) {
      openaiMsg.name = msg.name
    }

    if (msg.metadata?.reasoning_content) {
      openaiMsg.reasoning_content = msg.metadata.reasoning_content as string
    }

    return openaiMsg
  })
}
