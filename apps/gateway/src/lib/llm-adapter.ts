import type { LLMAdapter } from '@xartifact/x-herald-sdk'

import { callAI } from './ai-caller'

export function createLLMAdapter(): LLMAdapter {
  return {
    async chat(params) {
      const response = await callAI(params.messages, {
        tools: params.tools,
      })

      return {
        content: response.content,
        tool_calls: response.tool_calls,
      }
    },
  }
}
