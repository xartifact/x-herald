import type { StreamFn, AgentEvent } from '@earendil-works/pi-agent-core'
import type { Model } from '@earendil-works/pi-ai'
import type { AgentExecution } from '@xartifact/x-herald-shared'

export interface AgentRuntime {
  model: Model<'openai-completions'>
  streamFn: StreamFn
  apiKey?: string
}

export interface LLMAdapter {
  resolve(): Promise<AgentRuntime>
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown> // JSON Schema
  }
}

export interface ChatResult {
  content?: string
  tool_calls?: ToolCall[]
}

// ─── Tool 定义（纯定义，不执行）────────────────────────────

export interface ToolDefinition_Input {
  name: string
  description: string
  parameters: Record<string, unknown> // JSON Schema
}

// ─── Tool 执行器（engine 实现）─────────────────────────────

export interface ToolExecutor {
  tool: ToolDefinition_Input
  execute(args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>
}

// ─── Skill 定义 ────────────────────────────────────────────

export interface Skill {
  name: string
  description: string
  systemPrompt: string
  tools: ToolDefinition_Input[]
}

// ─── Agent 配置 ────────────────────────────────────────────

export interface AgentConfig {
  maxTurns?: number
  temperature?: number
  timeoutMs?: number
}

export interface AgentRunParams {
  prompt: string
  skill?: string
  tools?: string[]
  maxTurns?: number
  systemPrompt?: string
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>
  signal?: AbortSignal
  onEvent?: (event: AgentEvent) => void
}

// ─── Agent 结果 ────────────────────────────────────────────

export interface AgentResult {
  content: string
  toolCalls: Array<{
    name: string
    args: Record<string, unknown>
    result: unknown
  }>
  turns: number
  execution: AgentExecution
}
