import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test'

import type { IntentActionConfig } from '@xartifact/x-llm-gateway-shared'
import type { StandardRequest } from '@xartifact/x-llm-gateway-shared'

// =============================================================================
// Mock: getDatabase —— 注入最小的 fake DB，仅支持本测试需要的 query chains。
//
// classifyIntent 路径下会用 fakeDb 做 1-3 次查询（取决于 modelName 是否像 UUID）：
//   1) getActiveClassifierPrompt —— classifierPrompts（orderBy + limit）
//   2) providers —— provider 查询（where + limit）
//   3) resolveUpstreamModelName —— modelInstances（where + limit），仅当 modelName 是 UUID
//
// 为简单起见，每次 select() 调用都返回一个明确标记的 row pool，按测试预期填入。
// =============================================================================

const TEST_PROVIDER_ID = '434572e3-65e2-478f-a41d-d16de7b44953'
const TEST_INSTANCE_ID = 'cee5269e-04d5-4248-8adb-eb0fdaf6e7b8'
const TEST_INSTANCE_ACTUAL_NAME = 'qwythos-9b-mythos-q8'

let providerRows: unknown[] = [
  {
    id: TEST_PROVIDER_ID,
    name: 'Llama.cpp',
    apiKey: '',
    // intent-router 的 select 用 `baseUrl: providers.protocols`，所以 fake row
    // 必须以 `baseUrl` 为 key，对应 protocols 列的 JSON 内容。
    baseUrl: { openai: { baseUrl: 'http://localhost:9999/v1/', enabled: true } },
    enabled: true,
    deletedAt: null,
  },
]
let instanceRows: unknown[] = [
  {
    id: TEST_INSTANCE_ID,
    actualModelName: TEST_INSTANCE_ACTUAL_NAME,
  },
]

function rowsFromTable(table: unknown): unknown[] {
  // 通过 symbol / 名识别 drizzle table 对象（bun:test 环境下用 ._ 偷看到 name）
  const t = table as Record<string, unknown>
  const name =
    (t._ as { name?: string } | undefined)?.name ??
    (t[Symbol.for('drizzle:Name')] as string | undefined) ??
    ''
  if (name === 'classifier_prompts') {
    return [
      {
        id: '11111111-1111-1111-1111-111111111111',
        version: 1,
        content: 'You are a classifier. Pick one category from: {categories}',
        createdAt: new Date(),
      },
    ]
  }
  if (name === 'providers') return providerRows
  if (name === 'model_instances') return instanceRows
  // 未知表（兜底返回空）
  return []
}

const fakeDb = {
  select: (_fields?: unknown) => ({
    from: (table: unknown) => ({
      where: (_cond?: unknown) => ({
        limit: (n: number) => Promise.resolve(rowsFromTable(table).slice(0, n)),
        orderBy: (_ord?: unknown) => ({
          limit: (n: number) => Promise.resolve(rowsFromTable(table).slice(0, n)),
        }),
      }),
      orderBy: (_ord?: unknown) => ({
        limit: (n: number) => Promise.resolve(rowsFromTable(table).slice(0, n)),
      }),
    }),
  }),
}

mock.module('../../db/client', () => ({
  getDatabase: () => fakeDb,
}))

const { resolveIntentRoute } = await import('./intent-router')

// =============================================================================
// 测试 fixtures
// =============================================================================

const mockConfigWithClassifier = (modelName: string): IntentActionConfig => ({
  targetGroupIds: {
    coding: 'group-coding',
    translation: 'group-translation',
    analysis: 'group-analysis',
  },
  defaultGroupId: 'group-general',
  classifier: {
    providerId: TEST_PROVIDER_ID,
    modelName,
    categories: ['coding', 'translation', 'analysis'],
  },
})

const baseRequest: StandardRequest = {
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Write a hello world app' }],
}

// =============================================================================
// fetch mock 工具
// =============================================================================

const originalFetch = globalThis.fetch

function mockFetchResponse(
  status: number,
  body: string,
  contentType = 'application/json',
): typeof fetch {
  return mock(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(body),
      json: () => Promise.resolve(JSON.parse(body)),
      headers: new Headers({ 'content-type': contentType }),
    } as Response),
  ) as unknown as typeof fetch
}

