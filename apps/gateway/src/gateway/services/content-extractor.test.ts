import { describe, it, expect } from 'bun:test'

import {
  extractConversationContext,
  extractContentTypes,
  extractRequestFeatures,
} from './content-extractor'

// ---------------------------------------------------------------------------
// extractConversationContext
// ---------------------------------------------------------------------------
describe('extractConversationContext', () => {
  it('returns null when no body, no conversationId', () => {
    expect(extractConversationContext({ responseTimeMs: 100 })).toBeNull()
  })

  it('returns null when messages is null, no conversationId', () => {
    const params = { responseTimeMs: 100, requestBody: { messages: null } }
    expect(extractConversationContext(params)).toBeNull()
  })

  it('returns null when messages is empty, no conversationId', () => {
    const params = { responseTimeMs: 100, requestBody: { messages: [] } }
    expect(extractConversationContext(params)).toBeNull()
  })

  it('returns object when conversationId is set even with empty messages', () => {
    const result = extractConversationContext({
      responseTimeMs: 100,
      requestBody: { messages: [] },
      conversationId: 'conv-1',
    })
    expect(result).not.toBeNull()
    expect(result!.role).toBe('assistant')
    expect(result!.roleSwitches).toBeUndefined()
    expect(result!.hasToolInteraction).toBeUndefined()
  })

  it('counts zero role switches for a single message', () => {
    const result = extractConversationContext({
      responseTimeMs: 100,
      requestBody: { messages: [{ role: 'user', content: 'hi' }] },
      conversationId: 'conv-1',
    })
    expect(result!.roleSwitches).toBeUndefined()
    expect(result!.role).toBe('assistant')
  })

  it('counts role switches across multiple messages', () => {
    const result = extractConversationContext({
      responseTimeMs: 100,
      requestBody: {
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi' },
          { role: 'user', content: 'again' },
        ],
      },
      conversationId: 'conv-1',
    })
    expect(result!.roleSwitches).toBe(2)
  })

  it('detects tool interaction via tool role', () => {
    const result = extractConversationContext({
      responseTimeMs: 100,
      requestBody: {
        messages: [
          { role: 'user', content: 'weather?' },
          { role: 'assistant', content: '', tool_calls: [{ id: 'call_1' }] },
          { role: 'tool', content: 'sunny', tool_call_id: 'call_1' },
        ],
      },
      conversationId: 'conv-1',
    })
    expect(result!.hasToolInteraction).toBe(true)
    expect(result!.roleSwitches).toBe(2)
  })

  it('detects tool interaction via tool_calls field', () => {
    const result = extractConversationContext({
      responseTimeMs: 100,
      requestBody: {
        messages: [
          { role: 'user', content: 'hey' },
          { role: 'assistant', content: '', tool_calls: [{ function: { name: 'get_weather' } }] },
        ],
      },
      conversationId: 'conv-1',
    })
    expect(result!.hasToolInteraction).toBe(true)
  })

  it('uses standardRequestBody when requestBody is absent', () => {
    const result = extractConversationContext({
      responseTimeMs: 100,
      standardRequestBody: { messages: [{ role: 'user' }, { role: 'assistant' }] },
      conversationId: 'x',
    })
    expect(result).not.toBeNull()
    expect(result!.roleSwitches).toBe(1)
  })

  it('prefers standardRequestBody over requestBody', () => {
    const result = extractConversationContext({
      responseTimeMs: 100,
      requestBody: { messages: [{ role: 'user' }] },
      standardRequestBody: { messages: [{ role: 'user' }, { role: 'assistant' }] },
      conversationId: 'x',
    })
    // standardRequestBody wins, so 1 switch
    expect(result!.roleSwitches).toBe(1)
  })

  it('handles messages that are not an array (ignores them)', () => {
    const params = {
      responseTimeMs: 100,
      requestBody: { messages: 'not-an-array' },
    }
    expect(extractConversationContext(params)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// extractContentTypes
// ---------------------------------------------------------------------------
describe('extractContentTypes', () => {
  it('returns null when body is null', () => {
    expect(extractContentTypes(null)).toBeNull()
  })

  it('returns null when body is not an object', () => {
    expect(extractContentTypes('string-body')).toBeNull()
  })

  it('returns null when body has no messages and no tools/functions', () => {
    expect(extractContentTypes({})).toBeNull()
  })

  it('detects text content from string content', () => {
    const result = extractContentTypes({
      messages: [{ role: 'user', content: 'hello' }],
    })
    expect(result).not.toBeNull()
    expect(result!.types).toEqual(['text'])
    expect(result!.hasFunctionCalling).toBeUndefined()
  })

  it('detects image content from array content with image_url', () => {
    const result = extractContentTypes({
      messages: [
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: 'https://example.com/img.png' } }],
        },
      ],
    })
    expect(result!.types).toEqual(['image'])
  })

  it('detects both text and image in mixed content', () => {
    const result = extractContentTypes({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'what is this?' },
            { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
          ],
        },
      ],
    })
    expect(result!.types).toContain('text')
    expect(result!.types).toContain('image')
    // Order: text pushed first, then image
    expect(result!.types!.length).toBe(2)
  })

  it('does not duplicate types when multiple messages share same type', () => {
    const result = extractContentTypes({
      messages: [
        { role: 'user', content: 'first' },
        { role: 'user', content: 'second' },
      ],
    })
    expect(result!.types).toEqual(['text'])
  })

  it('sets hasFunctionCalling when tools are present', () => {
    const result = extractContentTypes({
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{ function: { name: 'get_weather' } }],
    })
    expect(result!.hasFunctionCalling).toBe(true)
    expect(result!.types).toEqual(['text'])
  })

  it('sets hasFunctionCalling when functions are present', () => {
    const result = extractContentTypes({
      messages: [{ role: 'user', content: 'hello' }],
      functions: [{ name: 'get_weather' }],
    })
    expect(result!.hasFunctionCalling).toBe(true)
  })

  it('captures response_format.type', () => {
    const result = extractContentTypes({
      messages: [{ role: 'user', content: 'json' }],
      response_format: { type: 'json_object' },
    })
    expect(result!.responseFormat).toBe('json_object')
  })

  it('handles array content with text type correctly', () => {
    const result = extractContentTypes({
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'hello' }],
        },
      ],
    })
    expect(result!.types).toEqual(['text'])
  })

  it('uses standardRequestBody when requestBody is absent', () => {
    const result = extractContentTypes(undefined, {
      messages: [{ role: 'user', content: 'via standard' }],
    })
    expect(result!.types).toEqual(['text'])
  })

  it('prefers standardRequestBody over requestBody', () => {
    const result = extractContentTypes(
      { messages: [{ role: 'user', content: 'request' }] },
      { messages: [{ role: 'user', content: 'standard' }] },
    )
    expect(result!.types).toEqual(['text'])
    // content should be from standard (no way to check which string, but type is text)
  })

  it('returns null when only types is empty and no function calling', () => {
    const result = extractContentTypes({ messages: [{ role: 'user', content: 123 }] })
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// extractRequestFeatures
// ---------------------------------------------------------------------------
describe('extractRequestFeatures', () => {
  it('returns null when no body provided', () => {
    expect(extractRequestFeatures()).toBeNull()
  })

  it('returns temperature, maxTokens, topP from standardRequestBody', () => {
    const result = extractRequestFeatures({ temperature: 0.7, max_tokens: 2048, top_p: 0.9 })
    expect(result).not.toBeNull()
    expect(result!.temperature).toBe(0.7)
    expect(result!.maxTokens).toBe(2048)
    expect(result!.topP).toBe(0.9)
    expect(result!.thinkingMode).toBeUndefined()
  })

  describe('thinking mode detection from reasoning object', () => {
    it('detects reasoning.enabled === true', () => {
      const result = extractRequestFeatures({ reasoning: { enabled: true }, temperature: 1 })
      expect(result!.thinkingMode).toBe(true)
    })

    it('detects reasoning.enable_thinking === true', () => {
      const result = extractRequestFeatures({ reasoning: { enable_thinking: true } })
      expect(result!.thinkingMode).toBe(true)
    })

    it('detects reasoning.effort as string', () => {
      const result = extractRequestFeatures({ reasoning: { effort: 'high' } })
      expect(result!.thinkingMode).toBe(true)
    })

    it('detects reasoning.max_tokens > 0', () => {
      const result = extractRequestFeatures({ reasoning: { max_tokens: 1024 } })
      expect(result!.thinkingMode).toBe(true)
    })

    it('ignores reasoning with no matching fields', () => {
      const result = extractRequestFeatures({ reasoning: { budget_tokens: 100 } })
      expect(result!.thinkingMode).toBeUndefined()
    })
  })

  describe('thinking mode detection from raw body', () => {
    it('detects reasoning_effort as string on raw body', () => {
      const result = extractRequestFeatures(undefined, {
        reasoning_effort: 'high',
        temperature: 0.5,
      })
      expect(result!.thinkingMode).toBe(true)
      expect(result!.temperature).toBe(0.5)
    })

    it('falls back to raw body when standardRequestBody is null', () => {
      const result = extractRequestFeatures(null, { temperature: 0.3, max_tokens: 1000 })
      expect(result!.temperature).toBe(0.3)
      expect(result!.maxTokens).toBe(1000)
    })

    it('uses standardRequestBody when both are valid objects', () => {
      const result = extractRequestFeatures({ temperature: 0.1 }, { temperature: 0.9 })
      // standardRequestBody wins
      expect(result!.temperature).toBe(0.1)
    })
  })

  describe('thinking mode detection from thinking.type', () => {
    it('detects thinking.type = enabled on raw body', () => {
      const result = extractRequestFeatures({ temperature: 0.5 }, { thinking: { type: 'enabled' } })
      expect(result!.thinkingMode).toBe(true)
    })

    it('detects thinking.type = adaptive on raw body', () => {
      const result = extractRequestFeatures(
        { temperature: 0.5 },
        { thinking: { type: 'adaptive' } },
      )
      expect(result!.thinkingMode).toBe(true)
    })

    it('ignores thinking.type = disabled', () => {
      const result = extractRequestFeatures(
        { temperature: 0.5 },
        { thinking: { type: 'disabled' } },
      )
      expect(result!.thinkingMode).toBeUndefined()
    })
  })

  describe('thinking level extraction', () => {
    it('captures effort from standard reasoning config', () => {
      const result = extractRequestFeatures(
        { temperature: 0.2, reasoning: { effort: 'high', enabled: true } },
        undefined,
      )
      expect(result!.thinkingMode).toBe(true)
      expect(result!.thinking).toEqual({ effort: 'high' })
    })

    it('captures effort + maxTokens from standard reasoning config', () => {
      const result = extractRequestFeatures(
        { reasoning: { effort: 'low', max_tokens: 2048 } },
        undefined,
      )
      expect(result!.thinkingMode).toBe(true)
      expect(result!.thinking).toEqual({ effort: 'low', maxTokens: 2048 })
    })

    it('captures effort from raw reasoning_effort when no standard body', () => {
      const result = extractRequestFeatures(undefined, {
        reasoning_effort: 'medium',
      })
      expect(result!.thinkingMode).toBe(true)
      expect(result!.thinking).toEqual({ effort: 'medium' })
    })

    it('captures type from raw thinking block', () => {
      const result = extractRequestFeatures(undefined, { thinking: { type: 'adaptive' } })
      expect(result!.thinkingMode).toBe(true)
      expect(result!.thinking).toEqual({ type: 'adaptive' })
    })
    it('keeps legacy boolean-only behavior when no level info present', () => {
      const result = extractRequestFeatures({ temperature: 0.5 }, undefined, {
        thinkingBlocks: ['step 1'],
      })
      expect(result!.thinkingMode).toBe(true)
      expect(result!.thinking).toBeUndefined()
    })
  })

  describe('thinking mode detection from response', () => {
    it('detects thinkingBlocks in responseBody', () => {
      const result = extractRequestFeatures({ temperature: 0.5 }, undefined, {
        thinkingBlocks: ['step 1'],
      })
      expect(result!.thinkingMode).toBe(true)
    })

    it('detects thinkingBlocks in standardResponseBody', () => {
      const result = extractRequestFeatures({ temperature: 0.5 }, undefined, undefined, {
        thinkingBlocks: ['step 1'],
      })
      expect(result!.thinkingMode).toBe(true)
    })

    it('detects thinking type content in responseBody', () => {
      const result = extractRequestFeatures({ temperature: 0.5 }, undefined, {
        content: [{ type: 'thinking', text: 'hmm' }],
      })
      expect(result!.thinkingMode).toBe(true)
    })

    it('detects reasoning_content in response choices', () => {
      const result = extractRequestFeatures({ temperature: 0.5 }, undefined, {
        choices: [{ message: { reasoning_content: 'thinking...' } }],
      })
      expect(result!.thinkingMode).toBe(true)
    })

    it('does not detect thinking when response has no relevant fields', () => {
      const result = extractRequestFeatures({ temperature: 0.5 }, undefined, {
        content: [{ type: 'text', text: 'hello' }],
      })
      expect(result!.thinkingMode).toBeUndefined()
    })
  })

  it('handles null responseBody gracefully', () => {
    const result = extractRequestFeatures({ temperature: 0.5 }, undefined, null, null)
    expect(result!.temperature).toBe(0.5)
    expect(result!.thinkingMode).toBeUndefined()
  })
})
