import type { StandardMessage } from '@xartifact/x-llm-gateway-shared'

import type { GeminiContent } from '../types'

export function convertMessage(_msg: GeminiContent): StandardMessage {
  throw new Error('Gemini message converter not yet implemented')
}

export function convertToGeminiMessages(_messages: StandardMessage[]): GeminiContent[] {
  throw new Error('Gemini message converter not yet implemented')
}
