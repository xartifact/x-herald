import logger from '../../../../lib/logger'
import type { TransformerContext, StreamChunk, StandardMessage } from '@xartifact/x-herald-shared'

import type { OpenAIStreamChunk } from './types'
import { parseToolArguments } from '../../shared/tool-arguments-parser'

/**
 * Convert OpenAI stream chunk to standard format
 */
export function convertStreamChunkToStandard(chunk: OpenAIStreamChunk): StreamChunk {
  return {
    id: chunk.id,
    object: 'chat.completion.chunk',
    created: chunk.created,
    model: chunk.model,
    choices: chunk.choices.map((choice) => ({
      index: choice.index,
      delta: {
        role: choice.delta.role as StandardMessage['role'] | undefined,
        content: choice.delta.content,
        reasoning_content: choice.delta.reasoning_content,
        tool_calls: choice.delta.tool_calls?.map((tc) => ({
          index: tc.index,
          id: tc.id,
          type: tc.type,
          function: tc.function,
        })),
      },
      finish_reason: choice.finish_reason,
    })),
    usage: chunk.usage,
  }
}

/**
 * Transform OpenAI SSE stream to standard format
 */
export function transformOpenAIStream(
  stream: ReadableStream,
  ctx: TransformerContext,
): ReadableStream {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  return new ReadableStream({
    start: async (controller) => {
      const reader = stream.getReader()
      let buffer = ''
      let errorCount = 0
      let hadError = false
      const MAX_ERRORS = 5
      const errors: Array<{ error: unknown; data: string }> = []
      let model = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue

            const data = line.slice(6)
            if (data === '[DONE]') {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              continue
            }

            try {
              const chunk: OpenAIStreamChunk = JSON.parse(data)

              if (chunk.model && !model) {
                model = chunk.model
              }

              if (chunk.choices?.[0]?.finish_reason === 'tool_calls') {
                chunk.choices.forEach((choice) => {
                  if (choice.delta?.tool_calls) {
                    choice.delta.tool_calls.forEach((tc) => {
                      if (tc.function?.arguments) {
                        tc.function.arguments = parseToolArguments(tc.function.arguments, logger)
                      }
                    })
                  }
                })
              }

              const standardChunk = convertStreamChunkToStandard(chunk)
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(standardChunk)}\n\n`))
            } catch (error) {
              errorCount++
              errors.push({ error, data })

              logger.error(
                { error, data, errorCount, requestId: ctx.requestId },
                'Failed to parse stream chunk',
              )

              if (errorCount >= MAX_ERRORS) {
                const errorChunk = {
                  id: ctx.requestId,
                  object: 'chat.completion.chunk' as const,
                  created: Math.floor(Date.now() / 1000),
                  model: model || 'unknown',
                  choices: [
                    {
                      index: 0,
                      delta: { content: '\n[Stream Error: Multiple parse failures]' },
                      finish_reason: 'stop' as const,
                    },
                  ],
                }
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`))
                controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                controller.close()
                return
              }
            }
          }
        }
      } catch (error) {
        logger.error(
          { error, errorCount, errors: errors.slice(-3), requestId: ctx.requestId },
          'Stream transformation failed',
        )
        controller.error(error)
        hadError = true
        return
      } finally {
        reader.releaseLock()
        if (!hadError && errorCount < MAX_ERRORS) {
          controller.close()
        }
      }
    },
  })
}
