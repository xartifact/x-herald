import { z } from 'zod'
import type { GroupFormData, InstanceFormData } from '@xartifact/x-herald-shared'

const price = z.number().finite().nonnegative('价格不能为负数')
const rate = z.object({
  input: price,
  output: price,
  cache_read: price.optional(),
  cache_write: price.optional(),
})
export const instanceFormSchema: z.ZodType<InstanceFormData, InstanceFormData> = z.object({
  providerId: z.string().min(1, '请选择供应商'),
  name: z.string().trim().min(1, '请输入实例名称'),
  actualModelName: z.string().trim().min(1, '请输入实际模型名称'),
  description: z.string(),
  weight: z.number().finite().nonnegative('权重不能为负数'),
  groupIds: z.array(z.string()).optional(),
  config: z.custom<InstanceFormData['config']>().optional(),
  costPer1kTokens: rate
    .extend({
      _enabled: z.boolean(),
      tiers: z
        .array(rate.extend({ input_tokens_above: z.number().finite().nonnegative() }))
        .optional(),
    })
    .optional(),
})

export const groupFormSchema: z.ZodType<GroupFormData, GroupFormData> = z.object({
  name: z.string().trim().min(1, '请输入模型组名称'),
  aliases: z.string(),
  displayName: z.string().trim().min(1, '请输入显示名称'),
  description: z.string(),
  category: z.enum(['chat', 'embedding', 'image', 'audio', 'system_one']),
  capabilities: z
    .object({
      streaming: z.boolean(),
      functionCalling: z.boolean(),
      vision: z.boolean(),
      jsonMode: z.boolean(),
      maxTokens: z.number().int().positive(),
      contextWindow: z.number().int().positive(),
    })
    .passthrough(),
  routingStrategy: z.enum([
    'round_robin',
    'weighted',
    'least_response_time',
    'priority',
    'cost_optimized',
    'smart',
  ]),
  fallbackEnabled: z.boolean(),
})
