/**
 * Constants and gateway response types. Pure data, no runtime-specific code.
 *
 * Shared by pi-coding-agent and oh-my-pi runtimes. The differences between
 * those runtimes are isolated in src/runtime.ts and src/config.ts.
 */

// ---------------------------------------------------------------------------
// Provider identity
// ---------------------------------------------------------------------------

export const PROVIDER_ID = 'x-llm-gateway'
export const PROVIDER_NAME = 'X-LLM Gateway'

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_BASE_URL = 'http://localhost:5005/api/v1'
export const FETCH_TIMEOUT_MS = 5_000
export const DEFAULT_CONTEXT_WINDOW = 128_000
export const DEFAULT_MAX_TOKENS = 16_384

// ---------------------------------------------------------------------------
// Gateway /v1/models response shape (matches schemas/v1-models.schema.json)
// ---------------------------------------------------------------------------

export interface GatewayCapabilities {
  streaming?: boolean
  function_calling?: boolean
  vision?: boolean
  json_mode?: boolean
  reasoning?: boolean
  [key: string]: boolean | undefined
}

export interface GatewayCostTier {
  input_tokens_above: number
  input: number
  output: number
  cache_read?: number
  cache_write?: number
}

export interface GatewayCost {
  input?: number
  output?: number
  cache_read?: number
  cache_write?: number
  tiers?: GatewayCostTier[]
}

export type GatewayThinkingLevel = string | null
export type GatewayThinkingLevelMap = {
  off?: GatewayThinkingLevel
  minimal?: GatewayThinkingLevel
  low?: GatewayThinkingLevel
  medium?: GatewayThinkingLevel
  high?: GatewayThinkingLevel
  xhigh?: GatewayThinkingLevel
  max?: GatewayThinkingLevel
}

export interface GatewayModelEntry {
  id: string
  object?: string
  owned_by?: string
  created?: number

  // v1 schema primary keys
  context_window?: number
  max_output_tokens?: number
  capabilities?: GatewayCapabilities

  // v1 schema optional fields
  name?: string
  cost?: GatewayCost
  headers?: Record<string, string>
  thinking_level_map?: GatewayThinkingLevelMap
  compat?: Record<string, unknown>

  // OpenAI-standard fallbacks some gateways emit
  context_length?: number
  max_tokens?: number

  // camelCase mirrors emitted by newer gateway versions alongside the
  // snake_case keys (pi/omp-compat projection). Same values; used only as
  // fallbacks in case the gateway drops the snake_case spelling.
  contextWindow?: number
  maxTokens?: number
  reasoning?: boolean
  input?: ('text' | 'image')[]
  maxTokensField?: 'max_completion_tokens' | 'max_tokens'
}

export interface GatewayModelsResponse {
  object?: 'list'
  data: GatewayModelEntry[]
}

// ---------------------------------------------------------------------------
// Pi-side configuration shapes (read from ~/.{pi,omp}/agent/*.json|*.yml)
// ---------------------------------------------------------------------------

export interface StoredProviderConfig {
  api?: string
  baseUrl?: string
  apiKey?: string
  [key: string]: unknown
}

export interface ModelsFile {
  providers?: Record<string, StoredProviderConfig>
}

export interface AuthFileEntry {
  type?: string
  key?: string
}

export type AuthFile = Record<string, AuthFileEntry>
