import * as z from 'zod'

/**
 * 上游协议选项（供应商表单的勾选项与默认地址）。
 *
 * `asr` / `tts` 是自有 HTTP 契约（whisper-server、sherpa 等），默认地址留空由用户填写；
 * 端点用 `endpoint` 描述，缺省取 `/v1/audio/transcriptions`、`/v1/audio/speech`。
 */
export const PROTOCOL_OPTIONS = [
  { value: 'openai', label: 'OpenAI', defaultUrl: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic', defaultUrl: 'https://api.anthropic.com/v1' },
  {
    value: 'gemini',
    label: 'Google Gemini',
    defaultUrl: 'https://generativelanguage.googleapis.com/v1',
  },
  { value: 'jev', label: 'JEV System One', defaultUrl: 'https://api.typesafe.ai' },
  {
    value: 'asr',
    label: '语音识别 (ASR)',
    defaultUrl: '',
    defaultEndpoint: '/v1/audio/transcriptions',
  },
  { value: 'tts', label: '语音合成 (TTS)', defaultUrl: '', defaultEndpoint: '/v1/audio/speech' },
] as const

/**
 * 单个协议的配置。
 *
 * `enabled` 可选：表单会为每个协议选项渲染 checkbox，RHF 因此会为未出现在
 * defaultValues 里的协议注册出 `{ enabled: undefined }`。缺省即「未启用」——
 * 由 refine 统一判定「至少要有一个协议是启用状态」，而不是让字段本身报类型错误。
 */
const protocolConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    baseUrl: z.string().url('请输入有效的 URL').or(z.literal('')).optional(),
    endpoint: z.string().optional(),
    toolSchemaSanitization: z.boolean().optional(),
  })
  .optional()

export const providerSchema = z.object({
  name: z.string().min(2, '名称至少需要 2 个字符'),
  apiKey: z.string().optional(),
  enabled: z.boolean(),
  protocols: z
    .object({
      openai: protocolConfigSchema,
      anthropic: protocolConfigSchema,
      gemini: protocolConfigSchema,
      jev: protocolConfigSchema,
      asr: protocolConfigSchema,
      tts: protocolConfigSchema,
    })
    .refine((protocols) => Object.values(protocols).some((p) => p?.enabled === true), {
      message: '至少需要启用一个协议',
    }),
})

export type ProviderFormData = z.infer<typeof providerSchema>
