import {
  createAssistantMessageEventStream,
  getCurrentTools,
  getSystemMessageText,
} from '@earendil-works/pi-ai'
import type {
  AssistantMessage,
  JsonObject,
  Message,
  Model,
  SimpleStreamOptions,
  TranscriptContext,
  Usage,
} from '@earendil-works/pi-ai'

import type { LLMAdapter } from './types'

export interface OpenAIModelConfig {
  actualModelName: string
  baseUrl: string
  apiKey: string | null
}

interface OpenAICompletion {
  choices?: Array<{
    finish_reason?: string | null
    message?: {
      content?: string | null
      tool_calls?: Array<{
        id?: string
        function?: { name?: string; arguments?: string }
      }>
    }
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

export function createOpenAIAdapter(resolveModel: () => Promise<OpenAIModelConfig>): LLMAdapter {
  return {
    async resolve() {
      const config = await resolveModel()
      return {
        model: {
          id: config.actualModelName,
          name: config.actualModelName,
          api: 'openai-completions',
          provider: 'x-herald',
          baseUrl: config.baseUrl,
          reasoning: false,
          input: ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128_000,
          maxTokens: 2048,
          compat: {
            supportsStore: false,
            supportsDeveloperRole: false,
            supportsReasoningEffort: false,
            supportsUsageInStreaming: false,
            maxTokensField: 'max_tokens',
          },
        },
        apiKey: config.apiKey ?? undefined,
        streamFn: (model, context, options) =>
          createNonStreamingStream(config, model as Model<'openai-completions'>, context, options),
      }
    },
  }
}

function createNonStreamingStream(
  config: OpenAIModelConfig,
  model: Model<'openai-completions'>,
  context: TranscriptContext,
  options?: SimpleStreamOptions,
) {
  const stream = createAssistantMessageEventStream()
  void complete(config, model, context, options)
    .then((message) => {
      stream.push({ type: 'start', partial: message })
      if (message.stopReason === 'error' || message.stopReason === 'aborted') {
        stream.push({
          type: 'error',
          reason: message.stopReason === 'aborted' ? 'aborted' : 'error',
          error: message,
        })
      } else {
        stream.push({
          type: 'done',
          reason:
            message.stopReason === 'length'
              ? 'length'
              : message.stopReason === 'toolUse'
                ? 'toolUse'
                : message.stopReason === 'deferred'
                  ? 'deferred'
                  : 'stop',
          message,
        })
      }
      stream.end(message)
    })
    .catch((error) => {
      const message = createErrorMessage(model, error, options?.signal?.aborted ?? false)
      stream.push({
        type: 'error',
        reason: message.stopReason === 'aborted' ? 'aborted' : 'error',
        error: message,
      })
      stream.end(message)
    })
  return stream
}

async function complete(
  config: OpenAIModelConfig,
  model: Model<'openai-completions'>,
  context: TranscriptContext,
  options?: SimpleStreamOptions,
): Promise<AssistantMessage> {
  const response = await fetch(`${model.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    signal: options?.signal,
    body: JSON.stringify({
      model: model.id,
      messages: toOpenAIMessages(context.messages),
      stream: false,
      max_tokens: options?.maxTokens ?? model.maxTokens,
      ...(options?.temperature === undefined ? {} : { temperature: options.temperature }),
      ...(getCurrentTools(context.messages).length === 0 ? {} : { tools: toOpenAITools(context) }),
    }),
  })
  if (!response.ok)
    throw new Error(`AI provider returned ${response.status}: ${await response.text()}`)
  return toAssistantMessage(model, (await response.json()) as OpenAICompletion)
}

function toOpenAIMessages(messages: Message[]) {
  return messages.map((message) => {
    if (message.role === 'system') return { role: 'system', content: getSystemMessageText(message) }
    if (message.role === 'user') {
      return {
        role: 'user',
        content:
          typeof message.content === 'string'
            ? message.content
            : message.content
                .filter((block) => block.type === 'text')
                .map((block) => block.text)
                .join(''),
      }
    }
    if (message.role === 'assistant') {
      return {
        role: 'assistant',
        content:
          message.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
            .join('') || null,
        ...(message.content.some((block) => block.type === 'toolCall')
          ? {
              tool_calls: message.content
                .filter((block) => block.type === 'toolCall')
                .map((block) => ({
                  id: block.id,
                  type: 'function',
                  function: { name: block.name, arguments: JSON.stringify(block.arguments) },
                })),
            }
          : {}),
      }
    }
    return {
      role: 'tool',
      tool_call_id: message.toolCallId,
      name: message.toolName,
      content: message.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join(''),
    }
  })
}

function toOpenAITools(context: TranscriptContext) {
  return getCurrentTools(context.messages).map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: JSON.parse(JSON.stringify(tool.parameters)) as Record<string, unknown>,
    },
  }))
}

function toAssistantMessage(
  model: Model<'openai-completions'>,
  completion: OpenAICompletion,
): AssistantMessage {
  const choice = completion.choices?.[0]
  const content = choice?.message?.content ?? ''
  const toolCalls = choice?.message?.tool_calls ?? []
  const usage = completion.usage
  return {
    role: 'assistant',
    content: [
      ...(content ? [{ type: 'text' as const, text: content }] : []),
      ...toolCalls.flatMap((toolCall) => {
        if (!toolCall.id || !toolCall.function?.name) return []
        return [
          {
            type: 'toolCall' as const,
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: parseArguments(toolCall.function.arguments),
          },
        ]
      }),
    ],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: createUsage(usage),
    stopReason:
      toolCalls.length > 0 ? 'toolUse' : choice?.finish_reason === 'length' ? 'length' : 'stop',
    timestamp: Date.now(),
  }
}

function parseArguments(value: string | undefined): JsonObject {
  try {
    const parsed = JSON.parse(value ?? '{}')
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as JsonObject)
      : {}
  } catch {
    return {}
  }
}

function createUsage(usage: OpenAICompletion['usage']): Usage {
  const input = usage?.prompt_tokens ?? 0
  const output = usage?.completion_tokens ?? 0
  return {
    input,
    output,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: usage?.total_tokens ?? input + output,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

function createErrorMessage(
  model: Model<'openai-completions'>,
  error: unknown,
  aborted: boolean,
): AssistantMessage {
  return {
    role: 'assistant',
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: createUsage(undefined),
    stopReason: aborted ? 'aborted' : 'error',
    errorMessage: error instanceof Error ? error.message : String(error),
    timestamp: Date.now(),
  }
}
