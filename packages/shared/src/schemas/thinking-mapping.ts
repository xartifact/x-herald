import { z } from 'zod'

export const mappingSchema = z.object({
  from: z.string(),
  to: z.string(),
})

export const thinkingMappingFormSchema = z.object({
  mappings: z.array(mappingSchema),
  syntheticThinking: z.enum(['strip', 'inject']),
})

export type MappingFormData = z.infer<typeof thinkingMappingFormSchema>
