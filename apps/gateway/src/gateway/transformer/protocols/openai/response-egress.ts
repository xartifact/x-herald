import type { TransformerContext, StandardResponse } from '@xartifact/x-llm-gateway-shared'

/**
 * Adapt standard response to OpenAI format
 */
export async function adaptOpenAIResponse(
  response: StandardResponse,
  ctx: TransformerContext,
): Promise<Response> {
  const openaiResponse = {
    id: response.id,
    object: response.object,
    created: response.created,
    model: response.model,
    choices: response.choices?.map((choice) => {
      let message: Record<string, unknown> | undefined = choice.message
        ? {
            role: choice.message.role,
            content: choice.message.content,
            tool_calls: choice.message.tool_calls,
          }
        : undefined

      if (choice.message?.reasoning_content) {
        message = { ...message, reasoning_content: choice.message.reasoning_content }
      }

      return {
        index: choice.index,
        message,
        finish_reason: choice.finish_reason,
      }
    }),
    usage: response.usage,
  }

  return new Response(JSON.stringify(openaiResponse), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
