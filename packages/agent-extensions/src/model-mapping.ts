/**
 * Mapping from `GatewayModelEntry` to the agent runtime's `ProviderModelConfig`.
 * Pure logic — identical output regardless of which runtime hosts the extension.
 *
 * snake_case keys are the v1 contract; the camelCase mirrors newer gateway
 * versions emit are fallbacks only (they carry the same values).
 */

import type { ProviderModelConfig } from '@earendil-works/pi-coding-agent'

import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_TOKENS,
  type GatewayCapabilities,
  type GatewayModelEntry,
} from './types.ts'

export function toPiModel(entry: GatewayModelEntry): ProviderModelConfig {
  const caps: GatewayCapabilities = entry.capabilities ?? {}

  const contextWindow =
    entry.context_window ?? entry.contextWindow ?? entry.context_length ?? DEFAULT_CONTEXT_WINDOW

  // `0` = unlimited by gateway convention. Map to half of contextWindow
  // (rounded down) — a practical output ceiling that leaves room for the
  // prompt within the model's context budget.
  const rawMaxTokens = entry.max_output_tokens ?? entry.maxTokens ?? entry.max_tokens
  const maxTokens =
    rawMaxTokens === 0 ? Math.floor(contextWindow / 2) : (rawMaxTokens ?? DEFAULT_MAX_TOKENS)

  const vision = caps.vision ?? entry.input?.includes('image') ?? false
  const input: ('text' | 'image')[] = vision ? ['text', 'image'] : ['text']
  const name = entry.name ?? entry.id

  const model: ProviderModelConfig = {
    id: entry.id,
    name,
    reasoning: caps.reasoning ?? entry.reasoning ?? false,
    input,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow,
    maxTokens,
  }

  if (entry.headers) {
    ;(model as ProviderModelConfig & { headers?: Record<string, string> }).headers = entry.headers
  }
  if (entry.thinking_level_map) {
    ;(
      model as ProviderModelConfig & {
        thinkingLevelMap?: Record<string, string | null>
      }
    ).thinkingLevelMap = entry.thinking_level_map
  }
  if (entry.compat) {
    // camelCase `maxTokensField` mirror carries the same value as
    // `compat.max_tokens_field`; prefer the nested v1 key.
    const compat: Record<string, unknown> = { ...entry.compat }
    if (compat.max_tokens_field === undefined && entry.maxTokensField) {
      compat.max_tokens_field = entry.maxTokensField
    }
    ;(model as ProviderModelConfig & { compat?: Record<string, unknown> }).compat = compat
  }

  return model
}
