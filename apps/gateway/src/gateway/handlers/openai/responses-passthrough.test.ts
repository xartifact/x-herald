import { describe, it, expect } from 'bun:test'

import { createTestModelInstance, createTestProvider } from '../../../test/factories'
import { buildProviderRequest } from './responses-handler'

const standardRequest = { model: 'Plan', messages: [] } as never
const transformerContext = {} as never

describe('Responses API provider passthrough', () => {
  it('preserves function-call history, reasoning, output limits and opaque fields while rewriting only model', async () => {
    const input = [
      { role: 'user', content: [{ type: 'input_text', text: 'Inspect the file' }] },
      { type: 'function_call', call_id: 'call-1', name: 'read', arguments: '{"path":"README.md"}' },
      { type: 'function_call_output', call_id: 'call-1', output: 'README contents' },
      { role: 'assistant', content: [{ type: 'output_text', text: 'Done' }] },
    ]
    const responsesBody = {
      model: 'Plan',
      input,
      tools: [{ type: 'function', name: 'read', parameters: { type: 'object' } }],
      reasoning: { effort: 'high', summary: 'auto' },
      prompt_cache_key: 'session-cache',
      store: false,
      max_output_tokens: 64000,
      metadata: { trace: 'opaque' },
    }

    const providerRequest = await buildProviderRequest({
      isPassthroughEnabled: true,
      responsesBody,
      instance: createTestModelInstance({ actualModelName: 'gpt-6-luna' }),
      provider: createTestProvider(),
      clientRequestHeaders: { 'content-type': 'application/json' },
      standardReq: standardRequest,
      ctx: transformerContext,
      targetProtocol: 'openai',
      isStreaming: true,
      providerUrl: 'https://llm.example/v1',
    })

    expect(providerRequest.targetUrl).toBe('https://llm.example/v1/responses')
    expect(JSON.parse(providerRequest.requestBody)).toEqual({
      ...responsesBody,
      model: 'gpt-6-luna',
    })
    expect(providerRequest.providerRequestHeaders.authorization).toBe('Bearer sk-test-provider')
    expect(responsesBody.model).toBe('Plan')
  })
})
