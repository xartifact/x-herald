import { createOpenAIAdapter, type LLMAdapter } from '@xartifact/x-herald-sdk'

import { getAiModel } from './ai-caller'

export function createLLMAdapter(): LLMAdapter {
  return createOpenAIAdapter(getAiModel)
}
