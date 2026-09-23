import { Agent as PiAgent } from '@earendil-works/pi-agent-core'
import type { TextContent, ImageContent } from '@earendil-works/pi-ai'

import { createAgentTools, createHistory } from './pi-adapters'

import type {
  AgentConfig,
  AgentResult,
  AgentRunParams,
  LLMAdapter,
  Skill,
  ToolExecutor,
} from './types'

export const AGENT_DEFAULT_MAX_TURNS = 10
export const AGENT_MAX_TURNS = 30
export const AGENT_TIMEOUT_MS = 120_000

export class Agent {
  private executors = new Map<string, ToolExecutor>()
  private skills = new Map<string, Skill>()

  constructor(
    private adapter: LLMAdapter,
    private config: AgentConfig = {},
  ) {}

  registerExecutor(executor: ToolExecutor): void {
    this.executors.set(executor.tool.name, executor)
  }

  registerSkill(skill: Skill): void {
    this.skills.set(skill.name, skill)
  }

  async run(params: AgentRunParams): Promise<AgentResult> {
    const skill = params.skill ? this.skills.get(params.skill) : undefined
    if (params.skill && !skill) throw new Error(`Unknown skill: ${params.skill}`)
    const maxTurns = params.maxTurns ?? this.config.maxTurns ?? AGENT_DEFAULT_MAX_TURNS
    if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > AGENT_MAX_TURNS) {
      throw new Error(`maxTurns must be an integer between 1 and ${AGENT_MAX_TURNS}`)
    }
    const names = params.tools ??
      skill?.tools.map((tool) => tool.name) ?? [...this.executors.keys()]
    const tools = createAgentTools(names, this.executors)
    params.signal?.throwIfAborted()
    const runtime = await this.adapter.resolve()
    const signal = AbortSignal.any([
      AbortSignal.timeout(this.config.timeoutMs ?? AGENT_TIMEOUT_MS),
      ...(params.signal ? [params.signal] : []),
    ])
    signal.throwIfAborted()
    let turns = 0
    let exhausted = false
    const toolCalls: AgentResult['toolCalls'] = []
    const argsByCall = new Map<string, Record<string, unknown>>()
    // Never share Pi's mutable conversation state between HTTP requests.
    const agent = new PiAgent({
      initialState: {
        model: runtime.model,
        systemPrompt: params.systemPrompt ?? skill?.systemPrompt ?? '',
        messages: createHistory(params.messages ?? [], runtime.model),
        tools,
      },
      streamFn: (model, context, options) =>
        runtime.streamFn(model, context, {
          ...options,
          temperature: this.config.temperature,
        }),
      getApiKey: () => runtime.apiKey,
      toolExecution: 'sequential',
      finishTurn: ({ message }) => {
        turns++
        exhausted = turns >= maxTurns && message.stopReason === 'toolUse'
        if (turns >= maxTurns) return { action: 'end' }
      },
    })
    agent.subscribe((event) => {
      if (event.type === 'tool_execution_start') argsByCall.set(event.toolCallId, event.args)
      if (event.type === 'tool_execution_end') {
        toolCalls.push({
          name: event.toolName,
          args: argsByCall.get(event.toolCallId) ?? {},
          result: event.isError
            ? {
                error: (event.result.content as Array<TextContent | ImageContent>)
                  .filter((c) => c.type === 'text')
                  .map((c) => c.text)
                  .join('\n'),
              }
            : event.result.details,
        })
      }
      params.onEvent?.(event)
    })
    const abort = () => agent.abort()
    signal.addEventListener('abort', abort, { once: true })
    try {
      await agent.prompt(params.prompt)
    } finally {
      signal.removeEventListener('abort', abort)
    }
    const last = agent.state.messages.toReversed().find((message) => message.role === 'assistant')
    const status =
      signal.aborted || last?.stopReason === 'aborted'
        ? 'aborted'
        : last?.stopReason === 'error' || last?.stopReason === 'length' || agent.state.errorMessage
          ? 'error'
          : exhausted
            ? 'max_turns'
            : 'completed'
    return {
      content:
        last?.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('') ?? '',
      toolCalls,
      turns,
      execution: { runtime: 'pi', status, turns },
    }
  }
}
