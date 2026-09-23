import type { AgentTool } from '@earendil-works/pi-agent-core'
import type { Message, Model, Usage } from '@earendil-works/pi-ai'
import type { TSchema } from 'typebox'

import type { AgentRunParams, ToolExecutor } from './types'

export function createAgentTools(
  names: string[],
  executors: Map<string, ToolExecutor>,
): AgentTool[] {
  return [...new Set(names)].map((name) => {
    const executor = executors.get(name)
    if (!executor) throw new Error(`Unknown tool: ${name}`)
    return {
      name,
      label: name,
      description: executor.tool.description,
      parameters: executor.tool.parameters as TSchema,
      async execute(_id, args, signal) {
        signal?.throwIfAborted()
        const result = await executor.execute(args as Record<string, unknown>, signal)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result ?? null) }],
          details: result ?? null,
        }
      },
    }
  })
}

export function createHistory(
  history: NonNullable<AgentRunParams['messages']>,
  model: Model<'openai-completions'>,
): Message[] {
  return history.map((message) => {
    if (message.role === 'user')
      return { role: 'user', content: message.content, timestamp: Date.now() }
    const usage: Usage = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    }
    return {
      role: 'assistant',
      content: [{ type: 'text', text: message.content }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage,
      stopReason: 'stop',
      timestamp: Date.now(),
    }
  })
}
