import { eq, and } from '@xartifact/x-herald-db'
import type { Message, ToolCall, ToolDefinition } from '@xartifact/x-herald-sdk'

import { getDatabase } from '../db/client'
import rootLogger from '../lib/logger'
import { getConfig } from '../features/gateway-config/service'
import { modelInstances, modelGroupMemberships } from '@xartifact/x-herald-db'
import { providers } from '@xartifact/x-herald-db'

const logger = rootLogger.child({ module: 'ai-caller' })

export const CONFIG_KEY_AI_MODEL = 'AI_MODEL_GROUP_ID'

export class AiNotConfiguredError extends Error {
  constructor() {
    super('No AI model configured. Please set an AI model in Settings.')
    this.name = 'AiNotConfiguredError'
  }
}

export interface AiModel {
  actualModelName: string
  apiKey: string | null
  baseUrl: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function getAiModel(): Promise<AiModel> {
  const db = getDatabase()
  const groupId = await getConfig<string | null>(CONFIG_KEY_AI_MODEL, null)

  let instanceResult: Array<{ actualModelName: string; providerId: string }> = []

  if (groupId) {
    instanceResult = await db
      .select({
        actualModelName: modelInstances.actualModelName,
        providerId: modelInstances.providerId,
      })
      .from(modelGroupMemberships)
      .innerJoin(modelInstances, eq(modelGroupMemberships.instanceId, modelInstances.id))
      .innerJoin(providers, eq(providers.id, modelInstances.providerId))
      .where(
        and(
          eq(modelGroupMemberships.groupId, groupId),
          eq(modelInstances.enabled, true),
          eq(providers.enabled, true),
        ),
      )
      .orderBy(modelInstances.priority)
      .limit(1)
  }

  if (instanceResult.length === 0) {
    instanceResult = await db
      .select({
        actualModelName: modelInstances.actualModelName,
        providerId: modelInstances.providerId,
      })
      .from(modelInstances)
      .innerJoin(providers, eq(providers.id, modelInstances.providerId))
      .where(and(eq(modelInstances.enabled, true), eq(providers.enabled, true)))
      .orderBy(modelInstances.priority)
      .limit(1)
  }

  if (instanceResult.length === 0) {
    throw new AiNotConfiguredError()
  }

  const { actualModelName, providerId } = instanceResult[0]

  const providerResult = await db
    .select({ apiKey: providers.apiKey, protocols: providers.protocols })
    .from(providers)
    .where(eq(providers.id, providerId))
    .limit(1)

  const provider = providerResult[0]
  const openaiConfig = provider?.protocols?.openai

  if (!openaiConfig?.enabled || !openaiConfig.baseUrl) {
    throw new AiNotConfiguredError()
  }

  return {
    actualModelName,
    apiKey: provider.apiKey,
    baseUrl: openaiConfig.baseUrl.replace(/\/+$/, ''),
  }
}

export async function callAI(
  messages: Message[],
  opts?: { tools?: ToolDefinition[]; maxTokens?: number },
): Promise<{ content: string; tool_calls?: ToolCall[] }> {
  const model = await getAiModel()

  const body: Record<string, unknown> = {
    model: model.actualModelName,
    messages,
    stream: false,
    max_tokens: opts?.maxTokens ?? 2048,
  }

  if (opts?.tools && opts.tools.length > 0) {
    body.tools = opts.tools
  }

  const response = await fetch(`${model.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errText = await response.text()
    logger.warn({ status: response.status, body: errText }, 'AI provider error')
    throw new Error(`AI provider returned ${response.status}: ${errText}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null
        tool_calls?: ToolCall[]
      }
    }>
  }

  const message = data.choices?.[0]?.message
  const content = message?.content ?? ''

  if (!content && !message?.tool_calls) {
    throw new Error('AI returned empty response')
  }

  return {
    content,
    tool_calls: message?.tool_calls,
  }
}
