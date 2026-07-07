import { describe, it, expect } from 'bun:test'
import { extractMetadata } from './metadata-extractor'
import type { MetadataExtractionParams } from './metadata-extractor'

describe('extractMetadata', () => {
  describe('empty / minimal params', () => {
    it('should return empty metadata with only performance for minimal params', () => {
      const result = extractMetadata({ responseTimeMs: 0 })

      expect(result).toEqual({
        performance: {
          responseTimeTier: 'fast',
          gatewayOverheadMs: undefined,
          providerTtfbMs: undefined,
          streamDurationMs: undefined,
        },
      })
      expect(result.messageSequence).toBeUndefined()
      expect(result.toolCalls).toBeUndefined()
      expect(result.conversation).toBeUndefined()
      expect(result.content).toBeUndefined()
      expect(result.request).toBeUndefined()
      expect(result.error).toBeUndefined()
      expect(result.business).toBeUndefined()
    })
  })

  describe('message sequence', () => {
    it('should extract message sequence from requestBody', () => {
      const result = extractMetadata({
        responseTimeMs: 0,
        requestBody: {
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
          ],
        },
      })

      expect(result.messageSequence).toEqual({
        totalCount: 2,
        roles: [
          { role: 'user', index: 1, contentType: ['text'], length: 5 },
          { role: 'assistant', index: 2, contentType: ['text'], length: 9 },
        ],
      })
    })
  })

  describe('tool calls', () => {
    it('should extract tool calls from standardResponseBody', () => {
      const result = extractMetadata({
        responseTimeMs: 0,
        standardResponseBody: {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    function: { name: 'get_weather', arguments: '{}' },
                    id: 'call_1',
                  },
                ],
              },
            },
          ],
        },
      })

      expect(result.toolCalls).toBeDefined()
      expect(result.toolCalls!.pattern).toBe('single')
      expect(result.toolCalls!.tools).toEqual(['get_weather'])
      expect(result.toolCalls!.details).toHaveLength(1)
      expect(result.toolCalls!.details![0].name).toBe('get_weather')
      expect(result.toolCalls!.details![0].callId).toBe('call_1')
    })
  })

  describe('conversation context', () => {
    it('should extract conversation context from conversationId', () => {
      const result = extractMetadata({
        responseTimeMs: 0,
        conversationId: 'conv-123',
      })

      expect(result.conversation).toBeDefined()
      expect(result.conversation!.hasToolInteraction).toBeUndefined()
    })
  })

  describe('content types', () => {
    it('should extract content types from requestBody with tools', () => {
      const result = extractMetadata({
        responseTimeMs: 0,
        requestBody: {
          messages: [{ role: 'user', content: 'Hello' }],
          tools: [{ type: 'function', function: { name: 'get_weather' } }],
        },
      })

      expect(result.content).toBeDefined()
      expect(result.content!.types).toEqual(['text'])
      expect(result.content!.hasFunctionCalling).toBe(true)
    })
  })

  describe('performance metrics', () => {
    it('should extract performance metrics from responseTimeMs', () => {
      const result = extractMetadata({
        responseTimeMs: 3000,
        gatewayOverheadMs: 100,
        providerTtfbMs: 1200,
        streamDurationMs: 1700,
      })

      expect(result.performance).toBeDefined()
      expect(result.performance!.responseTimeTier).toBe('normal')
      expect(result.performance!.gatewayOverheadMs).toBe(100)
      expect(result.performance!.providerTtfbMs).toBe(1200)
      expect(result.performance!.streamDurationMs).toBe(1700)
    })
  })

  describe('request features', () => {
    it('should extract request features from standardRequestBody', () => {
      const result = extractMetadata({
        responseTimeMs: 0,
        standardRequestBody: {
          messages: [{ role: 'user', content: 'Hello' }],
          temperature: 0.7,
          max_tokens: 1024,
        },
      })

      expect(result.request).toBeDefined()
      expect(result.request!.temperature).toBe(0.7)
      expect(result.request!.maxTokens).toBe(1024)
    })
  })

  describe('error info', () => {
    it('should extract error info from errorMessage and errorType', () => {
      const result = extractMetadata({
        responseTimeMs: 0,
        errorMessage: 'Rate limit exceeded',
        errorType: 'rate_limit',
        statusCode: 429,
      })

      expect(result.error).toBeDefined()
      expect(result.error!.category).toBe('rate_limit')
      expect(result.error!.recoverable).toBe(true)
    })
  })

  describe('business tags', () => {
    it('should extract business tags from userId', () => {
      const result = extractMetadata({
        responseTimeMs: 0,
        userId: 'user-001',
        organizationId: 'org-001',
        tags: ['production'],
      })

      expect(result.business).toBeDefined()
      expect(result.business!.userId).toBe('user-001')
      expect(result.business!.organizationId).toBe('org-001')
      expect(result.business!.tags).toEqual(['production'])
    })
  })

  describe('all fields combined', () => {
    it('should extract all metadata sections when all params are provided', () => {
      const params: MetadataExtractionParams = {
        responseTimeMs: 2000,
        requestBody: {
          messages: [{ role: 'user', content: 'What is the weather?' }],
        },
        standardRequestBody: {
          messages: [{ role: 'user', content: 'What is the weather?' }],
          temperature: 0.5,
          max_tokens: 500,
        },
        standardResponseBody: {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    function: { name: 'get_weather', arguments: '{}' },
                    id: 'call_1',
                  },
                ],
              },
            },
          ],
        },
        conversationId: 'conv-456',
        errorMessage: 'Not found',
        errorType: 'invalid_request',
        statusCode: 400,
        userId: 'user-002',
        tags: ['test'],
      }

      const result = extractMetadata(params)

      expect(result.messageSequence).toBeDefined()
      expect(result.toolCalls).toBeDefined()
      expect(result.conversation).toBeDefined()
      expect(result.performance).toBeDefined()
      expect(result.request).toBeDefined()
      expect(result.error).toBeDefined()
      expect(result.business).toBeDefined()
    })
  })

  describe('error handling', () => {
    it('should return partial metadata when extraction throws', () => {
      // extractToolCalls will throw on invalid JSON in function.arguments
      // but extractMessageSequence runs before it
      const result = extractMetadata({
        responseTimeMs: 0,
        requestBody: {
          messages: [{ role: 'user', content: 'Hello' }],
        },
        standardResponseBody: {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    function: { name: 'test_tool', arguments: 'invalid json {{{{' },
                    id: 'call_1',
                  },
                ],
              },
            },
          ],
        },
      })

      // messageSequence was extracted before the error
      expect(result.messageSequence).toBeDefined()
      expect(result.messageSequence!.totalCount).toBe(1)

      // Everything that runs after extractToolCalls fails should be undefined
      expect(result.toolCalls).toBeUndefined()
      expect(result.conversation).toBeUndefined()
      expect(result.content).toBeUndefined()
      expect(result.request).toBeUndefined()
      expect(result.error).toBeUndefined()
      expect(result.business).toBeUndefined()
    })
  })
})
