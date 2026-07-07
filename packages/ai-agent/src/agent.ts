import type { LLMAdapter, Message, ToolExecutor, Skill, AgentConfig, AgentResult } from './types'

export class Agent {
  private adapter: LLMAdapter
  private executors: Map<string, ToolExecutor>
  private skills: Map<string, Skill>
  private config: AgentConfig

  constructor(adapter: LLMAdapter, config: AgentConfig = {}) {
    this.adapter = adapter
    this.executors = new Map()
    this.skills = new Map()
    this.config = { maxTurns: 10, ...config }
  }

  registerExecutor(executor: ToolExecutor): void {
    this.executors.set(executor.tool.name, executor)
  }

  registerSkill(skill: Skill): void {
    this.skills.set(skill.name, skill)
  }

  async run(params: {
    prompt: string
    skill?: string
    tools?: string[] // 限制可用工具
    maxTurns?: number
  }): Promise<AgentResult> {
    const skill = params.skill ? this.skills.get(params.skill) : null
    const maxTurns = params.maxTurns || this.config.maxTurns || 10

    // 构建工具列表
    const availableToolNames =
      params.tools || skill?.tools.map((t) => t.name) || Array.from(this.executors.keys())
    const toolDefinitions = availableToolNames
      .map((name) => this.executors.get(name)?.tool)
      .filter(Boolean)
      .map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool!.name,
          description: tool!.description,
          parameters: tool!.parameters,
        },
      }))

    // 构建消息
    const messages: Message[] = []
    if (skill) {
      messages.push({ role: 'system', content: skill.systemPrompt })
    }
    messages.push({ role: 'user', content: params.prompt })

    const toolCallResults: AgentResult['toolCalls'] = []

    // Agent 循环
    for (let turn = 0; turn < maxTurns; turn++) {
      const result = await this.adapter.chat({
        messages,
        tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
      })

      // 处理工具调用
      if (result.tool_calls && result.tool_calls.length > 0) {
        // 添加 assistant 消息（带 tool_calls）
        messages.push({
          role: 'assistant',
          content: result.content || null,
          tool_calls: result.tool_calls,
        })

        // 执行每个工具调用
        for (const tc of result.tool_calls) {
          const executor = this.executors.get(tc.function.name)
          let toolResult: unknown = null

          if (executor) {
            try {
              const args = JSON.parse(tc.function.arguments)
              toolResult = await executor.execute(args)
              toolCallResults.push({
                name: tc.function.name,
                args,
                result: toolResult,
              })
            } catch (error) {
              toolResult = { error: error instanceof Error ? error.message : String(error) }
              toolCallResults.push({
                name: tc.function.name,
                args: JSON.parse(tc.function.arguments),
                result: toolResult,
              })
            }
          } else {
            toolResult = { error: `Tool '${tc.function.name}' not found` }
          }

          // 添加 tool 结果消息
          messages.push({
            role: 'tool',
            content: JSON.stringify(toolResult),
            tool_call_id: tc.id,
          })
        }
      } else {
        // 无工具调用，返回最终结果
        return {
          content: result.content || '',
          toolCalls: toolCallResults,
          turns: turn + 1,
        }
      }
    }

    // 达到最大轮次
    return {
      content: messages[messages.length - 1]?.content || '',
      toolCalls: toolCallResults,
      turns: maxTurns,
    }
  }
}
