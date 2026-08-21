import { describe, expect, it } from 'bun:test'

import { buildLogInsertValues } from './log-stream'
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
