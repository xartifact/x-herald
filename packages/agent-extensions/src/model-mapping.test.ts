import { describe, expect, it } from 'bun:test'

import { toPiModel } from './model-mapping'
import type { GatewayModelEntry } from './types'

const base: GatewayModelEntry = {
  id: 'test-model',
  context_window: 128_000,
  max_output_tokens: 16_384,
  capabilities: { vision: true, reasoning: true },
}

describe('toPiModel', () => {
  it('maps snake_case v1 keys to ProviderModelConfig', () => {
    const m = toPiModel(base)
    expect(m.id).toBe('test-model')
    expect(m.name).toBe('test-model')
    expect(m.contextWindow).toBe(128_000)
    expect(m.maxTokens).toBe(16_384)
    expect(m.reasoning).toBe(true)
    expect(m.input).toEqual(['text', 'image'])
    expect(m.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
  })

  it('maps max_output_tokens=0 (unlimited) to floor(context_window / 2)', () => {
    const m = toPiModel({ ...base, max_output_tokens: 0 })
    expect(m.maxTokens).toBe(64_000)
  })

  it('falls back to DEFAULT_MAX_TOKENS when max_output_tokens is missing', () => {
    const { max_output_tokens: _drop, ...entry } = base
    expect(toPiModel(entry).maxTokens).toBe(16_384)
  })

  it('falls back to camelCase mirrors when snake_case keys are absent', () => {
    const m = toPiModel({
      id: 'camel',
      contextWindow: 8_192,
      maxTokens: 4_096,
      reasoning: true,
      input: ['text', 'image'],
    })
    expect(m.contextWindow).toBe(8_192)
    expect(m.maxTokens).toBe(4_096)
    expect(m.reasoning).toBe(true)
    expect(m.input).toEqual(['text', 'image'])
  })

  it('falls back to context_length before DEFAULT_CONTEXT_WINDOW', () => {
    const m = toPiModel({ id: 'ctx', context_length: 32_000 })
    expect(m.contextWindow).toBe(32_000)
  })

  it('uses entry.name when present, else id', () => {
    expect(toPiModel({ ...base, name: 'Test Model' }).name).toBe('Test Model')
    expect(toPiModel({ ...base, name: undefined }).name).toBe('test-model')
  })

  it('derives vision from the input mirror when capabilities.vision is absent', () => {
    const m = toPiModel({ id: 'v', input: ['text', 'image'] })
    expect(m.input).toEqual(['text', 'image'])
  })

  it('forwards headers, thinking_level_map, and compat', () => {
    const m = toPiModel({
      ...base,
      headers: { 'X-Model-Tier': 'premium' },
      thinking_level_map: { high: 'high', max: null },
      compat: { supports_developer_role: true },
    })
    expect(m.headers).toEqual({ 'X-Model-Tier': 'premium' })
    expect(m.thinkingLevelMap).toEqual({ high: 'high', max: null })
    expect(m.compat).toEqual({ supports_developer_role: true })
  })

  it('fills compat.max_tokens_field from the camelCase mirror when compat exists', () => {
    const m = toPiModel({
      ...base,
      compat: { supports_developer_role: true },
      maxTokensField: 'max_completion_tokens',
    })
    expect(m.compat).toEqual({
      supports_developer_role: true,
      max_tokens_field: 'max_completion_tokens',
    })
  })

  it('does not synthesize compat from a lone maxTokensField mirror', () => {
    // gateway 只在自身有 compat 时发射镜像（api.ts:50 守卫），单独镜像不出现；
    // 保持源行为：没有 compat 对象就不生成。
    const m = toPiModel({ ...base, maxTokensField: 'max_completion_tokens' })
    expect(m.compat).toBeUndefined()
  })

  it('prefers nested compat.max_tokens_field over the mirror', () => {
    const m = toPiModel({
      ...base,
      compat: { max_tokens_field: 'max_tokens' },
      maxTokensField: 'max_completion_tokens',
    })
    expect(m.compat).toEqual({ max_tokens_field: 'max_tokens' })
  })
})
