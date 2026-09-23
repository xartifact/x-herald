import { afterEach, describe, expect, it } from 'bun:test'

import { Agent } from './agent'
import { createOpenAIAdapter } from './openai-adapter'

import type { AgentConfig, ToolExecutor } from './types'

type RequestBody = {
  messages: Array<Record<string, unknown>>
  tools?: Array<{ function: { name: string } }>
  [key: string]: unknown
}
const servers: Array<ReturnType<typeof Bun.serve>> = []
afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true)
})

function sse(delta: Record<string, unknown>, finishReason = 'stop') {
  return Response.json({
    id: 'chat-test',
    object: 'chat.completion',
    created: 1,
    model: 'test-model',
    choices: [{ index: 0, message: delta, finish_reason: finishReason }],
  })
}

function messageText(message: Record<string, unknown> | undefined): string {
  const content = message?.content
  return typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map((block) => block.text ?? '').join('')
      : ''
}

function toolResponse(name: string, args: string) {
  return sse(
    {
      content: null,
      tool_calls: [{ id: 'call-test', type: 'function', function: { name, arguments: args } }],
    },
    'tool_calls',
  )
}

function createEnv(
  reply: (body: RequestBody, turn: number) => Response | Promise<Response>,
  config?: AgentConfig,
  apiKey: string | null = 'test-key',
) {
  const requests: RequestBody[] = []
  const requestHeaders: Headers[] = []
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const body = (await req.json()) as RequestBody
      requests.push(body)
      requestHeaders.push(req.headers)
      return reply(body, requests.length)
    },
  })
  servers.push(server)
  const adapter = createOpenAIAdapter(async () => ({
    actualModelName: 'test-model',
    baseUrl: `${server.url}v1`,
    apiKey,
  }))
  return { agent: new Agent(adapter, config), requests, requestHeaders }
}

function createTool(execute: ToolExecutor['execute'], name = 'get_config'): ToolExecutor {
  return {
    tool: {
      name,
      description: 'Read config',
      parameters: {
        type: 'object',
        properties: { instanceId: { type: 'string' } },
        required: ['instanceId'],
      },
    },
    execute,
  }
}

