import { describe, expect, it } from 'bun:test'

import { normalizeProviderModel } from './service-helpers'

describe('normalizeProviderModel', () => {
  it('handles minimal OpenAI-style response (only id)', () => {
    const result = normalizeProviderModel({ id: 'gpt-4o' }, false)
    expect(result.id).toBe('gpt-4o')
    expect(result.name).toBe('gpt-4o') // fallback to id
    expect(result.synced).toBe(false)
    expect(result.contextWindow).toBeUndefined()
    expect(result.cost).toBeUndefined()
    expect(result.capabilities).toBeUndefined()
  })

  it('handles Anthropic-style response with display_name', () => {
    const result = normalizeProviderModel(
      { id: 'claude-sonnet-4-5-20250929', display_name: 'Claude Sonnet 4.5' },
      true,
    )
    expect(result.id).toBe('claude-sonnet-4-5-20250929')
    expect(result.name).toBe('Claude Sonnet 4.5')
    expect(result.synced).toBe(true)
  })

  it('extracts context_length from OpenRouter-style response', () => {
    const result = normalizeProviderModel(
      {
        id: 'deepseek/deepseek-chat',
        name: 'DeepSeek: Chat',
        context_length: 64000,
      },
      false,
    )
    expect(result.contextWindow).toBe(64000)
  })

  it('extracts context window from top_provider nesting (OpenRouter)', () => {
    const result = normalizeProviderModel(
      {
        id: 'openai/gpt-4o',
        name: 'GPT-4o',
        context_length: 128000,
        top_provider: { context_length: 128000, max_completion_tokens: 16384 },
      },
      false,
    )
    expect(result.contextWindow).toBe(128000)
    expect(result.maxOutputTokens).toBe(16384)
  })

  it('extracts pricing from nested pricing object (OpenRouter)', () => {
    const result = normalizeProviderModel(
      {
        id: 'anthropic/claude-sonnet-4-5',
        pricing: {
          prompt: '3',
          completion: '15',
          input_cache_read: '0.3',
        },
      },
      false,
    )
    expect(result.cost).toEqual({
      input: 3,
      output: 15,
      cache_read: 0.3,
    })
  })

  it('extracts pricing from top-level cost field', () => {
    const result = normalizeProviderModel(
      {
        id: 'my-model',
        cost: { input: 1.5, output: 6, cache_read: 0.15, cache_write: 1.875 },
      },
      false,
    )
    expect(result.cost).toEqual({
      input: 1.5,
      output: 6,
      cache_read: 0.15,
      cache_write: 1.875,
    })
  })

  it('extracts pricing tiers', () => {
    const result = normalizeProviderModel(
      {
        id: 'gpt-5',
        cost: {
          input: 3,
          output: 15,
          cache_read: 0.3,
          cache_write: 3.75,
          tiers: [{ input_tokens_above: 200000, input: 6, output: 30 }],
        },
      },
      false,
    )
    expect(result.cost?.tiers).toEqual([{ input_tokens_above: 200000, input: 6, output: 30 }])
  })

  it('extracts capabilities from explicit boolean fields', () => {
    const result = normalizeProviderModel(
      {
        id: 'gpt-4o',
        capabilities: {
          streaming: true,
          function_calling: true,
          vision: true,
          json_mode: true,
          reasoning: false,
        },
      },
      false,
    )
    expect(result.capabilities).toEqual({
      streaming: true,
      functionCalling: true,
      vision: true,
      jsonMode: true,
      reasoning: false,
    })
  })

  it('infers vision from architecture.input_modalities (OpenRouter)', () => {
    const result = normalizeProviderModel(
      {
        id: 'thinkingmachines/inkling-small',
        architecture: {
          input_modalities: ['text', 'image', 'audio'],
        },
      },
      false,
    )
    expect(result.capabilities?.vision).toBe(true)
  })

  it('infers function_calling from supported_parameters containing "tools" (OpenRouter)', () => {
    const result = normalizeProviderModel(
      {
        id: 'deepseek/deepseek-chat',
        supported_parameters: ['tools', 'temperature', 'max_tokens'],
      },
      false,
    )
    expect(result.capabilities?.functionCalling).toBe(true)
  })

  it('infers reasoning from supported_parameters containing "reasoning" (OpenRouter)', () => {
    const result = normalizeProviderModel(
      {
        id: 'deepseek/deepseek-r1',
        supported_parameters: ['reasoning', 'temperature'],
      },
      false,
    )
    expect(result.capabilities?.reasoning).toBe(true)
  })

  it('infers json_mode from supported_parameters containing "response_format"', () => {
    const result = normalizeProviderModel(
      {
        id: 'test-model',
        supported_parameters: ['response_format', 'temperature'],
      },
      false,
    )
    expect(result.capabilities?.jsonMode).toBe(true)
  })

  it('returns undefined capabilities when no capability info present', () => {
    const result = normalizeProviderModel({ id: 'plain-model' }, false)
    expect(result.capabilities).toBeUndefined()
  })

  it('handles string-valued pricing (OpenRouter returns string prices)', () => {
    const result = normalizeProviderModel(
      {
        id: 'test/model',
        pricing: {
          prompt: '0.00000014',
          completion: '0.00000028',
          input_cache_read: '0.0000000028',
        },
      },
      false,
    )
    expect(result.cost).toEqual({
      input: 0.00000014,
      output: 0.00000028,
      cache_read: 0.0000000028,
    })
  })

  it('handles description field', () => {
    const result = normalizeProviderModel(
      {
        id: 'model-with-desc',
        description: 'A powerful model for coding',
      },
      false,
    )
    expect(result.description).toBe('A powerful model for coding')
  })

  it('returns empty id for missing id field', () => {
    const result = normalizeProviderModel({ name: 'no-id' }, false)
    expect(result.id).toBe('')
    expect(result.name).toBe('')
  })
})
