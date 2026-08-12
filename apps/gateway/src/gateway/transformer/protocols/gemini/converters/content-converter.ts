import type { MessageContent } from '@xartifact/x-herald-shared'

import type { GeminiPart } from '../types'

export function convertGeminiPart(_parts: GeminiPart[]): string | MessageContent[] {
  throw new Error('Gemini content converter not yet implemented')
}

export function convertToGeminiParts(_content: string | MessageContent[]): GeminiPart[] {
  throw new Error('Gemini content converter not yet implemented')
}
