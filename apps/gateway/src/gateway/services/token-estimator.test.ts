import { describe, expect, it } from 'bun:test'

import { estimateUsageFromContent, estimateTokens } from './token-estimator'

describe('estimateTokens', () => {
  it('returns 0 for empty text', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('estimates English text at ~4 chars per token', () => {
    expect(estimateTokens('abcdefgh')).toBe(2)
  })

  it('estimates Chinese text at ~1.5 chars per token', () => {
    expect(estimateTokens('中文测试')).toBe(Math.ceil(4 / 1.5))
  })
})

describe('estimateUsageFromContent', () => {
  it('estimates from Chat Completions messages', () => {
    const request = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'hello world!' }],
    }
    const response = {
      choices: [{ message: { content: 'hi there' } }],
    }

    const usage = estimateUsageFromContent(request, response)

    expect(usage.inputTokens).toBeGreaterThan(0)
    expect(usage.outputTokens).toBeGreaterThan(0)
  })

  it('estimates from Responses API string input', () => {
    const request = {
      model: 'gpt-4',
      instructions: 'Be terse.',
      input: 'hello world!',
    }

    const usage = estimateUsageFromContent(request, null)

    expect(usage.inputTokens).toBeGreaterThan(0)
    expect(usage.outputTokens).toBe(0)
  })

  it('estimates from Responses API structured input array', () => {
    const request = {
      model: 'gpt-4',
      input: [
        { role: 'user', content: 'first question' },
        { type: 'input_text', text: 'second question' },
        { role: 'user', content: [{ type: 'input_text', text: 'third question' }] },
      ],
    }

    const usage = estimateUsageFromContent(request, null)

    expect(usage.inputTokens).toBeGreaterThan(0)
  })

  it('estimates output tokens from Responses API output array', () => {
    const request = { model: 'gpt-4', input: 'hello' }
    const response = {
      object: 'response',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'the answer text' }],
        },
        { type: 'function_call', name: 'get_weather', args: '{"city":"SF"}' },
      ],
    }

    const usage = estimateUsageFromContent(request, response)

    expect(usage.outputTokens).toBeGreaterThan(0)
  })

  it('returns zeros for empty inputs', () => {
    const usage = estimateUsageFromContent(undefined, undefined)

    expect(usage.inputTokens).toBe(0)
    expect(usage.outputTokens).toBe(0)
  })
})
