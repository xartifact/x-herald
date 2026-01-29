/**
 * API 响应类型定义
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

export interface Model {
  id: string
  name: string
  displayName: string
  actualModelName: string
  providerId: string
  enabled: boolean
  routingConfig: {
    strategy: 'round_robin' | 'weighted' | 'least_latency' | 'priority' | 'smart'
    fallbackEnabled: boolean
  }
  protocolConversion: {
    enabled: boolean
    targetProtocol: 'openai' | 'anthropic' | 'gemini'
  }
  createdAt: string
  updatedAt: string
}

export interface AuthResponse {
  token: string
}

export interface AuthMeResponse {
  authenticated: boolean
  user?: {
    role: string
  }
}

export interface VirtualKey {
  id: string
  key: string
  name: string
  allowedModels: string[] | null
  rateLimitRpm: number | null
  rateLimitRpd: number | null
  tokenLimitDaily: bigint | null
  enabled: boolean
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}
