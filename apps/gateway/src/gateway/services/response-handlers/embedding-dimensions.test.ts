import { describe, it, expect } from 'bun:test'

import { enforceEmbeddingDimensions, normalizeRequestedDimensions } from './embedding-dimensions'

function embedding(length: number): number[] {
  return Array.from({ length }, (_, i) => i + 1)
}

describe('normalizeRequestedDimensions', () => {
  it('extracts positive integer dimensions from a request body', () => {
    expect(normalizeRequestedDimensions({ model: 'text-embedding-v4', dimensions: 2048 })).toBe(
      2048,
    )
  })

  it('accepts string dimensions like JSON-parsed bodies', () => {
    expect(normalizeRequestedDimensions({ dimensions: '2048' })).toBe(2048)
  })

  it('returns undefined for missing, invalid, or non-positive dimensions', () => {
    expect(normalizeRequestedDimensions({})).toBeUndefined()
    expect(normalizeRequestedDimensions({ dimensions: 0 })).toBeUndefined()
    expect(normalizeRequestedDimensions({ dimensions: -5 })).toBeUndefined()
    expect(normalizeRequestedDimensions({ dimensions: 1.5 })).toBeUndefined()
    expect(normalizeRequestedDimensions({ dimensions: 'abc' })).toBeUndefined()
    expect(normalizeRequestedDimensions(null)).toBeUndefined()
  })
})

describe('enforceEmbeddingDimensions', () => {
  it('returns undefined when request body has no dimensions', () => {
    const data = {
      object: 'list',
      data: [{ object: 'embedding', embedding: embedding(1024) }],
    } as Record<string, unknown>
    expect(enforceEmbeddingDimensions(data, {})).toBeUndefined()
    expect(enforceEmbeddingDimensions(data, { dimensions: undefined })).toBeUndefined()
  })

  it('returns undefined when response body has no data array', () => {
    expect(enforceEmbeddingDimensions({ object: 'list' }, { dimensions: 2048 })).toBeUndefined()
    expect(enforceEmbeddingDimensions({ data: 'not-array' }, { dimensions: 2048 })).toBeUndefined()
  })

  it('returns undefined when no embedding entry has a numeric array', () => {
    const data = { data: [{ object: 'embedding' }] } as Record<string, unknown>
    expect(enforceEmbeddingDimensions(data, { dimensions: 2048 })).toBeUndefined()
  })

  it('returns undefined when every embedding already has exactly the requested length', () => {
    const data = {
      data: [{ embedding: embedding(2048) }, { embedding: embedding(2048) }],
    } as Record<string, unknown>
    expect(enforceEmbeddingDimensions(data, { dimensions: 2048 })).toBeUndefined()
  })

  it('truncates (matryoshka) embeddings longer than the requested dimensions', () => {
    const data = {
      model: 'text-embedding-v4',
      data: [{ object: 'embedding', embedding: embedding(4096) }],
    } as Record<string, unknown>
    const result = enforceEmbeddingDimensions(data, {
      model: 'text-embedding-v4',
      dimensions: 2048,
    })

    expect(result).not.toBeUndefined()
    expect((result!.data[0] as { embedding: number[] }).embedding).toHaveLength(2048)
    // 截断保留前缀，长度必须恰好 2048
    expect((result!.data[0] as { embedding: number[] }).embedding[0]).toBe(1)
    expect((result!.data[0] as { embedding: number[] }).embedding[2047]).toBe(2048)
  })

  it('throws ProviderInvalidResponseError when upstream returns fewer dimensions than requested', () => {
    const data = {
      model: 'text-embedding-v4',
      data: [{ embedding: embedding(1024) }],
    } as Record<string, unknown>

    expect(() =>
      enforceEmbeddingDimensions(data, { model: 'text-embedding-v4', dimensions: 2048 }),
    ).toThrow(/1024-dimensional embedding but client requested 2048/)
  })

  it('throws when any single embedding in a batch is too short', () => {
    const data = {
      model: 'text-embedding-v4',
      data: [{ embedding: embedding(2048) }, { embedding: embedding(512) }],
    } as Record<string, unknown>

    expect(() => enforceEmbeddingDimensions(data, { dimensions: 2048 })).toThrow(
      /512-dimensional embedding/,
    )
  })

  it('handles a mix of already-correct and over-length embeddings', () => {
    const data = {
      data: [
        { embedding: embedding(2048) },
        { embedding: embedding(4096) },
        { embedding: embedding(4096) },
      ],
    } as Record<string, unknown>
    const result = enforceEmbeddingDimensions(data, { dimensions: 2048 })

    expect(result).not.toBeUndefined()
    expect((result!.data[0] as { embedding: number[] }).embedding).toHaveLength(2048)
    expect((result!.data[1] as { embedding: number[] }).embedding).toHaveLength(2048)
    expect((result!.data[2] as { embedding: number[] }).embedding).toHaveLength(2048)
  })

  it('leaves the original data object untouched (immutability)', () => {
    const original = { data: [{ embedding: embedding(4096) }] } as Record<string, unknown>
    enforceEmbeddingDimensions(original, { dimensions: 2048 })
    expect((original.data[0] as { embedding: number[] }).embedding).toHaveLength(4096)
  })

  it('accepts string dimensions like JSON-parsed request bodies', () => {
    const data = {
      data: [{ embedding: embedding(4096) }],
    } as Record<string, unknown>
    const result = enforceEmbeddingDimensions(data, { dimensions: '2048' })
    expect((result!.data[0] as { embedding: number[] }).embedding).toHaveLength(2048)
  })
})