beforeEach(() => {
  // 重置 DB rows
  providerRows = [
    {
      id: TEST_PROVIDER_ID,
      name: 'Llama.cpp',
      apiKey: '',
      baseUrl: { openai: { baseUrl: 'http://localhost:9999/v1/', enabled: true } },
      enabled: true,
      deletedAt: null,
    },
  ]
  instanceRows = [{ id: TEST_INSTANCE_ID, actualModelName: TEST_INSTANCE_ACTUAL_NAME }]
  globalThis.fetch = originalFetch
  // classifier-prompt-service 用 globalThis 上的 cache，否则测试间复用 prompt
  // 导致 fakeDb 不被调用。
  ;(globalThis as Record<string, unknown>)['__classifier_prompt_cache'] = { cache: null }
})

afterAll(() => {
  globalThis.fetch = originalFetch
})

// =============================================================================
// 既有测试：默认 / 模型名 / 能力匹配 / 兜底
// =============================================================================

describe('resolveIntentRoute', () => {
  it('returns default when no classifier configured', async () => {
    const result = await resolveIntentRoute(
      baseRequest,
      { requestId: 'r1' },
      {
        targetGroupIds: { coding: 'group-coding' },
        defaultGroupId: 'group-general',
      },
    )
    expect(result.intentName).toBe('default')
    expect(result.groupId).toBe('group-general')
  })

  it('routes by model name match', async () => {
    const req = { ...baseRequest, model: 'gpt-4-translation' }
    const result = await resolveIntentRoute(
      req,
      { requestId: 'r2' },
      {
        targetGroupIds: { translation: 'group-translation' },
      },
    )
    expect(result.groupId).toBe('group-translation')
  })

  it('falls back to first group when no match', async () => {
    const result = await resolveIntentRoute(
      { ...baseRequest, model: 'unknown-model' },
      { requestId: 'r3' },
      { targetGroupIds: { x: 'group-x' } },
    )
    expect(result.groupId).toBe('group-x')
  })

  it('does NOT capability-route an image request (that is the capability node\u2019s job)', async () => {
    // 切割：意图节点与能力节点职责分离。能力路由只发生在 capability 节点的
    // resolveCapabilityRoute，意图节点不再按「能力名类别」短路 —— 请求内容里的
    // 模态能力不再驱动 intent 选路。无分类器、无 model-name 匹配时落到 default。
    const req: StandardRequest = {
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: 'https://x.com/img.png' } }],
        },
      ],
    }
    const result = await resolveIntentRoute(
      req,
      { requestId: 'r4' },
      {
        targetGroupIds: { vision: 'group-vision', coding: 'group-coding' },
        defaultGroupId: 'group-general',
      },
    )
    expect(result.groupId).toBe('group-general')
    expect(result.source).toBe('default')
  })
})

// =============================================================================
// 新增测试：分类器行为
// =============================================================================

