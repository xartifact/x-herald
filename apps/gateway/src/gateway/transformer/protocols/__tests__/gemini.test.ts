import { beforeEach, describe, expect, it } from 'bun:test'

import type { TransformerContext } from '@xartifact/x-llm-gateway-shared'

import { GeminiTransformer } from '../gemini'
import { mapGeminiFinishReason } from '../gemini/response-ingress'
import { mapToGeminiFinishReason } from '../gemini/response-egress'
import { normalizeGeminiRequest } from '../gemini/ingress'
import { adaptGeminiRequest } from '../gemini/egress'
import { normalizeGeminiResponse } from '../gemini/response-ingress'
import { adaptGeminiResponse } from '../gemini/response-egress'
import { transformGeminiStream, normalizeGeminiStream, adaptStreamToGemini } from '../gemini/stream'
import { convertGeminiPart, convertToGeminiParts } from '../gemini/converters/content-converter'
import { convertMessage, convertToGeminiMessages } from '../gemini/converters/message-converter'
import { convertGeminiTool, convertToGeminiTool } from '../gemini/converters/tool-converter'

describe('Gemini Protocol Transformer', () => {
  const createMockContext = (): TransformerContext => ({
    request: {
      model: 'gemini-1.5-pro',
      messages: [],
    },
    provider: {
      name: 'Test Provider',
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
      protocol: 'gemini',
      models: ['gemini-1.5-pro'],
    },
    model: 'gemini-1.5-pro',
    headers: {},
    metadata: {},
    requestId: 'test-request-id',
    startTime: Date.now(),
    state: new Map(),
  })

  describe('mapGeminiFinishReason (response-ingress)', () => {
    it('should map STOP to stop', () => {
      expect(mapGeminiFinishReason('STOP')).toBe('stop')
    })

    it('should map MAX_TOKENS to length', () => {
      expect(mapGeminiFinishReason('MAX_TOKENS')).toBe('length')
    })

    it('should return null for null input', () => {
      expect(mapGeminiFinishReason(null)).toBeNull()
    })

    it('should return null for empty string', () => {
      expect(mapGeminiFinishReason('')).toBeNull()
    })

    it('should return null for SAFETY', () => {
      expect(mapGeminiFinishReason('SAFETY')).toBeNull()
    })

    it('should return null for RECITATION', () => {
      expect(mapGeminiFinishReason('RECITATION')).toBeNull()
    })

    it('should return null for OTHER', () => {
      expect(mapGeminiFinishReason('OTHER')).toBeNull()
    })

    it('should return null for BLOCKLIST', () => {
      expect(mapGeminiFinishReason('BLOCKLIST')).toBeNull()
    })

    it('should return null for PROHIBITED_CONTENT', () => {
      expect(mapGeminiFinishReason('PROHIBITED_CONTENT')).toBeNull()
    })

    it('should return null for SPII', () => {
      expect(mapGeminiFinishReason('SPII')).toBeNull()
    })

    it('should return null for MALFORMED_FUNCTION_CALL', () => {
      expect(mapGeminiFinishReason('MALFORMED_FUNCTION_CALL')).toBeNull()
    })

    it('should return null for unknown string', () => {
      expect(mapGeminiFinishReason('UNKNOWN_REASON')).toBeNull()
    })
  })

  describe('mapToGeminiFinishReason (response-egress)', () => {
    it('should map stop to STOP', () => {
      expect(mapToGeminiFinishReason('stop')).toBe('STOP')
    })

    it('should map length to MAX_TOKENS', () => {
      expect(mapToGeminiFinishReason('length')).toBe('MAX_TOKENS')
    })

    it('should map tool_calls to STOP', () => {
      expect(mapToGeminiFinishReason('tool_calls')).toBe('STOP')
    })

    it('should map content_filter to STOP', () => {
      expect(mapToGeminiFinishReason('content_filter')).toBe('STOP')
    })

    it('should map null to STOP', () => {
      expect(mapToGeminiFinishReason(null)).toBe('STOP')
    })

    it('should map unknown to STOP', () => {
      expect(mapToGeminiFinishReason('unknown')).toBe('STOP')
    })
  })

  describe('GeminiTransformer class', () => {
    let transformer: GeminiTransformer

    beforeEach(() => {
      transformer = new GeminiTransformer()
    })

    it('should have name property equal to gemini', () => {
      expect(transformer.name).toBe('gemini')
    })

    it('should support gemini protocol', () => {
      expect(transformer.supportedProtocols).toEqual(['gemini'])
    })

    it('should delegate normalizeRequest to normalizeGeminiRequest', async () => {
      const ctx = createMockContext()
      await expect(transformer.normalizeRequest({}, ctx)).rejects.toThrow(
        'Gemini normalizeRequest not yet implemented',
      )
    })

    it('should delegate adaptRequest to adaptGeminiRequest', async () => {
      const ctx = createMockContext()
      const request = {
        model: 'gemini-1.5-pro',
        messages: [],
      }
      await expect(transformer.adaptRequest(request, ctx)).rejects.toThrow(
        'Gemini adaptRequest not yet implemented',
      )
    })

    it('should delegate normalizeResponse to normalizeGeminiResponse', async () => {
      const ctx = createMockContext()
      const response = new Response('{}')
      await expect(transformer.normalizeResponse(response, ctx)).rejects.toThrow(
        'Gemini normalizeResponse not yet implemented',
      )
    })

    it('should delegate adaptResponse to adaptGeminiResponse', async () => {
      const ctx = createMockContext()
      const response = {
        id: 'test',
        object: 'chat.completion' as const,
        created: 0,
        model: 'gemini-1.5-pro',
        choices: [],
      }
      await expect(transformer.adaptResponse(response, ctx)).rejects.toThrow(
        'Gemini adaptResponse not yet implemented',
      )
    })

    it('should call adaptStreamToGemini when stream direction is adapt', async () => {
      const ctx = createMockContext()
      ctx.state.set('streamDirection', 'adapt')
      const stream = new ReadableStream()
      await expect(transformer.transformStream(stream, ctx)).rejects.toThrow(
        'Gemini adaptStream not yet implemented',
      )
    })

    it('should call normalizeGeminiStream when no stream direction is set', async () => {
      const ctx = createMockContext()
      const stream = new ReadableStream()
      await expect(transformer.transformStream(stream, ctx)).rejects.toThrow(
        'Gemini normalizeStream not yet implemented',
      )
    })
  })

  describe('Stub verification', () => {
    const ctx = createMockContext()

    it('normalizeGeminiRequest should throw not yet implemented', () => {
      expect(() => normalizeGeminiRequest({}, ctx)).toThrow(
        'Gemini normalizeRequest not yet implemented',
      )
    })

    it('adaptGeminiRequest should throw not yet implemented', async () => {
      await expect(adaptGeminiRequest({ model: 'test', messages: [] }, ctx)).rejects.toThrow(
        'Gemini adaptRequest not yet implemented',
      )
    })

    it('normalizeGeminiResponse should throw not yet implemented', async () => {
      await expect(normalizeGeminiResponse(new Response('{}'), ctx)).rejects.toThrow(
        'Gemini normalizeResponse not yet implemented',
      )
    })

    it('adaptGeminiResponse should throw not yet implemented', async () => {
      await expect(
        adaptGeminiResponse(
          { id: 'test', object: 'chat.completion', created: 0, model: 'test', choices: [] },
          ctx,
        ),
      ).rejects.toThrow('Gemini adaptResponse not yet implemented')
    })

    it('normalizeGeminiStream should throw not yet implemented', () => {
      expect(() => normalizeGeminiStream(new ReadableStream(), ctx)).toThrow(
        'Gemini normalizeStream not yet implemented',
      )
    })

    it('adaptStreamToGemini should throw not yet implemented', () => {
      expect(() => adaptStreamToGemini(new ReadableStream(), ctx)).toThrow(
        'Gemini adaptStream not yet implemented',
      )
    })

    it('convertGeminiPart should throw not yet implemented', () => {
      expect(() => convertGeminiPart([])).toThrow('Gemini content converter not yet implemented')
    })

    it('convertToGeminiParts should throw not yet implemented', () => {
      expect(() => convertToGeminiParts('')).toThrow('Gemini content converter not yet implemented')
    })

    it('convertMessage should throw not yet implemented', () => {
      expect(() => convertMessage({ role: 'user', parts: [] })).toThrow(
        'Gemini message converter not yet implemented',
      )
    })

    it('convertToGeminiMessages should throw not yet implemented', () => {
      expect(() => convertToGeminiMessages([])).toThrow(
        'Gemini message converter not yet implemented',
      )
    })

    it('convertGeminiTool should throw not yet implemented', () => {
      expect(() => convertGeminiTool({ functionDeclarations: [] })).toThrow(
        'Gemini tool converter not yet implemented',
      )
    })

    it('convertToGeminiTool should throw not yet implemented', () => {
      expect(() => convertToGeminiTool({ type: 'function', function: { name: 'test' } })).toThrow(
        'Gemini tool converter not yet implemented',
      )
    })
  })

  describe('Stream routing (transformGeminiStream)', () => {
    it('should call adaptStreamToGemini when direction is adapt', () => {
      const ctx = createMockContext()
      ctx.state.set('streamDirection', 'adapt')
      const stream = new ReadableStream()
      expect(() => transformGeminiStream(stream, ctx)).toThrow(
        'Gemini adaptStream not yet implemented',
      )
    })

    it('should call normalizeGeminiStream when no direction is set', () => {
      const ctx = createMockContext()
      const stream = new ReadableStream()
      expect(() => transformGeminiStream(stream, ctx)).toThrow(
        'Gemini normalizeStream not yet implemented',
      )
    })

    it('should call normalizeGeminiStream when direction is normalize', () => {
      const ctx = createMockContext()
      ctx.state.set('streamDirection', 'normalize')
      const stream = new ReadableStream()
      expect(() => transformGeminiStream(stream, ctx)).toThrow(
        'Gemini normalizeStream not yet implemented',
      )
    })

    it('should call normalizeGeminiStream for any other direction value', () => {
      const ctx = createMockContext()
      ctx.state.set('streamDirection', 'other' as unknown as 'normalize' | 'adapt')
      const stream = new ReadableStream()
      expect(() => transformGeminiStream(stream, ctx)).toThrow(
        'Gemini normalizeStream not yet implemented',
      )
    })
  })
})
