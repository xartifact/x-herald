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
  toolSchemaSanitization?: boolean
  /**
   * 上游端点路径（`asr` / `tts` 等自有契约的协议使用）。
   * 缺省时按协议取默认值（`/v1/audio/transcriptions`、`/v1/audio/speech`）。
   * 其他协议忽略该字段。
   */
  endpoint?: string
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
  jev?: ExtendedProtocolConfig
  /** 语音识别（音频输入 → 文本）；上游多为自有 HTTP 契约 */
  asr?: ExtendedProtocolConfig
  /** 语音合成（文本 → 音频）；上游多为自有 HTTP 契约 */
  tts?: ExtendedProtocolConfig
}
