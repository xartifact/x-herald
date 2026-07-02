import { describe, it, expect } from 'bun:test'
import {
  detectProtocol,
  getProviderProtocol,
  getProviderUrl,
  getEndpoint,
} from './protocol-detector'

// ---------------------------------------------------------------------------
// detectProtocol()
// ---------------------------------------------------------------------------
describe('detectProtocol', () => {
  // -- Header-based detection --
  it('returns anthropic when x-protocol-type header is anthropic', () => {
    const headers = new Headers({ 'x-protocol-type': 'anthropic' })
    expect(detectProtocol('/v1/chat/completions', {}, headers)).toBe('anthropic')
  })

  it('returns openai when x-protocol-type header is openai', () => {
    const headers = new Headers({ 'x-protocol-type': 'openai' })
    expect(detectProtocol('/v1/messages', {}, headers)).toBe('openai')
  })

  it('ignores header when x-protocol-type is unrecognized', () => {
    const headers = new Headers({ 'x-protocol-type': 'unknown' })
    expect(detectProtocol('/v1/chat/completions', {}, headers)).toBe('openai')
  })

  it('ignores missing headers', () => {
    expect(detectProtocol('/v1/chat/completions', {})).toBe('openai')
  })

  // -- Path-based detection --
  it('returns openai for /v1/chat/completions path', () => {
    expect(detectProtocol('/v1/chat/completions', {})).toBe('openai')
  })

  it('returns anthropic for /v1/messages path', () => {
    expect(detectProtocol('/v1/messages', {})).toBe('anthropic')
  })

  // -- Body heuristic: system string + max_tokens --
  it('returns anthropic when body has system string and max_tokens', () => {
    const body = { system: 'You are a helpful assistant', max_tokens: 100 }
    expect(detectProtocol('/unknown', body)).toBe('anthropic')
  })

  it('does NOT detect anthropic when system is not a string', () => {
    // max_tokens without temperature/top_p triggers the final anthropic heuristic,
    // so suppress it by including temperature
    const body = { system: ['You are a helpful assistant'], max_tokens: 100, temperature: 0.7 }
    expect(detectProtocol('/unknown', body)).toBe('openai')
  })

  // -- Body heuristic: messages array with tool role --
  it('returns anthropic when messages have tool role, all valid roles, and max_tokens', () => {
    const body = {
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: null, tool_calls: [] },
        { role: 'tool', content: 'result' },
      ],
      max_tokens: 200,
    }
    expect(detectProtocol('/unknown', body)).toBe('anthropic')
  })

  it('does NOT detect anthropic when messages have tool role but no max_tokens', () => {
    const body = {
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'tool', content: 'result' },
      ],
    }
    expect(detectProtocol('/unknown', body)).toBe('openai')
  })

  it('does NOT detect anthropic when messages have invalid roles for anthropic', () => {
    const body = {
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'system', content: 'Be helpful' },
        { role: 'tool', content: 'result' },
      ],
      max_tokens: 200,
      temperature: 0.7, // suppress the final max_tokens catch-all heuristic
    }
    // hasSystem is true (system role in messages), so the !hasSystem check is false
    // 'system' is NOT in validAnthropicRoles ['user','assistant','tool'], so allValidRoles is false
    // falls through all heuristics → defaults to openai
    expect(detectProtocol('/unknown', body)).toBe('openai')
  })

  it('does NOT detect anthropic when messages have tool_use but a system role exists', () => {
    const body = {
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'system', content: 'Be helpful' },
      ],
      max_tokens: 200,
      temperature: 0.7, // suppress the final max_tokens catch-all heuristic
    }
    // system is not a string (it's a message array member), so first check fails
    // hasSystem is true, so !hasSystem is false → tool heuristic skipped
    expect(detectProtocol('/unknown', body)).toBe('openai')
  })

  // -- Body heuristic: OpenAI-specific fields --
  it('returns openai when body has seed field', () => {
    const body = { seed: 42, max_tokens: 100 }
    expect(detectProtocol('/unknown', body)).toBe('openai')
  })

  it('returns openai when body has max_completion_tokens field', () => {
    const body = { max_completion_tokens: 100 }
    expect(detectProtocol('/unknown', body)).toBe('openai')
  })

  // -- Body heuristic: max_tokens without temperature/top_p --
  it('returns anthropic when body has max_tokens but no temperature or top_p', () => {
    const body = { max_tokens: 100 }
    expect(detectProtocol('/unknown', body)).toBe('anthropic')
  })

  it('returns openai when body has max_tokens paired with temperature', () => {
    const body = { max_tokens: 100, temperature: 0.7 }
    expect(detectProtocol('/unknown', body)).toBe('openai')
  })

  it('returns openai when body has max_tokens paired with top_p', () => {
    const body = { max_tokens: 100, top_p: 0.9 }
    expect(detectProtocol('/unknown', body)).toBe('openai')
  })

  // -- Edge cases --
  it('returns openai for empty object body', () => {
    expect(detectProtocol('/unknown', {})).toBe('openai')
  })

  it('returns openai for null body', () => {
    expect(detectProtocol('/unknown', null)).toBe('openai')
  })

  it('returns openai for non-object body (string)', () => {
    expect(detectProtocol('/unknown', 'not-an-object')).toBe('openai')
  })
})