describe('Pi Agent with OpenAI-compatible upstream', () => {
  it('executes a validated tool and returns the final answer with lifecycle events', async () => {
    const { agent, requests } = createEnv((_body, turn) =>
      turn === 1
        ? toolResponse('get_config', '{"instanceId":"one"}')
        : sse({ content: 'Use high.' }),
    )
    agent.registerExecutor(
      createTool(async (args) => ({ instance: args.instanceId, effort: 'high' })),
    )
    const events: string[] = []
    const result = await agent.run({
      prompt: 'Inspect instance',
      onEvent: (event) => events.push(event.type),
    })
    expect(result.content).toBe('Use high.')
    expect(result.execution).toEqual({ runtime: 'pi', status: 'completed', turns: 2 })
    expect(result.toolCalls).toEqual([
      {
        name: 'get_config',
        args: { instanceId: 'one' },
        result: { instance: 'one', effort: 'high' },
      },
    ])
    expect(events).toContain('tool_execution_end')
    expect(requests[1].messages.some((message) => message.role === 'tool')).toBe(true)
  })

  it('does not execute registered tools excluded from the run whitelist', async () => {
    let writes = 0
    const { agent } = createEnv((_body, turn) =>
      turn === 1
        ? toolResponse('apply_fix', '{"instanceId":"one"}')
        : sse({ content: 'Cannot write.' }),
    )
    agent.registerExecutor(
      createTool(async () => {
        writes++
        return {}
      }, 'apply_fix'),
    )
    const result = await agent.run({ prompt: 'Inspect only', tools: [] })
    expect(writes).toBe(0)
    expect(result.toolCalls[0].result).toHaveProperty('error')
  })

  it('rejects invalid tool arguments before invoking the executor', async () => {
    let calls = 0
    const { agent } = createEnv((_body, turn) =>
      turn === 1 ? toolResponse('get_config', '{}') : sse({ content: 'Missing ID.' }),
    )
    agent.registerExecutor(
      createTool(async () => {
        calls++
        return {}
      }),
    )
    const result = await agent.run({ prompt: 'Inspect' })
    expect(calls).toBe(0)
    expect(result.toolCalls[0].result).toHaveProperty('error')
  })

  it('feeds tool failures back into the loop for recovery', async () => {
    const { agent } = createEnv((_body, turn) =>
      turn === 1
        ? toolResponse('get_config', '{"instanceId":"missing"}')
        : sse({ content: 'Instance missing.' }),
    )
    agent.registerExecutor(
      createTool(async () => {
        throw new Error('Instance not found')
      }),
    )
    const result = await agent.run({ prompt: 'Inspect' })
    expect(result.toolCalls[0].result).toEqual({ error: 'Instance not found' })
    expect(result.content).toBe('Instance missing.')
  })

  it('stops at maxTurns without reporting a tool result as a final answer', async () => {
    const { agent, requests } = createEnv(() => toolResponse('get_config', '{"instanceId":"one"}'))
    agent.registerExecutor(createTool(async () => ({ success: true })))
    const result = await agent.run({ prompt: 'Inspect', maxTurns: 2 })
    expect(requests).toHaveLength(2)
    expect(result.execution.status).toBe('max_turns')
    expect(result.content).toBe('')
  })

  it('reports upstream errors and truncated answers as failures', async () => {
    const error = createEnv(() =>
      Response.json({ error: { message: 'Invalid parameters' } }, { status: 400 }),
    )
    expect((await error.agent.run({ prompt: 'Inspect' })).execution.status).toBe('error')
    const truncated = createEnv(() => sse({ content: '{"config":' }, 'length'))
    expect((await truncated.agent.run({ prompt: 'Inspect' })).execution.status).toBe('error')
  })

  it('isolates concurrent runs and preserves chat history and the system prompt', async () => {
    const { agent, requests } = createEnv((body) =>
      sse({ content: messageText(body.messages.at(-1)) }),
    )
    const [a, b] = await Promise.all([
      agent.run({
        prompt: 'A',
        systemPrompt: 'Config expert',
        messages: [
          { role: 'user', content: 'Previous' },
          { role: 'assistant', content: 'Noted' },
        ],
      }),
      agent.run({ prompt: 'B' }),
    ])
    expect(a.content).toBe('A')
    expect(b.content).toBe('B')
    const aRequest = requests.find((r) => messageText(r.messages.at(-1)) === 'A')!
    const bRequest = requests.find((r) => messageText(r.messages.at(-1)) === 'B')!
    expect(
      aRequest.messages.some((m) => m.role === 'system' && messageText(m) === 'Config expert'),
    ).toBe(true)
    expect(aRequest.messages.some((m) => messageText(m) === 'Previous')).toBe(true)
    expect(
      bRequest.messages.some((m) => messageText(m) === 'Previous' || messageText(m) === 'A'),
    ).toBe(false)
  })

  it('supports cancellation and rejects invalid runs before contacting the provider', async () => {
    const { agent, requests } = createEnv(() => sse({ content: 'Never' }))
    await expect(agent.run({ prompt: 'Inspect', maxTurns: 0 })).rejects.toThrow('maxTurns')
    await expect(agent.run({ prompt: 'Inspect', tools: ['missing'] })).rejects.toThrow(
      'Unknown tool',
    )
    await expect(agent.run({ prompt: 'Inspect', skill: 'missing' })).rejects.toThrow(
      'Unknown skill',
    )
    await expect(agent.run({ prompt: 'Inspect', signal: AbortSignal.abort() })).rejects.toThrow()
    expect(requests).toHaveLength(0)
  })

  it('aborts an active run before executing subsequent tools', async () => {
    const controller = new AbortController()
    let calls = 0
    const { agent } = createEnv(() => toolResponse('get_config', '{"instanceId":"one"}'))
    agent.registerExecutor(
      createTool(async () => {
        calls++
        return {}
      }),
    )
    const result = await agent.run({
      prompt: 'Inspect',
      signal: controller.signal,
      onEvent: (event) => {
        if (event.type === 'message_end' && event.message.role === 'assistant') controller.abort()
      },
    })
    expect(result.execution.status).toBe('aborted')
    expect(calls).toBe(0)
  })
  it('supports a keyless nonstreaming OpenAI-compatible provider', async () => {
    const { agent, requests, requestHeaders } = createEnv(
      () =>
        Response.json({
          choices: [{ finish_reason: 'stop', message: { content: 'Keyless response.' } }],
        }),
      undefined,
      null,
    )

    const result = await agent.run({ prompt: 'Inspect' })

    expect(result.content).toBe('Keyless response.')
    expect(requestHeaders[0].get('authorization')).toBeNull()
    expect(requests[0].stream).toBe(false)
    expect(requests[0].max_tokens).toBe(2048)
    expect(requests[0].stream_options).toBeUndefined()
  })
})
