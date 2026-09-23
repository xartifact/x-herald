import { jsonrepair } from 'jsonrepair'

import type { Agent } from '@xartifact/x-herald-sdk'
import type { AgentExecution, InstanceConfig } from '@xartifact/x-herald-shared'

export class InstanceAgentError extends Error {
  constructor(
    public code: 'AGENT_INCOMPLETE' | 'AGENT_INVALID_CONFIG',
    public execution: AgentExecution,
  ) {
    super(
      code === 'AGENT_INCOMPLETE'
        ? '配置助手未完成，未保存配置，请重试。'
        : 'AI 返回了无效配置，未保存，请重试。',
    )
  }
}

export async function generateInstanceConfig(params: {
  agent: Pick<Agent, 'run'>
  systemPrompt: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  signal?: AbortSignal
}) {
  const result = await params.agent.run({
    prompt: params.messages.at(-1)!.content,
    messages: params.messages.slice(0, -1),
    systemPrompt: params.systemPrompt,
    // This endpoint persists only the validated final config for its URL instance.
    // Do not expose general write tools that can target a different instance.
    tools: [],
    signal: params.signal,
  })
  if (result.execution.status !== 'completed') {
    throw new InstanceAgentError('AGENT_INCOMPLETE', result.execution)
  }
  try {
    const parsed = JSON.parse(jsonrepair(result.content.trim()))
    if (
      !parsed.config ||
      typeof parsed.config !== 'object' ||
      Array.isArray(parsed.config) ||
      typeof parsed.explanation !== 'string'
    )
      throw new Error('Invalid config shape')
    return {
      config: parsed.config as InstanceConfig,
      explanation: parsed.explanation,
      execution: result.execution,
    }
  } catch {
    throw new InstanceAgentError('AGENT_INVALID_CONFIG', result.execution)
  }
}