// ---------------------------------------------------------------------------
// getProviderProtocol()
// ---------------------------------------------------------------------------
describe('getProviderProtocol', () => {
  it('returns client protocol when provider has it enabled', () => {
    const provider = { protocols: { openai: { enabled: true } } }
    expect(getProviderProtocol('openai', provider)).toBe('openai')
  })

  it('returns client protocol when provider has both enabled (anthropic)', () => {
    const provider = {
      protocols: {
        openai: { enabled: true },
        anthropic: { enabled: true },
      },
    }
    expect(getProviderProtocol('anthropic', provider)).toBe('anthropic')
  })

  it('falls back to openai when client=anthropic but provider only has openai', () => {
    const provider = { protocols: { openai: { enabled: true } } }
    expect(getProviderProtocol('anthropic', provider)).toBe('openai')
  })

  it('falls back to anthropic when client=openai but provider only has anthropic', () => {
    const provider = { protocols: { anthropic: { enabled: true } } }
    expect(getProviderProtocol('openai', provider)).toBe('anthropic')
  })

  it('returns openai when client protocol is disabled and no other is enabled', () => {
    const provider = { protocols: { openai: { enabled: false } } }
    expect(getProviderProtocol('openai', provider)).toBe('openai')
  })

  it('returns openai when provider has no protocols', () => {
    const provider = {}
    expect(getProviderProtocol('anthropic', provider)).toBe('openai')
  })

  it('returns openai when provider.protocols is undefined', () => {
    const provider = { protocols: undefined }
    expect(getProviderProtocol('anthropic', provider)).toBe('openai')
  })
})

// ---------------------------------------------------------------------------
// getProviderUrl()
// ---------------------------------------------------------------------------
describe('getProviderUrl', () => {
  it('returns baseUrl when protocol is enabled and has baseUrl', () => {
    const provider = {
      protocols: {
        openai: { enabled: true, baseUrl: 'https://api.openai.com/v1' },
      },
    }
    expect(getProviderUrl(provider, 'openai')).toBe('https://api.openai.com/v1')
  })

  it('returns null when protocol is not enabled', () => {
    const provider = {
      protocols: {
        openai: { enabled: false, baseUrl: 'https://api.openai.com/v1' },
      },
    }
    expect(getProviderUrl(provider, 'openai')).toBeNull()
  })

  it('returns null when protocol is enabled but has no baseUrl', () => {
    const provider = {
      protocols: {
        openai: { enabled: true },
      },
    }
    expect(getProviderUrl(provider, 'openai')).toBeNull()
  })

  it('returns null when protocol does not exist in provider', () => {
    const provider = {
      protocols: {
        openai: { enabled: true, baseUrl: 'https://api.openai.com/v1' },
      },
    }
    expect(getProviderUrl(provider, 'anthropic')).toBeNull()
  })

  it('returns null when provider has no protocols', () => {
    expect(getProviderUrl({}, 'openai')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getEndpoint()
// ---------------------------------------------------------------------------
describe('getEndpoint', () => {
  it('returns /v1/chat/completions for openai', () => {
    expect(getEndpoint('openai', false)).toBe('/v1/chat/completions')
  })

  it('returns /v1/messages for anthropic', () => {
    expect(getEndpoint('anthropic', false)).toBe('/v1/messages')
  })

  it('returns /v1/chat/completions for unknown protocol', () => {
    expect(getEndpoint('unknown-protocol', true)).toBe('/v1/chat/completions')
  })

  it('ignores isStreaming per current implementation', () => {
    // getEndpoint currently ignores isStreaming, this locks that behavior
    expect(getEndpoint('openai', true)).toBe('/v1/chat/completions')
    expect(getEndpoint('anthropic', false)).toBe('/v1/messages')
  })
})
