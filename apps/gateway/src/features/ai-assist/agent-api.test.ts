import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test'

import { getAgent } from './agent-setup'
import {
  authGet,
  authPost,
  parseJson,
  setupCrudTest,
  teardownCrudTest,
  uniqueName,
} from '../../test/crud-helper'

import type { CrudTestContext } from '../../test/crud-helper'
import type { AgentResult } from '@xartifact/x-herald-sdk'

let ctx: CrudTestContext
let instanceId: string
let run: ReturnType<typeof spyOn>

function result(status: AgentResult['execution']['status'] = 'completed'): AgentResult {
  return {
    content: JSON.stringify({
      config: { requestInject: { thinking: { type: 'enabled' } } },
      explanation: '已更新',
    }),
    toolCalls: [],
    turns: 1,
    execution: { runtime: 'pi', status, turns: 1 },
  }
}

beforeAll(async () => {
  ctx = await setupCrudTest()
  const provider = await parseJson<{ id: string }>(
    await authPost(ctx, '/api/providers', {
      name: uniqueName('Pi'),
      protocols: { openai: { baseUrl: 'https://example.com/v1', enabled: true } },
    }),
  )
  const instance = await parseJson<{ id: string }>(
    await authPost(ctx, '/api/model-groups/instances', {
      name: uniqueName('Pi-model'),
      actualModelName: 'test',
      providerId: provider.body.data.id,
      config: { requestInject: { original: true } },
    }),
  )
  instanceId = instance.body.data.id
  run = spyOn(getAgent(), 'run')
})

afterAll(async () => {
  run?.mockRestore()
  await teardownCrudTest()
})

async function readConfig() {
  const response = await authGet(ctx, '/api/model-groups/instances')
  const { body } = await parseJson<Array<{ id: string; config: unknown }>>(response)
  return body.data.find((instance) => instance.id === instanceId)?.config
}

describe('Pi agent management API', () => {
  it('rejects invalid run limits before starting Pi', async () => {
    run.mockClear()
    const response = await authPost(ctx, '/api/ai/agent/run', { prompt: 'test', maxTurns: 0 })
    expect(response.status).toBe(400)
    expect(run).not.toHaveBeenCalled()
  })

  it('reports an incomplete general agent run as unsuccessful', async () => {
    run.mockResolvedValueOnce(result('max_turns'))
    const response = await authPost(ctx, '/api/ai/agent/run', { prompt: 'test' })
    expect(response.status).toBe(422)
    expect((await response.json()).success).toBe(false)
  })

  it('does not save valid-looking configuration from a failed Pi run', async () => {
    run.mockResolvedValueOnce(result('error'))
    const previous = await readConfig()
    const response = await authPost(ctx, `/api/ai/agent/instance/${instanceId}`, {
      messages: [{ role: 'user', content: 'Enable thinking' }],
    })
    expect(response.status).toBe(422)
    expect(await readConfig()).toEqual(previous)
  })

  it('saves a completed configuration and supports undo', async () => {
    run.mockResolvedValueOnce(result())
    const previous = await readConfig()
    const response = await authPost(ctx, `/api/ai/agent/instance/${instanceId}`, {
      messages: [{ role: 'user', content: 'Enable thinking' }],
    })
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.data.execution.runtime).toBe('pi')
    expect(body.data.previousConfig).toEqual(previous)
    expect(await readConfig()).toEqual({ requestInject: { thinking: { type: 'enabled' } } })
    const undo = await authPost(ctx, `/api/ai/agent/instance/${instanceId}/undo`, {
      previousConfig: previous,
    })
    expect(undo.status).toBe(200)
    expect(await readConfig()).toEqual(previous)
  })
})
