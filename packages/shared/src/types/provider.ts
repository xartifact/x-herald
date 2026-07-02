export interface Provider {
  id: string
  name: string
  apiKey: string | null
  protocols: ProtocolsConfig
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface ProtocolConfig {
  baseUrl: string
  enabled: boolean
}

export interface ThinkingMappingConfig {
  enabled: boolean
  mappings: Record<string, string>
}

export type SyntheticThinkingStrategy = 'strip' | 'inject'

export interface ExtendedProtocolConfig extends ProtocolConfig {
  thinkingMapping?: ThinkingMappingConfig
  syntheticThinking?: SyntheticThinkingStrategy
}

export type ProtocolsConfig = Partial<Record<string, ExtendedProtocolConfig>>

export interface ThinkingTypeMapping {
  from: string
  to: string
}

export interface ExtendedProtocolsConfig {
  openai?: ExtendedProtocolConfig
  anthropic?: ExtendedProtocolConfig
  gemini?: ExtendedProtocolConfig
}
