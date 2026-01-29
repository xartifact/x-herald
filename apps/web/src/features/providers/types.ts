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
