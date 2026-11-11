export interface ProtocolOption {
  value: string
  label: string
  defaultUrl: string
  /** 该协议的默认上游端点（音频协议用；其他协议留空） */
  defaultEndpoint?: string
}

export interface ProtocolFormValue {
  /** 未启用或表单未初始化时为 undefined */
  enabled?: boolean
  baseUrl?: string
  endpoint?: string
  toolSchemaSanitization?: boolean
}

export interface ProviderFormData {
  name: string
  apiKey?: string
  enabled: boolean
  protocols: Partial<
    Record<'openai' | 'anthropic' | 'gemini' | 'jev' | 'asr' | 'tts', ProtocolFormValue>
  >
}
