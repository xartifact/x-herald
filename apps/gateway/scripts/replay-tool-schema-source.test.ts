import { describe, expect, it } from 'bun:test'

import { selectReplayBody } from './replay-tool-schema-source'

describe('selectReplayBody', () => {
  it('prefers the stored provider request body', () => {
    const transformedRequestBody = { tools: [{ function: { name: 'provider_tool' } }] }
    const requestBody = { tools: [{ function: { name: 'client_tool' } }] }

    expect(
      selectReplayBody({
        transformedRequestBody,
        requestBody,
        incomingProtocol: 'openai',
        targetProtocol: 'anthropic',
      }),
    ).toEqual({ kind: 'transformed', body: transformedRequestBody })
  })

  it('uses the original request body for same-protocol passthrough', () => {
    const requestBody = { tools: [{ function: { name: 'client_tool' } }] }

    expect(
      selectReplayBody({
        transformedRequestBody: null,
        requestBody,
        incomingProtocol: 'openai',
        targetProtocol: 'openai',
      }),
    ).toEqual({ kind: 'original', body: requestBody })
  })

  it('rejects same-protocol fallback when the original request body is absent', () => {
    const result = selectReplayBody({
      transformedRequestBody: null,
      requestBody: null,
      incomingProtocol: 'openai',
      targetProtocol: 'openai',
    })

    expect(result.kind).toBe('error')
    if (result.kind === 'error') {
      expect(result.message).toContain('request_logs.request_body is also unavailable')
    }
  })

  it('rejects a missing transformed body when protocols are cross-protocol or unknown', () => {
    const protocolPairs: Array<[string | null, string | null]> = [
      ['openai', 'anthropic'],
      ['openai', null],
      [null, 'openai'],
    ]

    for (const [incomingProtocol, targetProtocol] of protocolPairs) {
      const result = selectReplayBody({
        transformedRequestBody: null,
        requestBody: { tools: [] },
        incomingProtocol,
        targetProtocol,
      })

      expect(result.kind).toBe('error')
      if (result.kind === 'error') {
        expect(result.message).toContain('do not prove same-protocol passthrough')
      }
    }
  })
})
