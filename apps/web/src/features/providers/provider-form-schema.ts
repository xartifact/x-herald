import * as z from 'zod'

export const PROTOCOL_OPTIONS = [
  { value: 'openai', label: 'OpenAI', defaultUrl: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic', defaultUrl: 'https://api.anthropic.com/v1' },
  { value: 'gemini', label: 'Google Gemini', defaultUrl: 'https://generativelanguage.googleapis.com/v1' },
] as const

export const providerSchema = z.object({
  name: z.string().min(2, '名称至少需要 2 个字符'),
  apiKey: z.string().optional(),
  enabled: z.boolean(),
  protocols: z
    .object({
      openai: z.object({ enabled: z.boolean(), baseUrl: z.string().url('请输入有效的 URL').optional() }).optional(),
      anthropic: z.object({ enabled: z.boolean(), baseUrl: z.string().url('请输入有效的 URL').optional() }).optional(),
      gemini: z.object({ enabled: z.boolean(), baseUrl: z.string().url('请输入有效的 URL').optional() }).optional(),
    })
    .refine((protocols) => Object.values(protocols).some((p) => p?.enabled), { message: '至少需要启用一个协议' }),
})

export type ProviderFormData = z.infer<typeof providerSchema>
