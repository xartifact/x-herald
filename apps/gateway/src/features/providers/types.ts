/**
 * Provider 类型定义
 */

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

export interface ProtocolsConfig {
  openai?: ProtocolConfig
  anthropic?: ProtocolConfig
  gemini?: ProtocolConfig
}

export interface ThinkingTypeMapping {
  from: string
  to: string
}

export interface ThinkingMappingConfig {
  enabled: boolean
  mappings: Record<string, string>
}

export interface ExtendedProtocolConfig extends ProtocolConfig {
  thinkingMapping?: ThinkingMappingConfig
}

export interface ExtendedProtocolsConfig {
  openai?: ExtendedProtocolConfig
  anthropic?: ExtendedProtocolConfig
  gemini?: ExtendedProtocolConfig
}

export interface ThinkingTypeMapping {
  from: string
  to: string
}

export interface ThinkingMappingConfig {
  enabled: boolean
  mappings: Record<string, string>
}

export interface ExtendedProtocolConfig extends ProtocolConfig {
  thinkingMapping?: ThinkingMappingConfig
}

export interface ExtendedProtocolsConfig {
  openai?: ExtendedProtocolConfig
  anthropic?: ExtendedProtocolConfig
  gemini?: ExtendedProtocolConfig
}
