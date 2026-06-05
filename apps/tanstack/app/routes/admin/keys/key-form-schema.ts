import * as z from 'zod'

export const keySchema = z.object({
  name: z.string().min(2, '名称至少需要 2 个字符'),
  allowedModels: z.string(),
  rateLimitRpm: z.number().optional(),
  rateLimitRpd: z.number().optional(),
  tokenLimitDaily: z.number().optional(),
  enabled: z.boolean(),
  expiresAt: z.string(),
})

export type KeyFormSchema = z.infer<typeof keySchema>
