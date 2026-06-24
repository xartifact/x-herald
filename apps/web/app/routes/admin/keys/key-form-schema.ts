import * as z from 'zod'

export const keySchema = z.object({
  name: z.string().min(2, '名称至少需要 2 个字符'),
  allowedModels: z.string(),
  rateLimitRpm: z.number().optional().nullable(),
  rateLimitRpd: z.number().optional().nullable(),
  tokenLimitDaily: z.number().optional().nullable(),
  enabled: z.boolean(),
  expiresAt: z.string(),
})

export type KeyFormSchema = z.infer<typeof keySchema>
