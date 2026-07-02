import type { ProtocolType as PT } from './llm'

export type ProtocolType = PT

export interface Usage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export interface ProviderConfig {
  name: string
  baseUrl: string
  apiKey: string
  protocol: ProtocolType
  models: string[]
  headers?: Record<string, string>
}

export interface TransformerConstructor {
  new (options?: Record<string, unknown>): import('./llm').Transformer
}

export interface TransformerChainConfig {
  ingress?: string | string[]
  egress?: string | string[]
  responseIngress?: string | string[]
  responseEgress?: string | string[]
}

export interface TransformerRegistry {
  register(name: string, transformer: import('./llm').Transformer | TransformerConstructor): void
  get(name: string): import('./llm').Transformer | undefined
  has(name: string): boolean
  list(): string[]
  clear(): void
}

export interface ProtocolDetector {
  detect(request: unknown): ProtocolType | null
}
