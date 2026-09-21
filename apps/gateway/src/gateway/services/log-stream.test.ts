import { describe, expect, it } from 'bun:test'

import { buildLogInsertValues, transformedBodyForStorage } from './log-stream'
import type { StreamLogParams } from './log-stream'

function makeParams(
  overrides: Partial<StreamLogParams> = {},
): StreamLogParams & { isStream: boolean } {
  return {
    virtualKey: { id: 'vk-1', name: 'test-key' } as StreamLogParams['virtualKey'],
    modelName: 'jina-embeddings-v5-omni',
    providerId: 'prov-1',
    providerName: 'test-provider',
    requestHeaders: {},
    requestBody: { input: 'hello' },
    requestPath: '/api/v1/embeddings',
    requestMethod: 'POST',
    requestGroupId: 'grp-1',
    candidateIndex: 0,
    isStream: false,
    ...overrides,
  }
}

describe('buildLogInsertValues requestCategory', () => {
  it('derives embedding for /embeddings path', () => {
    const values = buildLogInsertValues(makeParams())
    expect(values.requestCategory).toBe('embedding')
  })

  it('derives chat_text for chat completions with messages', () => {
    const values = buildLogInsertValues(
      makeParams({
        requestPath: '/api/v1/chat/completions',
        requestBody: {
          messages: [{ role: 'user', content: 'hi' }],
        },
      }),
    )
    expect(values.requestCategory).toBe('chat_text')
  })

  it('derives chat_image when message content has image_url', () => {
    const values = buildLogInsertValues(
      makeParams({
        requestPath: '/api/v1/chat/completions',
        requestBody: {
          messages: [
            {
              role: 'user',
              content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,xxx' } }],
            },
          ],
        },
      }),
    )
    expect(values.requestCategory).toBe('chat_image')
  })

  it('falls back to other for unrecognized requests', () => {
    const values = buildLogInsertValues(
      makeParams({
        requestPath: '/api/v1/something-else',
        requestBody: { foo: 'bar' },
      }),
    )
    expect(values.requestCategory).toBe('other')
  })
})

/**
 * Phase 2 of docs/log-storage-optimization-plan.md: a same-protocol passthrough
 * forwards the client body nearly verbatim, so persisting it again under
 * `request_attempts.transformed_request_body` was pure duplication — the bulk
 * of that column's 6.7 GB. Only a real cross-protocol conversion is worth
 * storing, because there the transformed body is the only record of what went
 * upstream.
 */
describe('transformedBodyForStorage', () => {
  const body = { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] }

  it('stores null for same-protocol passthrough (the duplicate case)', () => {
    expect(
      transformedBodyForStorage(
        makeParams({ incomingProtocol: 'openai', targetProtocol: 'openai', transformedRequestBody: body }),
      ),
    ).toBeNull()
    expect(
      transformedBodyForStorage(
        makeParams({
          incomingProtocol: 'anthropic',
          targetProtocol: 'anthropic',
          transformedRequestBody: body,
        }),
      ),
    ).toBeNull()
  })

  it('stores the full body for a cross-protocol conversion', () => {
    expect(
      transformedBodyForStorage(
        makeParams({
          incomingProtocol: 'anthropic',
          targetProtocol: 'openai',
          transformedRequestBody: body,
        }),
      ),
    ).toEqual(body)
  })

  it('stores null when a protocol is unknown, rather than risk a duplicate', () => {
    expect(
      transformedBodyForStorage(makeParams({ transformedRequestBody: body })),
    ).toBeNull()
  })

  it('normalizes a missing cross-protocol body to null (column stays nullable)', () => {
    expect(
      transformedBodyForStorage(
        makeParams({ incomingProtocol: 'openai', targetProtocol: 'anthropic' }),
      ),
    ).toBeNull()
  })
})
