import { AnthropicTransformer } from './protocols/anthropic'
import { GeminiTransformer } from './protocols/gemini'
import { OpenAITransformer } from './protocols/openai'
import { registerTransformer } from './registry'

export function registerDefaultTransformers(): void {
  registerTransformer('openai', OpenAITransformer)
  registerTransformer('anthropic', AnthropicTransformer)
  registerTransformer('gemini', GeminiTransformer)
}

export {
  registerTransformer,
  getTransformer,
  hasTransformer,
  listTransformers,
  transformerRegistry,
} from './registry'

export { TransformerChain, buildRequestChain, buildResponseChain } from './chain'

export { OpenAITransformer } from './protocols/openai'
export { AnthropicTransformer } from './protocols/anthropic'
export { GeminiTransformer } from './protocols/gemini'

export function createTransformerContext(
  requestId: string,
): import('@xartifact/x-llm-gateway-shared').TransformerContext {
  return {
    requestId,
    startTime: Date.now(),
    state: new Map(),
    request: { model: '', messages: [] },
    provider: { name: '', baseUrl: '', apiKey: '', protocol: 'openai', models: [] },
    model: '',
    headers: {},
    metadata: {},
  }
}
