export interface ProtocolOption {
  value: string
  label: string
  defaultUrl: string
}

export interface ProviderFormData {
  name: string
  apiKey?: string
  enabled: boolean
  protocols: {
    openai?: { enabled: boolean; baseUrl?: string; toolSchemaSanitization?: boolean }
    anthropic?: { enabled: boolean; baseUrl?: string; toolSchemaSanitization?: boolean }
    gemini?: { enabled: boolean; baseUrl?: string; toolSchemaSanitization?: boolean }
  }
}
