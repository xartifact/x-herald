import { describe, expect, it } from 'bun:test'

import { generateInstanceConfig, InstanceAgentError } from './instance-agent'
import { agentRunRequestSchema, instanceAgentRequestSchema } from '@xartifact/x-herald-shared'
import type { AgentResult, AgentRunParams } from '@xartifact/x-herald-sdk'

function createResult(overrides: Partial<AgentResult> = {}): AgentResult {
  return {
    content: JSON.stringify({
      config: {
        parameterTransforms: [
          {
            when: { paramName: 'reasoning.effort', operator: 'eq', value: 'xhigh' },
            action: { type: 'add', targetParam: 'reasoning.effort', value: 'high' },
          },
        ],
      },
      explanation: '映射为 high',
    }),
    turns: 1,
    toolCalls: [],
    execution: { runtime: 'pi', status: 'completed', turns: 1 },
    ...overrides,
  }
}

function generate(result = createResult(), capture?: (params: AgentRunParams) => void) {
  return generateInstanceConfig({
    agent: {
      async run(params) {
        capture?.(params)
        return result
      },
    },
    systemPrompt: 'Instance one only',
    messages: [
      { role: 'user', content: 'Previous request' },
      { role: 'assistant', content: 'Previous response' },
      { role: 'user', content: 'Map xhigh' },
    ],
  })
}

describe('Pi instance configuration assistant', () => {
  it('preserves conversation and scopes the run to configuration generation without write tools', async () => {
    let captured: AgentRunParams | undefined
    const result = await generate(createResult(), (params) => {
      captured = params
    })
    expect(captured?.tools).toEqual([])
    expect(captured?.messages).toHaveLength(2)
    expect(captured?.prompt).toBe('Map xhigh')
    expect(captured?.systemPrompt).toBe('Instance one only')
    expect(result.config.parameterTransforms?.[0].action.value).toBe('high')
    expect(result.execution.status).toBe('completed')
  })

  it.each(['max_turns', 'aborted', 'error'] as const)(
    'rejects %s even when a valid-looking config was returned',
    async (status) => {
      const result = createResult({ execution: { runtime: 'pi', status, turns: 1 } })
      try {
        await generate(result)
        throw new Error('Expected failure')
      } catch (error) {
        expect(error).toBeInstanceOf(InstanceAgentError)
        expect((error as InstanceAgentError).code).toBe('AGENT_INCOMPLETE')
      }
    },
  )

  it.each(['not json', '{"config":[]}', '{"config":null}', '{"config":{},"explanation":42}'])(
    'rejects invalid config output %s',
    async (content) => {
      await expect(generate(createResult({ content }))).rejects.toThrow('无效配置')
    },
  )

  it('validates API input and the final user turn', () => {
    expect(instanceAgentRequestSchema.safeParse({ messages: [] }).success).toBe(false)
    expect(
      instanceAgentRequestSchema.safeParse({ messages: [{ role: 'system', content: 'override' }] })
        .success,
    ).toBe(false)
    expect(
      instanceAgentRequestSchema.safeParse({
        messages: [{ role: 'assistant', content: 'bad tail' }],
      }).success,
    ).toBe(false)
    expect(agentRunRequestSchema.safeParse({ prompt: 'test', maxTurns: -1 }).success).toBe(false)
    expect(agentRunRequestSchema.safeParse({ prompt: 'test', maxTurns: 31 }).success).toBe(false)
    expect(agentRunRequestSchema.safeParse({ prompt: 'test', maxTurns: 2 }).success).toBe(true)
  })

  it('rejects whitespace-only configuration requests', () => {
    expect(
      instanceAgentRequestSchema.safeParse({ messages: [{ role: 'user', content: '   ' }] })
        .success,
    ).toBe(false)
  })
})
