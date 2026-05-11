import type { StandardMessage } from '@/types';

import type { GeminiContent } from '../types';

export function convertMessage(msg: GeminiContent): StandardMessage {
  throw new Error('Gemini message converter not yet implemented');
}

export function convertToGeminiMessages(messages: StandardMessage[]): GeminiContent[] {
  throw new Error('Gemini message converter not yet implemented');
}
