import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { eq } from '@xartifact/x-herald-db'

import { getDatabase } from '../db/client'
import { modelInstances } from '../db'

import { openaiChatCompletion } from '../test/mock-upstream'
import { createProxyTestEnv } from '../test/proxy-test-helpers'
import type { ProxyTestEnv } from '../test/proxy-test-helpers'

interface ErrorBody {
  error: { type: string; message: string }
}

/**
 * 四个协议互相独立：入站协议必须和 provider 启用的协议一致，网关不做跨协议转换。
 * 这里的 provider 只启用 openai，所以 openai / responses 可用，anthropic 不可用。
 */
describe('inbound protocol must match the provider protocol', () => {
  let env: ProxyTestEnv

  beforeAll(async () => {
    env = await createProxyTestEnv({ protocol: 'openai', accessModelName: 'Plan' })
  })

  afterAll(async () => {
    await env.close()
  })

  it('serves chat completions from an openai-enabled provider', async () => {
    env.upstream.setResponse(200, openaiChatCompletion({ content: 'ok' }))
    const res = await env.proxyChat({ model: 'Plan', messages: [{ role: 'user', content: 'hi' }] })
    expect(res.status).toBe(200)
  })

  it('serves the responses protocol from the same openai-enabled provider', async () => {
    env.upstream.setResponse(200, { id: 'resp_1', object: 'response', output: [] })
    const res = await env.proxyResponses({
      model: 'Plan',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
    })
    expect(res.status).toBe(200)
  })

  it('rejects an anthropic request with 400 protocol_error instead of converting it', async () => {
    env.upstream.clearRequests()
    const res = await env.proxyMessages({
      model: 'Plan',
      max_tokens: 16,
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as ErrorBody
    expect(body.error.type).toBe('protocol_error')
    expect(body.error.message).toContain("protocol 'anthropic'")
    // 没有任何请求被转发到上游
    expect(env.upstream.receivedRequests).toHaveLength(0)
  })
})

/**
 * 协议不匹配是「配置问题」(400)；只要还有别的过滤原因（熔断/状态 down 等暂时性问题），
 * 就不能把整件事报成协议错误，否则运维会去改 provider 配置而不是看实例健康。
 */
describe('protocol mismatch mixed with other filter reasons', () => {
  let env: ProxyTestEnv

  beforeAll(async () => {
    env = await createProxyTestEnv({ protocol: 'openai', accessModelName: 'Plan' })
    await getDatabase()
      .update(modelInstances)
      .set({ status: 'down' })
      .where(eq(modelInstances.id, env.instanceId))
  })

  afterAll(async () => {
    await env.close()
  })

  it('stays 503 service_unavailable when the only matching instance is down', async () => {
    // anthropic 入站：该实例既协议不匹配，又 status=down —— 先命中 down，原因不全是协议
    const res = await env.proxyMessages({
      model: 'Plan',
      max_tokens: 16,
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(res.status).toBe(503)
    const body = (await res.json()) as ErrorBody
    expect(body.error.type).toBe('service_unavailable')
  })
})
