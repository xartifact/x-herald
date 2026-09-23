import { z } from 'zod'

export const instanceAgentRequestSchema = z
  .object({
    messages: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string().trim().min(1),
        }),
      )
      .min(1)
      .max(100),
  })
  .refine((value) => value.messages.at(-1)?.role === 'user', {
    message: 'Last message must be from the user',
  })

export const agentRunRequestSchema = z.object({
  prompt: z.string().trim().min(1),
  skill: z.string().optional(),
  tools: z.array(z.string()).optional(),
  maxTurns: z.number().int().min(1).max(30).optional(),
})