describe('resolveIntentRoute - classifier', () => {
  it('returns classified intent on successful LLM response', async () => {
    globalThis.fetch = mockFetchResponse(
      200,
      JSON.stringify({
        choices: [{ message: { content: '{"category":"coding","confidence":0.95}' } }],
      }),
    )

    const result = await resolveIntentRoute(
      baseRequest,
      { requestId: 'cls-ok' },
      mockConfigWithClassifier(TEST_INSTANCE_ACTUAL_NAME),
    )
    expect(result.intentName).toBe('coding')
    expect(result.source).toBe('classifier')
    expect(result.classifierStatusCode).toBe(200)
    expect(result.classifierModelName).toBe(TEST_INSTANCE_ACTUAL_NAME)
    expect(result.classifierRawResponse).toContain('coding')
  })

  it('on HTTP 400: captures response body in responseBody and falls back to default', async () => {
    // 回归用例：旧逻辑只在 rawResponse 写 'http_400'，responseBody 是 null，
    // 运维无法看到上游真实错误（如 llama.cpp 的 "model not found"）。
    // 新逻辑：读取并保存 response body 到 responseBody 字段。
    const errorBody = JSON.stringify({
      error: {
        code: 400,
        message: `model '${TEST_INSTANCE_ID}' not found`,
        type: 'invalid_request_error',
      },
    })
    globalThis.fetch = mockFetchResponse(400, errorBody)

    const result = await resolveIntentRoute(
      baseRequest,
      { requestId: 'cls-400' },
      mockConfigWithClassifier(TEST_INSTANCE_ACTUAL_NAME),
    )

    // 行为：fallback 到 default group
    expect(result.intentName).toBe('default')
    expect(result.groupId).toBe('group-general')
    expect(result.source).toBe('fallback')

    // 状态码被记录
    expect(result.classifierStatusCode).toBe(400)

    // rawResponse 仍然是简略标记
    expect(result.classifierRawResponse).toBe('http_400')

    // 关键修复：responseBody 包含上游真实错误（前端 detail drawer 可显示）
    expect(result.classifierResponseBody).toBeTruthy()
    const parsed = result.classifierResponseBody as { error?: { message?: string } }
    expect(parsed.error?.message).toBe(`model '${TEST_INSTANCE_ID}' not found`)

    // 请求体也被记录
    expect(result.classifierRequestBody).toBeTruthy()
    expect((result.classifierRequestBody as { model: string }).model).toBe(
      TEST_INSTANCE_ACTUAL_NAME,
    )
  })

  it('on HTTP 400 with non-JSON body: still captures raw text in responseBody', async () => {
    globalThis.fetch = mockFetchResponse(400, 'plain text error', 'text/plain')

    const result = await resolveIntentRoute(
      baseRequest,
      { requestId: 'cls-400-text' },
      mockConfigWithClassifier(TEST_INSTANCE_ACTUAL_NAME),
    )

    expect(result.classifierStatusCode).toBe(400)
    expect(result.classifierResponseBody).toBe('plain text error')
  })

  it('runtime normalizes UUID modelName to actual_model_name before calling upstream', async () => {
    // 回归用例：graph 里 classifier.modelName 历史错误地保存了 instance.id (UUID)。
    // 运行时 fallback：resolveUpstreamModelName 查 model_instances 转 actual_model_name，
    // 防止发 UUID 给上游 → 400。即使编译器层的 resolver 没跑（缓存未更新等）也兜底。
    let fetchCalledWith: { url?: string; body?: string } = {}
    globalThis.fetch = mock((url: string | URL, init?: RequestInit) => {
      fetchCalledWith = {
        url: typeof url === 'string' ? url : url.toString(),
        body: init?.body as string,
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: '{"category":"coding","confidence":0.9}' } }],
          }),
        headers: new Headers(),
      } as Response)
    }) as unknown as typeof fetch

    const result = await resolveIntentRoute(
      baseRequest,
      { requestId: 'cls-uuid' },
      mockConfigWithClassifier(TEST_INSTANCE_ID), // ← 故意传 UUID
    )

    expect(result.source).toBe('classifier')
    expect(result.intentName).toBe('coding')

    // 上游收到的 model 必须是 actual_model_name，不是 UUID
    const sentBody = JSON.parse(fetchCalledWith.body ?? '{}')
    expect(sentBody.model).toBe(TEST_INSTANCE_ACTUAL_NAME)
    expect(result.classifierModelName).toBe(TEST_INSTANCE_ACTUAL_NAME)
  })

  it('runtime normalizes UUID even when instance is missing from DB (passthrough)', async () => {
    // 边界：UUID 在 model_instances 表里查不到 → 原样返回。
    // 上游大概率 400，但 raw_response 会保留原始 UUID 便于排错。
    instanceRows = [] // 查不到
    globalThis.fetch = mockFetchResponse(
      400,
      JSON.stringify({ error: { message: 'model not found' } }),
    )

    const result = await resolveIntentRoute(
      baseRequest,
      { requestId: 'cls-uuid-missing' },
      mockConfigWithClassifier(TEST_INSTANCE_ID),
    )

    expect(result.classifierStatusCode).toBe(400)
    // UUID 原样透传（resolver 查不到时降级）
    expect((result.classifierRequestBody as { model: string }).model).toBe(TEST_INSTANCE_ID)
  })

  it('does NOT trigger resolver for non-UUID modelName (zero overhead happy path)', async () => {
    // 非 UUID 直接发上游，不查 model_instances
    let resolveUpstreamCalls = 0
    const originalSelect = fakeDb.select
    fakeDb.select = ((fields?: unknown) => {
      const proxy = originalSelect(fields) as ReturnType<typeof originalSelect>
      const originalFrom = proxy.from
      proxy.from = (table: unknown) => {
        const tableName = (table as { _: { name?: string } })._?.name ?? ''
        if (tableName === 'model_instances') {
          resolveUpstreamCalls += 1
        }
        return originalFrom(table)
      }
      return proxy
    }) as typeof fakeDb.select

    globalThis.fetch = mockFetchResponse(
      200,
      JSON.stringify({
        choices: [{ message: { content: '{"category":"coding","confidence":0.9}' } }],
      }),
    )

    const result = await resolveIntentRoute(
      baseRequest,
      { requestId: 'cls-no-uuid' },
      mockConfigWithClassifier('gpt-4o-mini'),
    )

    expect(result.intentName).toBe('coding')
    expect((result.classifierRequestBody as { model: string }).model).toBe('gpt-4o-mini')
    expect(resolveUpstreamCalls).toBe(0)
  })

  it('extracts confidence from classifier response and propagates to IntentResult', async () => {
    // 回归用例：旧代码把 classifier 返回的 confidence 字段完全忽略，
    // intentConfidence 在数据库里恒为 null，运维无法判断分类器置信度。
    // 修复后 confidence 必须原样写入 IntentResult.confidence。
    globalThis.fetch = mockFetchResponse(
      200,
      JSON.stringify({
        choices: [{ message: { content: '{"category":"coding","confidence":0.73}' } }],
      }),
    )

    const result = await resolveIntentRoute(
      baseRequest,
      { requestId: 'cls-conf' },
      mockConfigWithClassifier(TEST_INSTANCE_ACTUAL_NAME),
    )

    expect(result.intentName).toBe('coding')
    expect(result.confidence).toBe(0.73)
    expect(result.classifierCategory).toBe('coding')
    expect(result.classifierCategoryMapped).toBe(true)
  })

  it('preserves classifierCategory even when not in targetGroupIds (强化可观测性)', async () => {
    // 回归用例：生产环境观察到分类器返回 复杂任务，但 route config 只配
    // 简单任务 → 旧代码把 intentName 强制写成 'default'，classifier 原话
    // 被丢弃，运维看不到 AI 实际分类。
    // 修复后：raw category 透传到 IntentResult.classifierCategory，
    // intentName 也保留为原 category（让"分类器说 X 但配置没接住"在日志
    // 里可见），同时打 unmapped_category 监控 + 警告日志。
    globalThis.fetch = mockFetchResponse(
      200,
      JSON.stringify({
        choices: [{ message: { content: '{"category":"复杂任务","confidence":0.95}' } }],
      }),
    )

    const result = await resolveIntentRoute(
      baseRequest,
      { requestId: 'cls-unmapped' },
      mockConfigWithClassifier(TEST_INSTANCE_ACTUAL_NAME),
      // targetGroupIds 只含 coding/translation/analysis，不含 '复杂任务'
    )

    // 关键：raw category 可见
    expect(result.classifierCategory).toBe('复杂任务')
    expect(result.confidence).toBe(0.95)
    // intentName 保留为原 category（不是 'default'），让前端能看到真实分类
    expect(result.intentName).toBe('复杂任务')
    expect(result.classifierCategoryMapped).toBe(false)
    // classifier 给出了有效 category（'复杂任务'），所以 source 仍是 'classifier'；
    // 但因为 targetGroupIds 里没有这个 category，groupId 走 defaultGroupId。
    // 'fallback' 语义保留给"分类器没给出答案"（intentName='default'）。
    expect(result.source).toBe('classifier')
    expect(result.groupId).toBe('group-general') // defaultGroupId
  })
})
