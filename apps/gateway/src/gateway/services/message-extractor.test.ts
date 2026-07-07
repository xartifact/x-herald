import { describe, it, expect } from 'bun:test'
import { extractMessageSequence, extractToolCalls } from './message-extractor'

describe('extractMessageSequence', () => {
  it('returns null for undefined requestBody and standardRequestBody', () => {
    expect(extractMessageSequence(undefined, undefined)).toBeNull()
  })

  it('returns null for null requestBody', () => {
    expect(extractMessageSequence(null)).toBeNull()
  })

  it('returns null when body has no messages field', () => {
    expect(extractMessageSequence({ foo: 'bar' })).toBeNull()
  })

  it('returns null when messages is not an array', () => {
    expect(extractMessageSequence({ messages: 'not-array' })).toBeNull()
  })

  it('returns totalCount=0 and empty roles for empty messages array', () => {
    const result = extractMessageSequence({ messages: [] })
    expect(result).toEqual({ totalCount: 0, roles: [] })
  })

  it('extracts string content as text type with length', () => {
    const body = { messages: [{ role: 'user', content: 'Hello world' }] }
    const result = extractMessageSequence(body)
    expect(result).toEqual({
      totalCount: 1,
      roles: [{ role: 'user', index: 1, contentType: ['text'], length: 11 }],
    })
  })

  it('extracts image_url from array content', () => {
    const body = {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this' },
            { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
          ],
        },
      ],
    }
    const result = extractMessageSequence(body)
    expect(result).toEqual({
      totalCount: 1,
      roles: [
        {
          role: 'user',
          index: 1,
          contentType: ['text', 'image_url'],
          length: 'Describe this'.length,
        },
      ],
    })
  })

  it('sets toolCallCount when message has tool_calls', () => {
    const body = {
      messages: [
        {
          role: 'assistant',
          tool_calls: [{ id: 'call_1' }, { id: 'call_2' }],
        },
      ],
    }
    const result = extractMessageSequence(body)
    expect(result).toEqual({
      totalCount: 1,
      roles: [{ role: 'assistant', index: 1, toolCallCount: 2 }],
    })
  })

  it('sets toolName and toolCallId for role=tool messages', () => {
    const body = {
      messages: [
        { role: 'tool', name: 'get_weather', tool_call_id: 'call_abc', content: '{"temp": 72}' },
      ],
    }
    const result = extractMessageSequence(body)
    expect(result).toEqual({
      totalCount: 1,
      roles: [
        {
          role: 'tool',
          index: 1,
          contentType: ['text'],
          length: '{"temp": 72}'.length,
          toolName: 'get_weather',
          toolCallId: 'call_abc',
        },
      ],
    })
  })

  it('assigns correct 1-based index numbers for multiple messages', () => {
    const body = {
      messages: [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
      ],
    }
    const result = extractMessageSequence(body)
    expect(result?.totalCount).toBe(3)
    expect(result?.roles[0]).toMatchObject({ role: 'system', index: 1 })
    expect(result?.roles[1]).toMatchObject({ role: 'user', index: 2 })
    expect(result?.roles[2]).toMatchObject({ role: 'assistant', index: 3 })
  })

  it('omits length field when content length is 0', () => {
    const body = { messages: [{ role: 'user', content: '' }] }
    const result = extractMessageSequence(body)
    expect(result?.roles[0].length).toBeUndefined()
  })

  it('prefers standardRequestBody over requestBody', () => {
    const requestBody = { messages: [{ role: 'user', content: 'old' }] }
    const standardRequestBody = { messages: [{ role: 'user', content: 'new' }] }
    const result = extractMessageSequence(requestBody, standardRequestBody)
    expect(result?.roles[0].length).toBe(3)
  })

  it('falls back to requestBody when standardRequestBody is undefined', () => {
    const requestBody = { messages: [{ role: 'user', content: 'fallback' }] }
    const result = extractMessageSequence(requestBody, undefined)
    expect(result?.roles[0].length).toBe(8)
  })

  it('calculates content length from array content parts', () => {
    const body = {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'text', text: 'World' },
          ],
        },
      ],
    }
    const result = extractMessageSequence(body)
    expect(result?.roles[0].length).toBe(10)
  })
})

