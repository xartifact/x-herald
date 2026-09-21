import { describe, expect, it } from 'bun:test'

import {
  buildCorpus,
  buildTurns,
  fingerprint,
  redactText,
  toJsonl,
  type RequestLogRow,
} from './corpus-export'

/** Build a log row with sensible defaults; override only what a test cares about. */
function row(overrides: Partial<RequestLogRow> = {}): RequestLogRow {
  return {
    id: 'log-1',
    conversationId: 'conv-1',
    modelName: 'gpt-4o',
    createdAt: new Date('2026-03-05T10:00:00.000Z'),
    requestBody: {
      messages: [
        { role: 'user', content: 'How do I fix this?' },
        { role: 'assistant', content: 'Change the last line.' },
      ],
    },
    ...overrides,
  }
}

describe('redactText', () => {
  it('zeroes the last octet of an IPv4 address, keeping the subnet', () => {
    expect(redactText('failed from 203.0.113.42')).toBe('failed from 203.0.113.0')
  })

  it('masks token-shaped strings', () => {
    expect(redactText('key sk-abcdefghijklmnopqrstuvwxyz')).toContain('[REDACTED_TOKEN]')
    expect(redactText('key sk-abcdefghijklmnopqrstuvwxyz')).not.toContain('abcdefghijklmnop')
  })

  it('leaves ordinary prose untouched', () => {
    // Redaction must not mangle the training signal it exists to protect.
    const prose = 'The server returned a 500 error after two retries.'
    expect(redactText(prose)).toBe(prose)
  })

  it('does not treat a version number as an IP', () => {
    expect(redactText('version 1.2.3')).toBe('version 1.2.3')
  })
})

describe('buildTurns', () => {
  it('keeps user and assistant turns in order', () => {
    const turns = buildTurns(row())
    expect(turns.map((t) => t.role)).toEqual(['user', 'assistant'])
    expect(turns[0]?.content).toBe('How do I fix this?')
  })

  it('strips agent noise blocks', () => {
    // The corpus must not carry scaffolding the router already treats as noise.
    const turns = buildTurns(
      row({
        requestBody: {
          messages: [
            { role: 'user', content: 'Real question <system-reminder>ignore me</system-reminder>' },
            { role: 'assistant', content: 'Real answer' },
          ],
        },
      }),
    )
    expect(turns[0]?.content).toBe('Real question')
  })

  it('drops messages that reduce to nothing after stripping', () => {
    const turns = buildTurns(
      row({
        requestBody: {
          messages: [
            { role: 'user', content: '<tool_result>only noise</tool_result>' },
            { role: 'assistant', content: 'answer' },
          ],
        },
      }),
    )
    expect(turns).toHaveLength(1)
    expect(turns[0]?.role).toBe('assistant')
  })

  it('skips system and tool roles, which are not training turns', () => {
    const turns = buildTurns(
      row({
        requestBody: {
          messages: [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'q' },
            { role: 'tool', content: 'tool output' },
            { role: 'assistant', content: 'a' },
          ],
        },
      }),
    )
    expect(turns.map((t) => t.role)).toEqual(['user', 'assistant'])
  })

  it('extracts text parts from multimodal content and ignores the rest', () => {
    const turns = buildTurns(
      row({
        requestBody: {
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'describe this' },
                { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
              ],
            },
            { role: 'assistant', content: 'a cat' },
          ],
        },
      }),
    )
    expect(turns[0]?.content).toBe('describe this')
    expect(turns[0]?.content).not.toContain('base64')
  })

  it('returns nothing for a body with no messages', () => {
    expect(buildTurns(row({ requestBody: {} }))).toEqual([])
    expect(buildTurns(row({ requestBody: null }))).toEqual([])
    expect(buildTurns(row({ requestBody: 'not an object' }))).toEqual([])
  })

  it('redacts identifiers inside message text', () => {
    const turns = buildTurns(
      row({
        requestBody: {
          messages: [
            { role: 'user', content: 'call from 10.0.0.99' },
            { role: 'assistant', content: 'ok' },
          ],
        },
      }),
    )
    expect(turns[0]?.content).toBe('call from 10.0.0.0')
  })
})

describe('fingerprint', () => {
  it('is stable for identical turns and differs when content changes', () => {
    const a = buildTurns(row())
    const b = buildTurns(row({ id: 'log-2' }))
    expect(fingerprint(a)).toBe(fingerprint(b))
    expect(fingerprint(a)).not.toBe(fingerprint([{ role: 'user', content: 'other' }]))
  })

  it('distinguishes a role swap with identical text', () => {
    // Without the separator, "user:q" + "assistant:a" would collide with the swap.
    const one = fingerprint([
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'a' },
    ])
    const two = fingerprint([
      { role: 'assistant', content: 'q' },
      { role: 'user', content: 'a' },
    ])
    expect(one).not.toBe(two)
  })
})

describe('buildCorpus', () => {
  it('emits one sample per conversation and records provenance', () => {
    const result = buildCorpus([row()])
    expect(result.samples).toHaveLength(1)
    expect(result.samples[0]?.source_log_id).toBe('log-1')
    expect(result.samples[0]?.conversation_id).toBe('conv-1')
    expect(result.samples[0]?.created_at).toBe('2026-03-05T10:00:00.000Z')
    expect(result.skipped).toEqual({ empty: 0, duplicate: 0 })
  })

  it('drops retries and replays that repeat the same conversation', () => {
    // Retries would otherwise over-weight the same prompt in training.
    const result = buildCorpus([row(), row({ id: 'log-2' }), row({ id: 'log-3' })])
    expect(result.samples).toHaveLength(1)
    expect(result.skipped.duplicate).toBe(2)
  })

  it('keeps conversations that differ only in content', () => {
    const result = buildCorpus([
      row(),
      row({
        id: 'log-2',
        requestBody: {
          messages: [
            { role: 'user', content: 'different question' },
            { role: 'assistant', content: 'different answer' },
          ],
        },
      }),
    ])
    expect(result.samples).toHaveLength(2)
    expect(result.skipped.duplicate).toBe(0)
  })

  it('skips rows without both a user and an assistant turn', () => {
    const result = buildCorpus([
      row({ id: 'only-user', requestBody: { messages: [{ role: 'user', content: 'q' }] } }),
      row({
        id: 'only-assistant',
        requestBody: { messages: [{ role: 'assistant', content: 'a' }] },
      }),
      row({ id: 'no-body', requestBody: {} }),
    ])
    expect(result.samples).toHaveLength(0)
    expect(result.skipped.empty).toBe(3)
  })

  it('accepts an ISO string timestamp as well as a Date', () => {
    const result = buildCorpus([row({ createdAt: '2026-03-05T10:00:00.000Z' })])
    expect(result.samples[0]?.created_at).toBe('2026-03-05T10:00:00.000Z')
  })
})

describe('toJsonl', () => {
  it('writes one parseable JSON object per line, newline-terminated', () => {
    const { samples } = buildCorpus([row()])
    const jsonl = toJsonl(samples)
    expect(jsonl.endsWith('\n')).toBe(true)
    const lines = jsonl.trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]!)).toMatchObject({ source_log_id: 'log-1' })
  })

  it('produces nothing for an empty sample set', () => {
    expect(toJsonl([])).toBe('')
  })
})
