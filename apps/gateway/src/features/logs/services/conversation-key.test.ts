import { describe, it, expect, beforeAll, afterAll } from 'bun:test'

import { createProxyTestEnv } from '../../../test/proxy-test-helpers'
import type { ProxyTestEnv } from '../../../test/proxy-test-helpers'
import { openaiChatCompletion } from '../../../test/mock-upstream'
import { getDatabase } from '../../../db/client'
import { requestLogs } from '../../../db'
import { and, eq } from '@xartifact/x-herald-db'
import { getConversationTrace } from './log-query'
import { splitConversationId } from '../../../gateway/services/content-extractor'

/**
 * 会话标识可以是任意字符串（`x-conversation-id` 等由客户端自由取值），
 * 而 `request_logs.conversation_id` 是 uuid 列。
 *
 * 回归背景：把 `sess-abc123` 写进 uuid 列会让整条 INSERT 抛
 * `invalid input syntax for type uuid`，请求日志、request_attempts 与
 * cost_records 一起丢失 —— 丢的恰好是需要审计的多轮会话。
 */
describe('conversation key / non-uuid session identifiers', () => {
  let env: ProxyTestEnv

  beforeAll(async () => {
    env = await createProxyTestEnv({ protocol: 'openai' })
  })

  afterAll(async () => {
    await env.close()
  })

  it('splits uuid and free-form identifiers into the right columns', () => {
    const uuid = '3f1c2b4a-5d6e-4f70-8a91-b2c3d4e5f607'
    expect(splitConversationId(uuid)).toEqual({ conversationId: uuid, conversationKey: uuid })

    expect(splitConversationId('sess-abc123')).toEqual({ conversationKey: 'sess-abc123' })
    expect(splitConversationId('')).toEqual({})
    expect(splitConversationId(undefined)).toEqual({})

    // 超长标识被截断到列宽，而不是让写入失败
    const long = 'x'.repeat(400)
    expect(splitConversationId(long).conversationKey).toHaveLength(255)
  })

  it('persists a request whose session id is not a uuid', async () => {
    env.upstream.setResponse(200, openaiChatCompletion({ content: 'ok' }))
    const sessionId = `sess-${crypto.randomUUID().slice(0, 8)}`

    const res = await env.proxyChat(
      {
        model: env.accessModelName,
        messages: [{ role: 'user', content: 'hello' }],
      },
      { 'x-conversation-id': sessionId },
    )
    expect(res.status).toBe(200)

    // 日志必须真的落库（回归点：此前这里会抛 uuid 语法错误，整条丢失）
    const db = getDatabase()
    const rows = await db
      .select()
      .from(requestLogs)
      .where(eq(requestLogs.conversationKey, sessionId))
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('success')
    // 非 uuid 值不写 uuid 列
    expect(rows[0].conversationId).toBeNull()
  })

  it('traces a conversation by its free-form key', async () => {
    const sessionId = `sess-trace-${crypto.randomUUID().slice(0, 8)}`
    env.upstream.setResponse(200, openaiChatCompletion({ content: 'turn 1' }))
    await env.proxyChat(
      { model: env.accessModelName, messages: [{ role: 'user', content: 'one' }] },
      { 'x-conversation-id': sessionId },
    )
    env.upstream.setResponse(200, openaiChatCompletion({ content: 'turn 2' }))
    await env.proxyChat(
      { model: env.accessModelName, messages: [{ role: 'user', content: 'two' }] },
      { 'x-conversation-id': sessionId },
    )

    const trace = await getConversationTrace(sessionId)
    expect(trace.length).toBe(2)
  })

  it('still accepts a uuid session id and writes both columns', async () => {
    const uuid = crypto.randomUUID()
    env.upstream.setResponse(200, openaiChatCompletion({ content: 'uuid session' }))
    const res = await env.proxyChat(
      { model: env.accessModelName, messages: [{ role: 'user', content: 'hi' }] },
      { 'x-conversation-id': uuid },
    )
    expect(res.status).toBe(200)

    const db = getDatabase()
    const [row] = await db
      .select()
      .from(requestLogs)
      .where(and(eq(requestLogs.conversationId, uuid), eq(requestLogs.conversationKey, uuid)))
    expect(row).toBeTruthy()
  })
})
