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
    openai?: { enabled: boolean; baseUrl?: string }
    anthropic?: { enabled: boolean; baseUrl?: string }
    gemini?: { enabled: boolean; baseUrl?: string }
  }
}
