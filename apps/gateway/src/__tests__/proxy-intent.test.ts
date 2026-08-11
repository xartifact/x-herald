/**
 * E2E Integration Test — Intent Routing
 *
 * Two test suites:
 * 1. Mock classifier — deterministic, verifies routing logic for each category
 * 2. Real llama.cpp classifier — smoke test, verifies end-to-end flow + logs actual behavior
 *
 * Prerequisite for suite 2: LLAMA_CPP_SMOKE=true + llama.cpp server at http://100.108.156.20:8081
 * Model: Qwythos-9B-Claude-Mythos-5-1M-MTP-BF16.gguf
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import type { Hono } from 'hono'

import { createMockUpstream, openaiChatCompletion, type MockUpstream } from '../test/mock-upstream'
import { createTestEngine, destroyTestEngine } from '../test/setup'
import { seedCanvasRoute } from '../test/canvas-route-helper'
import { getDatabase } from '../db/client'
import { invalidateVirtualKeyCache } from '../middleware/virtual-key'
import {
  providers,
  modelGroups,
  modelInstances,
  modelGroupMemberships,
  accessModels,
  virtualKeys,
  intentLogs,
} from '../db'

const LLAMA_CPP_BASE_URL = 'http://100.108.156.20:8081/v1'
const LLAMA_CPP_MODEL = 'Qwythos-9B-Claude-Mythos-5-1M-MTP-BF16.gguf'

const DEFAULT_CAPABILITIES = {
  streaming: true,
  functionCalling: true,
  vision: false,
  jsonMode: true,
  maxTokens: 8192,
  contextWindow: 128000,
}

interface IntentTestEnv {
  app: Hono
  upstream: MockUpstream
  classifierUpstream?: MockUpstream
  virtualKey: string
  accessModelName: string
  codingActualModel: string
  generalActualModel: string
}

async function setupIntentTestEnv(opts: {
  classifierBaseUrl: string
  classifierApiKey?: string | null
  useMockClassifier?: boolean
}): Promise<IntentTestEnv> {
  process.env.GATEWAY_SAME_PROTOCOL_PASSTHROUGH = 'true'

  const upstream = createMockUpstream()
  let classifierUpstream: MockUpstream | undefined
  const engine = await createTestEngine()
  const db = getDatabase()

  const classifierBaseUrl = opts.useMockClassifier
    ? (classifierUpstream = createMockUpstream()).url
    : opts.classifierBaseUrl

  const [classifierProvider] = await db
    .insert(providers)
    .values({
      name: opts.useMockClassifier ? 'mock-classifier' : 'llama-cpp-classifier',
      apiKey: opts.classifierApiKey ?? null,
      protocols: { openai: { baseUrl: classifierBaseUrl, enabled: true } },
      enabled: true,
    })
    .returning()

  const [chatProvider] = await db
    .insert(providers)
    .values({
      name: 'chat-target',
      apiKey: 'sk-test-chat',
      protocols: { openai: { baseUrl: upstream.url, enabled: true } },
      enabled: true,
    })
    .returning()

  const codingActualModel = 'gpt-4-coding'
  const [codingGroup] = await db
    .insert(modelGroups)
    .values({
      name: 'intent-coding-group',
      displayName: 'Coding',
      capabilities: DEFAULT_CAPABILITIES,
      supportedProtocols: ['openai'],
      enabled: true,
    })
    .returning()

  const [codingInstance] = await db
    .insert(modelInstances)
    .values({
      providerId: chatProvider.id,
      name: 'coding-instance',
      actualModelName: codingActualModel,
      weight: 100,
      priority: 0,
      enabled: true,
    })
    .returning()

  await db.insert(modelGroupMemberships).values({
    groupId: codingGroup.id,
    instanceId: codingInstance.id,
  })

  const generalActualModel = 'gpt-4-general'
  const [generalGroup] = await db
    .insert(modelGroups)
    .values({
      name: 'intent-general-group',
      displayName: 'General',
      capabilities: DEFAULT_CAPABILITIES,
      supportedProtocols: ['openai'],
      enabled: true,
    })
    .returning()

  const [generalInstance] = await db
    .insert(modelInstances)
    .values({
      providerId: chatProvider.id,
      name: 'general-instance',
      actualModelName: generalActualModel,
      weight: 100,
      priority: 0,
      enabled: true,
    })
    .returning()

  await db.insert(modelGroupMemberships).values({
    groupId: generalGroup.id,
    instanceId: generalInstance.id,
  })

  const accessModelName = 'my-assistant'
  const [am] = await db
    .insert(accessModels)
    .values({
      name: accessModelName,
      displayName: 'My Assistant',
      enabled: true,
      capabilities: DEFAULT_CAPABILITIES,
    })
    .returning()

  await seedCanvasRoute({
    amId: am.id,
    amName: 'intent-classifier-route',
    action: {
      type: 'intent',
      intentConfig: {
        targetGroupIds: {
          coding: codingGroup.id,
          general: generalGroup.id,
        },
        defaultGroupId: generalGroup.id,
        classifier: {
          providerId: classifierProvider.id,
          modelName: opts.useMockClassifier ? 'mock-classifier-model' : LLAMA_CPP_MODEL,
          categories: ['coding', 'general'],
        },
      },
    },
  })

  const virtualKey = 'xg_intent_' + crypto.randomUUID().slice(0, 12)
  await db.insert(virtualKeys).values({
    key: virtualKey,
    name: 'intent-test-key',
    enabled: true,
    allowedModels: null,
    rateLimitRpm: null,
    rateLimitRpd: null,
    tokenLimitDaily: null,
    expiresAt: null,
    lastUsedAt: null,
    totalRequests: 0,
    totalTokens: 0n,
  })

  return {
    app: engine.app,
    upstream,
    classifierUpstream,
    virtualKey,
    accessModelName,
    codingActualModel,
    generalActualModel,
  }
}

function authHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

// ─── Suite 1: Mock Classifier (deterministic) ──────────────────────────────

describe('Intent routing — mock classifier (deterministic)', () => {
  let env: IntentTestEnv

  beforeAll(async () => {
    env = await setupIntentTestEnv({
      classifierBaseUrl: '',
      useMockClassifier: true,
    })
  }, 60000)

  afterAll(async () => {
    invalidateVirtualKeyCache(env.virtualKey)
    env.upstream.close()
    env.classifierUpstream?.close()
    delete process.env.GATEWAY_SAME_PROTOCOL_PASSTHROUGH
    await destroyTestEngine()
  })

  it('routes to coding-group when classifier returns "coding"', async () => {
    env.classifierUpstream!.setResponse(200, {
      choices: [{ message: { content: 'coding' } }],
    })
    env.upstream.setResponse(200, openaiChatCompletion({ content: 'Here is your code' }))
    env.upstream.clearRequests()

    const res = await env.app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: authHeaders(env.virtualKey),
      body: JSON.stringify({
        model: env.accessModelName,
        messages: [{ role: 'user', content: 'Write a Python function' }],
      }),
    })

    expect(res.status).toBe(200)
    expect(env.upstream.receivedRequests.length).toBeGreaterThan(0)
    const routedModel = (env.upstream.lastRequest().body as { model: string }).model
    expect(routedModel).toBe(env.codingActualModel)
  })

  it('routes to general-group when classifier returns "general"', async () => {
    env.classifierUpstream!.setResponse(200, {
      choices: [{ message: { content: 'general' } }],
    })
    env.upstream.setResponse(200, openaiChatCompletion({ content: 'Paris' }))
    env.upstream.clearRequests()

    const res = await env.app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: authHeaders(env.virtualKey),
      body: JSON.stringify({
        model: env.accessModelName,
        messages: [{ role: 'user', content: 'What is the capital of France?' }],
      }),
    })

    expect(res.status).toBe(200)
    expect(env.upstream.receivedRequests.length).toBeGreaterThan(0)
    const routedModel = (env.upstream.lastRequest().body as { model: string }).model
    expect(routedModel).toBe(env.generalActualModel)
  })

  it('falls back to default group when classifier returns unknown text', async () => {
    env.classifierUpstream!.setResponse(200, {
      choices: [{ message: { content: 'I do not understand' } }],
    })
    env.upstream.setResponse(200, openaiChatCompletion({ content: 'OK' }))
    env.upstream.clearRequests()

    const res = await env.app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: authHeaders(env.virtualKey),
      body: JSON.stringify({
        model: env.accessModelName,
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    })

    expect(res.status).toBe(200)
    expect(env.upstream.receivedRequests.length).toBeGreaterThan(0)
    const routedModel = (env.upstream.lastRequest().body as { model: string }).model
    expect(routedModel).toBe(env.generalActualModel)
  })

  it('extracts category from reasoning_content when content is empty', async () => {
    env.classifierUpstream!.setResponse(200, {
      choices: [
        {
          message: {
            content: '',
            reasoning_content: 'The user is asking about programming. This is coding related.',
          },
        },
      ],
    })
    env.upstream.setResponse(200, openaiChatCompletion({ content: 'Code' }))
    env.upstream.clearRequests()

    const res = await env.app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: authHeaders(env.virtualKey),
      body: JSON.stringify({
        model: env.accessModelName,
        messages: [{ role: 'user', content: 'Write code' }],
      }),
    })

    expect(res.status).toBe(200)
    const routedModel = (env.upstream.lastRequest().body as { model: string }).model
    expect(routedModel).toBe(env.codingActualModel)
  })

  it('falls back to default when classifier returns HTTP error', async () => {
    env.classifierUpstream!.setResponse(500, { error: 'Internal error' })
    env.upstream.setResponse(200, openaiChatCompletion({ content: 'OK' }))
    env.upstream.clearRequests()

    const res = await env.app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: authHeaders(env.virtualKey),
      body: JSON.stringify({
        model: env.accessModelName,
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    })

    expect(res.status).toBe(200)
    const routedModel = (env.upstream.lastRequest().body as { model: string }).model
    expect(routedModel).toBe(env.generalActualModel)
  })

  it('parses JSON response with category+confidence fields (tier 1)', async () => {
    env.classifierUpstream!.setResponse(200, {
      choices: [{ message: { content: '{"category":"coding","confidence":0.92}' } }],
    })
    env.upstream.setResponse(200, openaiChatCompletion({ content: 'OK' }))
    env.upstream.clearRequests()
    env.classifierUpstream!.clearRequests()

    const res = await env.app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: authHeaders(env.virtualKey),
      body: JSON.stringify({
        model: env.accessModelName,
        messages: [{ role: 'user', content: 'Write a quicksort in Python' }],
      }),
    })

    expect(res.status).toBe(200)
    const routedModel = (env.upstream.lastRequest().body as { model: string }).model
    expect(routedModel).toBe(env.codingActualModel)
  })

  it('parses markdown-fenced JSON via jsonrepair (tier 2)', async () => {
    env.classifierUpstream!.setResponse(200, {
      choices: [{ message: { content: '```json\n{"category":"general","confidence":0.81}\n```' } }],
    })
    env.upstream.setResponse(200, openaiChatCompletion({ content: 'OK' }))
    env.upstream.clearRequests()
    env.classifierUpstream!.clearRequests()

    const res = await env.app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: authHeaders(env.virtualKey),
      body: JSON.stringify({
        model: env.accessModelName,
        messages: [{ role: 'user', content: 'Tell me a joke' }],
      }),
    })

    expect(res.status).toBe(200)
    const routedModel = (env.upstream.lastRequest().body as { model: string }).model
    expect(routedModel).toBe(env.generalActualModel)
  })

  it('parses prose-wrapped JSON via jsonrepair (tier 2)', async () => {
    env.classifierUpstream!.setResponse(200, {
      choices: [
        {
          message: {
            content: 'Sure! Here is the classification: {"category":"coding","confidence":0.95}',
          },
        },
      ],
    })
    env.upstream.setResponse(200, openaiChatCompletion({ content: 'OK' }))
    env.upstream.clearRequests()
    env.classifierUpstream!.clearRequests()

    const res = await env.app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: authHeaders(env.virtualKey),
      body: JSON.stringify({
        model: env.accessModelName,
        messages: [{ role: 'user', content: 'Build a REST API' }],
      }),
    })

    expect(res.status).toBe(200)
    const routedModel = (env.upstream.lastRequest().body as { model: string }).model
    expect(routedModel).toBe(env.codingActualModel)
  })

  it('ignores system-reminder noise in user message and routes by real query', async () => {
    env.classifierUpstream!.setResponse(200, {
      choices: [{ message: { content: '{"category":"coding","confidence":0.88}' } }],
    })
    env.upstream.setResponse(200, openaiChatCompletion({ content: 'OK' }))
    env.upstream.clearRequests()
    env.classifierUpstream!.clearRequests()

    const pollutedUserMessage =
      '<system-reminder>\nThe task is complete. Notify the user.\n</system-reminder>\n\nWrite a Python function to sort a list'
    const res = await env.app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: authHeaders(env.virtualKey),
      body: JSON.stringify({
        model: env.accessModelName,
        messages: [{ role: 'user', content: pollutedUserMessage }],
      }),
    })

    expect(res.status).toBe(200)
    const classifierRequest = env.classifierUpstream!.lastRequest()
    const classifierMessages = (
      classifierRequest.body as { messages: Array<{ role: string; content: string }> }
    ).messages
    const nonSystemMessages = classifierMessages.filter((m) => m.role !== 'system')
    const systemReminderStillInPayload = nonSystemMessages.some((m) =>
      m.content.includes('<system-reminder>'),
    )
    expect(systemReminderStillInPayload).toBe(false)
    const realQueryStillInPayload = nonSystemMessages.some((m) =>
      m.content.includes('Write a Python function to sort a list'),
    )
    expect(realQueryStillInPayload).toBe(true)

    const routedModel = (env.upstream.lastRequest().body as { model: string }).model
    expect(routedModel).toBe(env.codingActualModel)
  })

  it('routes [BACKGROUND TASK] message as agent_directive without calling classifier', async () => {
    env.classifierUpstream!.setResponse(200, {
      choices: [{ message: { content: '{"category":"general","confidence":0.9}' } }],
    })
    env.upstream.setResponse(200, openaiChatCompletion({ content: 'OK' }))
    env.upstream.clearRequests()
    env.classifierUpstream!.clearRequests()

    const res = await env.app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: authHeaders(env.virtualKey),
      body: JSON.stringify({
        model: env.accessModelName,
        messages: [
          { role: 'user', content: 'What is the capital of France?' },
          { role: 'assistant', content: 'Paris.' },
          {
            role: 'user',
            content: '[BACKGROUND TASK COMPLETED] ok\n\nTell me a fun fact about Paris',
          },
        ],
      }),
    })

    expect(res.status).toBe(200)
    expect(env.classifierUpstream!.receivedRequests.length).toBe(0)
    const routedModel = (env.upstream.lastRequest().body as { model: string }).model
    expect(routedModel).toBe(env.generalActualModel)
  })

  it('routes [SYSTEM DIRECTIVE:...] message as agent_directive without calling classifier', async () => {
    env.classifierUpstream!.setResponse(200, {
      choices: [{ message: { content: '{"category":"general","confidence":0.9}' } }],
    })
    env.upstream.setResponse(200, openaiChatCompletion({ content: 'OK' }))
    env.upstream.clearRequests()
    env.classifierUpstream!.clearRequests()

    const polluted = [
      '[SYSTEM DIRECTIVE: OH-MY-OPENCODE - TODO CONTINUATION]',
      '',
      'Incomplete tasks remain in your todo list. Continue working on the next pending task.',
      '',
      '[Status: 3/4 completed, 1 remaining]',
      '',
      '帮我看看为什么这条消息无法被分类',
    ].join('\n')

    const res = await env.app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: authHeaders(env.virtualKey),
      body: JSON.stringify({
        model: env.accessModelName,
        messages: [{ role: 'user', content: polluted }],
      }),
    })

    expect(res.status).toBe(200)
    expect(env.classifierUpstream!.receivedRequests.length).toBe(0)
    const routedModel = (env.upstream.lastRequest().body as { model: string }).model
    expect(routedModel).toBe(env.generalActualModel)
  })

  it('collapses multi-turn history into single user message with plain text (no role labels / markers)', async () => {
    env.classifierUpstream!.setResponse(200, {
      choices: [{ message: { content: '{"category":"general","confidence":0.9}' } }],
    })
    env.upstream.setResponse(200, openaiChatCompletion({ content: 'OK' }))
    env.upstream.clearRequests()
    env.classifierUpstream!.clearRequests()

    const res = await env.app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: authHeaders(env.virtualKey),
      body: JSON.stringify({
        model: env.accessModelName,
        messages: [
          { role: 'user', content: '1' },
          { role: 'assistant', content: '索引建立成功。' },
          { role: 'user', content: '单元测试覆盖如何？' },
          { role: 'assistant', content: '覆盖度评估报告... ...' },
          { role: 'user', content: '开始吧，从 1 开始。配置 testcontainer 镜像前缀' },
        ],
      }),
    })

    expect(res.status).toBe(200)
    const classifierRequest = env.classifierUpstream!.lastRequest()
    const classifierMessages = (
      classifierRequest.body as { messages: Array<{ role: string; content: string }> }
    ).messages
    expect(classifierMessages).toHaveLength(2)
    expect(classifierMessages[0].role).toBe('system')
    expect(classifierMessages[1].role).toBe('user')

    const compressed = classifierMessages[1].content
    // 纯文本内容全部保留（按对话顺序）
    expect(compressed.startsWith('1')).toBe(true)
    expect(compressed).toContain('索引建立成功。')
    expect(compressed).toContain('单元测试覆盖如何？')
    expect(compressed).toContain('覆盖度评估报告')
    // 最新消息在最后一段（无标记，靠位置）
    expect(compressed.endsWith('开始吧，从 1 开始。配置 testcontainer 镜像前缀')).toBe(true)
    // 不再内嵌角色标签或最新消息标记
    expect(compressed).not.toContain('User:')
    expect(compressed).not.toContain('Assistant:')
    expect(compressed).not.toContain('>>> 最新消息 <<<')
  })
  it('honors historyWindow when collapsing turns', async () => {
    env.classifierUpstream!.setResponse(200, {
      choices: [{ message: { content: '{"category":"general","confidence":0.9}' } }],
    })
    env.upstream.setResponse(200, openaiChatCompletion({ content: 'OK' }))
    env.upstream.clearRequests()
    env.classifierUpstream!.clearRequests()

    const manyTurns: Array<{ role: 'user' | 'assistant'; content: string }> = []
    for (let i = 0; i < 20; i++) {
      manyTurns.push({ role: 'user', content: `u${i}` })
      manyTurns.push({ role: 'assistant', content: `a${i}` })
    }
    manyTurns.push({ role: 'user', content: 'latest query' })

    const res = await env.app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: authHeaders(env.virtualKey),
      body: JSON.stringify({
        model: env.accessModelName,
        messages: manyTurns,
      }),
    })

    expect(res.status).toBe(200)
    const compressed = (
      env.classifierUpstream!.lastRequest().body as {
        messages: Array<{ role: string; content: string }>
      }
    ).messages[1].content
    expect(compressed).toContain('latest query')
    // historyWindow=10 → 最近 10 条（u15..a19），最早的 u0/a0 被截掉
    expect(compressed).toContain('u18')
    expect(compressed).toContain('a18')
    expect(compressed).toContain('u19')
    expect(compressed).toContain('a19')
    expect(compressed).not.toContain('u0')
    expect(compressed).not.toContain('a0')
    // 不再内嵌角色标签或最新消息标记
    expect(compressed).not.toContain('User:')
    expect(compressed).not.toContain('Assistant:')
    expect(compressed).not.toContain('>>> 最新消息 <<<')
  })

  it('returns no_user_query sentinel when sanitized messages have no user content', async () => {
    env.classifierUpstream!.setResponse(200, {
      choices: [{ message: { content: '{"category":"coding","confidence":0.9}' } }],
    })
    env.upstream.setResponse(200, openaiChatCompletion({ content: 'OK' }))
    env.upstream.clearRequests()
    const classifierRequestCountBefore = env.classifierUpstream!.receivedRequests.length

    const res = await env.app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: authHeaders(env.virtualKey),
      body: JSON.stringify({
        model: env.accessModelName,
        messages: [{ role: 'user', content: '<system-reminder></system-reminder>' }],
      }),
    })

    expect(res.status).toBe(200)
    expect(env.classifierUpstream!.receivedRequests.length).toBe(classifierRequestCountBefore)
    const routedModel = (env.upstream.lastRequest().body as { model: string }).model
    expect(routedModel).toBe(env.generalActualModel)
  })
})

// ─── Suite 2: Real llama.cpp Classifier (smoke test) ───────────────────────
// Set LLAMA_CPP_SMOKE=true to run this suite (requires a live llama.cpp server).
// In CI the env var is not set, so the suite is skipped automatically.

const LLAMA_CPP_SMOKE_ENABLED = process.env.LLAMA_CPP_SMOKE === 'true'

describe.skipIf(!LLAMA_CPP_SMOKE_ENABLED)(
  'Intent routing — real llama.cpp classifier (smoke)',
  () => {
    let env: IntentTestEnv

    beforeAll(async () => {
      env = await setupIntentTestEnv({
        classifierBaseUrl: LLAMA_CPP_BASE_URL,
        classifierApiKey: null,
      })
    }, 120000)

    afterAll(async () => {
      invalidateVirtualKeyCache(env.virtualKey)
      env.upstream.close()
      delete process.env.GATEWAY_SAME_PROTOCOL_PASSTHROUGH
      await destroyTestEngine()
    })

    it('routes coding question to coding-group via llama.cpp classifier', async () => {
      env.upstream.setResponse(200, openaiChatCompletion({ content: 'Here is your code' }))
      env.upstream.clearRequests()

      const res = await env.app.request('/api/v1/chat/completions', {
        method: 'POST',
        headers: authHeaders(env.virtualKey),
        body: JSON.stringify({
          model: env.accessModelName,
          messages: [
            {
              role: 'user',
              content:
                'Write a Python function to sort a list using quicksort. Include the full code.',
            },
          ],
        }),
      })

      expect(res.status).toBe(200)
      expect(env.upstream.receivedRequests.length).toBeGreaterThan(0)

      const routedModel = (env.upstream.lastRequest().body as { model: string }).model
      console.log(`[llama.cpp] coding question → routed model: ${routedModel}`)
      expect(routedModel).toBe(env.codingActualModel)
    }, 120000)

    it('routes general question to general-group via llama.cpp classifier', async () => {
      env.upstream.setResponse(200, openaiChatCompletion({ content: 'Paris is the capital.' }))
      env.upstream.clearRequests()

      const res = await env.app.request('/api/v1/chat/completions', {
        method: 'POST',
        headers: authHeaders(env.virtualKey),
        body: JSON.stringify({
          model: env.accessModelName,
          messages: [
            {
              role: 'user',
              content: 'What is the capital of France? Just answer directly.',
            },
          ],
        }),
      })

      expect(res.status).toBe(200)
      expect(env.upstream.receivedRequests.length).toBeGreaterThan(0)

      const routedModel = (env.upstream.lastRequest().body as { model: string }).model
      console.log(`[llama.cpp] general question → routed model: ${routedModel}`)
      expect(routedModel).toBe(env.generalActualModel)
    }, 120000)
  },
)

// ─── Suite 3: Intent logs persistence ──────────────────────────────────────

describe('Intent routing — intent_logs persistence', () => {
  let env: IntentTestEnv

  beforeAll(async () => {
    env = await setupIntentTestEnv({
      classifierBaseUrl: '',
      useMockClassifier: true,
    })
  }, 60000)

  afterAll(async () => {
    invalidateVirtualKeyCache(env.virtualKey)
    env.upstream.close()
    env.classifierUpstream?.close()
    delete process.env.GATEWAY_SAME_PROTOCOL_PASSTHROUGH
    await destroyTestEngine()
  })

  async function waitForIntentLog(
    intentName: string,
    timeoutMs = 5000,
  ): Promise<{
    id: string
    intentName: string
    intentSource: string
    classifierLatencyMs: number | null
    classifierRawResponse: string | null
    targetGroupId: string | null
    targetGroupName: string | null
  } | null> {
    const db = getDatabase()
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const rows = await db.select().from(intentLogs).orderBy(intentLogs.createdAt).limit(50)
      const match = rows.find((r) => r.intentName === intentName)
      if (match) {
        return {
          id: match.id,
          intentName: match.intentName,
          intentSource: match.intentSource,
          classifierLatencyMs: match.classifierLatencyMs,
          classifierRawResponse: match.classifierRawResponse,
          targetGroupId: match.targetGroupId,
          targetGroupName: match.targetGroupName,
        }
      }
      await new Promise((r) => setTimeout(r, 100))
    }
    return null
  }

  it('persists a classifier-source record with latency, raw response, and snippet', async () => {
    env.classifierUpstream!.setResponse(200, {
      choices: [{ message: { content: 'coding' } }],
    })
    env.upstream.setResponse(200, openaiChatCompletion({ content: 'OK' }))
    env.upstream.clearRequests()

    const userMessage = 'Write a Python hello world program'
    const res = await env.app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: authHeaders(env.virtualKey),
      body: JSON.stringify({
        model: env.accessModelName,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })
    expect(res.status).toBe(200)

    const record = await waitForIntentLog('coding')
    expect(record).not.toBeNull()
    expect(record!.intentSource).toBe('classifier')
    expect(record!.classifierLatencyMs).toBeGreaterThanOrEqual(0)
    expect(record!.classifierRawResponse).toBe('coding')
    expect(record!.targetGroupId).not.toBeNull()
    expect(record!.targetGroupName).toBe('intent-coding-group')
  })

  it('persists a fallback record when classifier returns an unknown category', async () => {
    env.classifierUpstream!.setResponse(200, {
      choices: [{ message: { content: 'something_unrecognized' } }],
    })
    env.upstream.setResponse(200, openaiChatCompletion({ content: 'OK' }))
    env.upstream.clearRequests()

    const res = await env.app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: authHeaders(env.virtualKey),
      body: JSON.stringify({
        model: env.accessModelName,
        messages: [{ role: 'user', content: 'ambiguous query' }],
      }),
    })
    expect(res.status).toBe(200)

    const record = await waitForIntentLog('default')
    expect(record).not.toBeNull()
    expect(record!.intentSource).toBe('fallback')
    expect(record!.targetGroupName).toBe('intent-general-group')
  })
})
