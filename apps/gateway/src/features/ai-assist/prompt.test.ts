import { describe, it, expect } from 'bun:test'
import { buildSystemPrompt, type InstanceContext } from './prompt'

describe('buildSystemPrompt', () => {
  it('returns string containing instance name when provided', () => {
    const ctx: InstanceContext = {
      instanceId: 'i1',
      instanceName: 'MyInstance',
      actualModelName: 'gpt-4o',
      providerName: 'OpenAI',
      currentConfig: null,
    }
    const result = buildSystemPrompt(ctx)
    expect(result).toContain('MyInstance')
  })

  it('returns string containing provider name', () => {
    const ctx: InstanceContext = {
      instanceId: 'i1',
      instanceName: 'Test',
      actualModelName: 'gpt-4o',
      providerName: 'OpenAI',
      currentConfig: null,
    }
    const result = buildSystemPrompt(ctx)
    expect(result).toContain('OpenAI')
  })

  it('returns string containing actual model name', () => {
    const ctx: InstanceContext = {
      instanceId: 'i1',
      instanceName: 'Test',
      actualModelName: 'gpt-4o',
      providerName: 'OpenAI',
      currentConfig: null,
    }
    const result = buildSystemPrompt(ctx)
    expect(result).toContain('gpt-4o')
  })

  it('handles currentConfig=null (should show {})', () => {
    const ctx: InstanceContext = {
      instanceId: 'i1',
      instanceName: 'Test',
      actualModelName: 'gpt-4o',
      providerName: 'OpenAI',
      currentConfig: null,
    }
    const result = buildSystemPrompt(ctx)
    expect(result).toContain('{}')
  })

  it('handles complex currentConfig object (should render JSON.stringify)', () => {
    const ctx: InstanceContext = {
      instanceId: 'i1',
      instanceName: 'Test',
      actualModelName: 'gpt-4o',
      providerName: 'OpenAI',
      currentConfig: {
        parameterMapping: { temperature: { min: 0, max: 2 } },
        retryConfig: { maxRetries: 3, retryDelay: 1000, retryableStatusCodes: [429, 503] },
      },
    }
    const result = buildSystemPrompt(ctx)
    expect(result).toContain('"parameterMapping"')
    expect(result).toContain('"temperature"')
    expect(result).toContain('"maxRetries": 3')
  })

  it('all fields populated renders correctly', () => {
    const ctx: InstanceContext = {
      instanceId: 'i1',
      instanceName: 'MyInstance',
      actualModelName: 'claude-3-opus',
      providerName: 'Anthropic',
      currentConfig: {
        customHeaders: { 'X-Custom': 'value' },
      },
    }
    const result = buildSystemPrompt(ctx)
    expect(result).toContain('MyInstance')
    expect(result).toContain('claude-3-opus')
    expect(result).toContain('Anthropic')
    expect(result).toContain('"customHeaders"')
    expect(result).toContain('X-Custom')
  })
})