describe('extractToolCalls', () => {
  it('returns null when responseBody is undefined', () => {
    expect(extractToolCalls({ messages: [] }, undefined)).toBeNull()
  })

  it('returns null when responseBody is null', () => {
    expect(extractToolCalls({ messages: [] }, null)).toBeNull()
  })

  it('returns null when responseBody is not an object', () => {
    expect(extractToolCalls({ messages: [] }, 'string')).toBeNull()
  })

  it('returns null when choices array is empty', () => {
    const response = { choices: [] }
    expect(extractToolCalls({ messages: [] }, response)).toBeNull()
  })

  it('returns null when message has no tool_calls', () => {
    const response = { choices: [{ message: { content: 'Hello' } }] }
    expect(extractToolCalls({ messages: [] }, response)).toBeNull()
  })

  it('returns null when tool_calls is empty array', () => {
    const response = { choices: [{ message: { tool_calls: [] } }] }
    expect(extractToolCalls({ messages: [] }, response)).toBeNull()
  })

  it('returns single pattern for one tool call with function details', () => {
    const response = {
      choices: [
        {
          message: {
            tool_calls: [
              {
                id: 'call_123',
                function: { name: 'get_weather', arguments: '{"city":"Paris"}' },
              },
            ],
          },
        },
      ],
    }
    const result = extractToolCalls({ messages: [] }, response)
    expect(result).toEqual({
      pattern: 'single',
      tools: ['get_weather'],
      details: [
        {
          name: 'get_weather',
          arguments: { city: 'Paris' },
          callId: 'call_123',
          source: 'response',
          messageIndex: 0,
        },
      ],
    })
  })

  it('returns parallel pattern for multiple tool calls', () => {
    const response = {
      choices: [
        {
          message: {
            tool_calls: [
              { id: 'call_1', function: { name: 'fn_a', arguments: '{}' } },
              { id: 'call_2', function: { name: 'fn_b', arguments: '{}' } },
            ],
          },
        },
      ],
    }
    const result = extractToolCalls({ messages: [] }, response)
    expect(result?.pattern).toBe('parallel')
    expect(result?.tools).toEqual(['fn_a', 'fn_b'])
    expect(result?.details).toHaveLength(2)
  })

  it('handles tool_call without function as name=unknown and arguments=undefined', () => {
    const response = {
      choices: [
        {
          message: {
            tool_calls: [{ id: 'call_orphan' }],
          },
        },
      ],
    }
    const result = extractToolCalls({ messages: [] }, response)
    expect(result?.tools).toEqual([])
    expect(result?.details![0]).toMatchObject({
      name: 'unknown',
      arguments: undefined,
      callId: 'call_orphan',
    })
  })

  it('merges matching tool result from request body into details', () => {
    const requestBody = {
      messages: [
        { role: 'tool', name: 'get_weather', tool_call_id: 'call_123', content: '{"temp":72}' },
      ],
    }
    const response = {
      choices: [
        {
          message: {
            tool_calls: [
              { id: 'call_123', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } },
            ],
          },
        },
      ],
    }
    const result = extractToolCalls(requestBody, response)
    expect(result?.details![0].result).toBe('{"temp":72}')
  })

  it('does not merge result when no tool results match', () => {
    const requestBody = {
      messages: [{ role: 'tool', name: 'other_tool', tool_call_id: 'call_999', content: 'result' }],
    }
    const response = {
      choices: [
        {
          message: {
            tool_calls: [{ id: 'call_123', function: { name: 'get_weather', arguments: '{}' } }],
          },
        },
      ],
    }
    const result = extractToolCalls(requestBody, response)
    expect(result?.details![0].result).toBeUndefined()
  })

  it('matches tool result by toolName when callId differs', () => {
    const requestBody = {
      messages: [
        { role: 'tool', name: 'get_weather', tool_call_id: 'call_999', content: 'result_by_name' },
      ],
    }
    const response = {
      choices: [
        {
          message: {
            tool_calls: [{ id: 'call_123', function: { name: 'get_weather', arguments: '{}' } }],
          },
        },
      ],
    }
    const result = extractToolCalls(requestBody, response)
    expect(result?.details![0].result).toBe('result_by_name')
  })
})
