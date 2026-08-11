import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { z } from 'zod'

import { createProxyTestEnv } from '../test/proxy-test-helpers'
import type { ProxyTestEnv } from '../test/proxy-test-helpers'

import { getDatabase } from '../db/client'
import { modelInstances, accessModels, modelGroups } from '../db'
import { eq } from '@xartifact/x-llm-gateway-db'

// ── Zod schemas mirroring ~/.pi/agent/extensions/x-llm-gateway/schemas/v1-models.schema.json ──

const ThinkingLevelMapSchema = z
  .object({
    off: z.union([z.string(), z.null()]).optional(),
    minimal: z.union([z.string(), z.null()]).optional(),
    low: z.union([z.string(), z.null()]).optional(),
    medium: z.union([z.string(), z.null()]).optional(),
    high: z.union([z.string(), z.null()]).optional(),
    xhigh: z.union([z.string(), z.null()]).optional(),
    max: z.union([z.string(), z.null()]).optional(),
  })
  .strict()

const CostTierSchema = z
  .object({
    input_tokens_above: z.number().int().positive(),
    input: z.number().nonnegative(),
    output: z.number().nonnegative(),
    cache_read: z.number().nonnegative().optional(),
    cache_write: z.number().nonnegative().optional(),
  })
  .strict()

const CostSchema = z
  .object({
    input: z.number().nonnegative(),
    output: z.number().nonnegative(),
    cache_read: z.number().nonnegative(),
    cache_write: z.number().nonnegative(),
    cacheRead: z.number().nonnegative().optional(),
    cacheWrite: z.number().nonnegative().optional(),
    tiers: z.array(CostTierSchema).optional(),
  })
  .strict()

const CapabilitiesSchema = z
  .object({
    streaming: z.boolean().optional(),
    function_calling: z.boolean().optional(),
    vision: z.boolean(),
    json_mode: z.boolean().optional(),
    reasoning: z.boolean(),
  })
  .catchall(z.boolean())

const CompatSchema = z
  .object({
    supports_store: z.boolean().optional(),
    supports_developer_role: z.boolean().optional(),
    supports_reasoning_effort: z.boolean().optional(),
    supports_usage_in_streaming: z.boolean().optional(),
    supports_strict_mode: z.boolean().optional(),
    supports_openai_grammar_tools: z.boolean().optional(),
    max_tokens_field: z.enum(['max_completion_tokens', 'max_tokens']).optional(),
    requires_tool_result_name: z.boolean().optional(),
    requires_assistant_after_tool_result: z.boolean().optional(),
    requires_thinking_as_text: z.boolean().optional(),
    requires_reasoning_content_on_assistant_messages: z.boolean().optional(),
    thinking_format: z
      .enum([
        'openai',
        'openrouter',
        'deepseek',
        'together',
        'zai',
        'qwen',
        'chat-template',
        'qwen-chat-template',
        'string-thinking',
        'ant-ling',
      ])
      .optional(),
    chat_template_kwargs: z.record(z.string(), z.unknown()).optional(),
    cache_control_format: z.enum(['anthropic']).optional(),
    session_affinity_format: z.enum(['openai', 'openai-nosession', 'openrouter']).optional(),
    send_session_affinity_headers: z.boolean().optional(),
    deferred_tools_mode: z.enum(['kimi']).optional(),
    supports_long_cache_retention: z.boolean().optional(),
    supports_eager_tool_input_streaming: z.boolean().optional(),
    supports_cache_control_on_tools: z.boolean().optional(),
    force_adaptive_thinking: z.boolean().optional(),
    allow_empty_signature: z.boolean().optional(),
    supports_strict_tools: z.boolean().optional(),
    openrouter_routing: z.record(z.string(), z.unknown()).optional(),
    vercel_gateway_routing: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()

const ModelSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[A-Za-z0-9._:/\\-]+$/),
    name: z.string().min(1).optional(),
    object: z.literal('model'),
    owned_by: z.string().min(1),
    created: z.number().int().min(1000000000).max(4102444800).optional(),
    context_length: z.number().int().positive().optional(),
    context_window: z.number().int().positive(),
    max_output_tokens: z.number().int().positive(),
    capabilities: CapabilitiesSchema,
    cost: CostSchema.optional(),
    headers: z.record(z.string(), z.string()).optional(),
    thinking_level_map: ThinkingLevelMapSchema.optional(),
    compat: CompatSchema.optional(),
    contextWindow: z.number().int().positive().optional(),
    maxTokens: z.number().int().positive().optional(),
    reasoning: z.boolean().optional(),
    input: z.array(z.string()).optional(),
    maxTokensField: z.enum(['max_completion_tokens', 'max_tokens']).optional(),
    mediaInput: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

const ListResponseSchema = z
  .object({
    object: z.literal('list'),
    data: z.array(ModelSchema),
  })
  .strict()

// ── helpers ─────────────────────────────────────────────────────────────────

async function listModels(env: ProxyTestEnv, extraHeaders: Record<string, string> = {}) {
  return env.app.request('/api/v1/models', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${env.virtualKey}`,
      ...extraHeaders,
    },
  })
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('GET /api/v1/models — x-llm-gateway schema v1 (OpenAI protocol)', () => {
  let env: ProxyTestEnv

  beforeAll(async () => {
    env = await createProxyTestEnv({
      protocol: 'openai',
      accessModelName: 'gpt-4-test',
    })
  })

  afterAll(async () => {
    await env.close()
  })

  it('whole payload passes strict ModelSchema validation', async () => {
    const res = await listModels(env)
    expect(res.status).toBe(200)
    const body = await res.json()
    const parsed = ListResponseSchema.safeParse(body)
    if (!parsed.success) {
      throw new Error('Schema validation failed: ' + JSON.stringify(parsed.error.format(), null, 2))
    }
    expect(parsed.success).toBe(true)
  })

  it('envelope: object=list, data is array', async () => {
    const res = await listModels(env)
    const body = (await res.json()) as { object: string; data: unknown[] }
    expect(body.object).toBe('list')
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('model entry exposes id, object, owned_by, context_window, max_output_tokens, capabilities', async () => {
    const res = await listModels(env)
    const body = (await res.json()) as { data: Array<Record<string, unknown>> }
    const entry = body.data.find((m) => m.id === 'gpt-4-test')
    expect(entry).toBeDefined()
    if (!entry) return
    expect(entry.object).toBe('model')
    expect(entry.owned_by).toBe('x-llm-gateway')
    expect(typeof entry.context_window).toBe('number')
    expect(entry.context_window).toBeGreaterThan(0)
    expect(typeof entry.max_output_tokens).toBe('number')
    expect(entry.max_output_tokens).toBeGreaterThan(0)
    expect(entry.capabilities).toBeDefined()
  })

  it('capabilities: vision + reasoning are required and present', async () => {
    const res = await listModels(env)
    const body = (await res.json()) as {
      data: Array<{ capabilities: Record<string, unknown> }>
    }
    const entry = body.data.find((m) => m.id === 'gpt-4-test')
    expect(entry).toBeDefined()
    if (!entry) return
    expect(typeof entry.capabilities.vision).toBe('boolean')
    expect(typeof entry.capabilities.reasoning).toBe('boolean')
  })

  it('id matches the required pattern', async () => {
    const res = await listModels(env)
    const body = (await res.json()) as { data: Array<{ id: string }> }
    for (const m of body.data) {
      expect(m.id).toMatch(/^[A-Za-z0-9._:/\\-]+$/)
    }
  })

  it('cost is omitted when no cost configured (optional field)', async () => {
    const res = await listModels(env)
    const body = (await res.json()) as { data: Array<Record<string, unknown>> }
    const entry = body.data.find((m) => m.id === 'gpt-4-test')
    expect(entry).toBeDefined()
    if (!entry) return
    // 当前 fixture 不写 cost；按 schema 是 optional
    expect(entry.cost).toBeUndefined()
  })
  it('context_length is present and equals context_window', async () => {
    const res = await listModels(env)
    const body = (await res.json()) as { data: Array<Record<string, unknown>> }
    const entry = body.data.find((m) => m.id === 'gpt-4-test')
    expect(entry).toBeDefined()
    if (!entry) return
    expect(entry.context_length).toBe(128000)
    expect(entry.context_length).toBe(entry.context_window)
  })

  it('context_length appears before context_window in JSON (Hermes 路径 A 键序)', async () => {
    const res = await listModels(env)
    const body = (await res.json()) as { data: Array<Record<string, unknown>> }
    const entry = body.data.find((m) => m.id === 'gpt-4-test')
    expect(entry).toBeDefined()
    if (!entry) return
    const keys = Object.keys(entry)
    expect(keys.indexOf('context_length')).toBeGreaterThanOrEqual(0)
    expect(keys.indexOf('context_length')).toBeLessThan(keys.indexOf('context_window'))
  })

  it('camelCase compat view mirrors snake_case values (冗余发射)', async () => {
    const res = await listModels(env)
    const body = (await res.json()) as {
      data: Array<Record<string, unknown>>
    }
    const entry = body.data.find((m) => m.id === 'gpt-4-test')
    expect(entry).toBeDefined()
    if (!entry) return
    expect(entry.contextWindow).toBe(entry.context_window)
    expect(entry.maxTokens).toBe(entry.max_output_tokens)
    expect(entry.reasoning).toBe((entry.capabilities as Record<string, unknown>).reasoning)
    expect(entry.maxTokensField).toBe((entry.compat as Record<string, unknown>).max_tokens_field)
    // fixture vision=false → 仅 text
    expect(entry.input).toEqual(['text'])
  })
})

describe('GET /api/v1/models — x-llm-gateway schema v1 (Anthropic protocol)', () => {
  let env: ProxyTestEnv

  beforeAll(async () => {
    env = await createProxyTestEnv({
      protocol: 'anthropic',
      accessModelName: 'claude-test',
    })
  })

  afterAll(async () => {
    await env.close()
  })

  it('Anthropic envelope includes type=model + has_more + first_id/last_id', async () => {
    const res = await listModels(env, { 'anthropic-version': '2023-06-01' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: Array<Record<string, unknown>>
      has_more: boolean
      first_id: string | null
      last_id: string | null
    }
    expect(body.has_more).toBe(false)
    expect(body.first_id).toBe('claude-test')
    expect(body.last_id).toBe('claude-test')
    const entry = body.data.find((m) => m.id === 'claude-test')
    expect(entry).toBeDefined()
    if (!entry) return
    expect(entry.type).toBe('model')
    expect(entry.context_window).toBeGreaterThan(0)
  })

  it('Anthropic created_at is ISO string; created (unixtime) is omitted', async () => {
    const res = await listModels(env, { 'anthropic-version': '2023-06-01' })
    const body = (await res.json()) as { data: Array<Record<string, unknown>> }
    const entry = body.data.find((m) => m.id === 'claude-test')
    expect(entry).toBeDefined()
    if (!entry) return
    expect(typeof entry.created_at).toBe('string')
    expect(entry.created).toBeUndefined()
  })
})

describe('GET /api/v1/models/:id — single model lookup (Hermes 路径 C)', () => {
  let env: ProxyTestEnv

  beforeAll(async () => {
    env = await createProxyTestEnv({
      protocol: 'openai',
      accessModelName: 'gpt-4-test',
    })
  })

  afterAll(async () => {
    await env.close()
  })

  const getModel = (id: string) =>
    env.app.request(`/api/v1/models/${id}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${env.virtualKey}` },
    })

  it('returns 200 JSON model object for an existing model', async () => {
    const res = await getModel('gpt-4-test')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    const body = (await res.json()) as Record<string, unknown>
    const parsed = ModelSchema.safeParse(body)
    if (!parsed.success) {
      throw new Error('Schema validation failed: ' + JSON.stringify(parsed.error.format(), null, 2))
    }
    expect(body.id).toBe('gpt-4-test')
    expect(body.object).toBe('model')
    expect(body.context_length).toBe(128000)
    expect(body.context_window).toBe(128000)
    expect(body.max_output_tokens).toBeGreaterThan(0)
  })

  it('returns 404 JSON error for an unknown model (never SPA HTML)', async () => {
    const res = await getModel('no-such-model')
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/json')
    const body = (await res.json()) as { error?: Record<string, unknown> }
    expect(body.error?.message).toBe('model_not_found')
    expect(body.error?.type).toBe('invalid_request_error')
    expect(body.error?.code).toBe('model_not_found')
  })

  it('404 body contains no HTML (SPA fallback bypassed)', async () => {
    const res = await getModel('no-such-model')
    const text = await res.text()
    expect(text.toLowerCase()).not.toContain('<!doctype html')
    expect(text.toLowerCase()).not.toContain('<html')
  })

  it('matches model ids containing slashes (regex param spans path segments)', async () => {
    const slashEnv = await createProxyTestEnv({
      protocol: 'openai',
      accessModelName: 'openai/gpt-4-test',
    })
    try {
      const res = await slashEnv.app.request('/api/v1/models/openai/gpt-4-test', {
        method: 'GET',
        headers: { Authorization: `Bearer ${slashEnv.virtualKey}` },
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('application/json')
      const body = (await res.json()) as Record<string, unknown>
      expect(body.id).toBe('openai/gpt-4-test')
      expect(body.context_length).toBeGreaterThan(0)
    } finally {
      await slashEnv.close()
    }
  })
})

describe('instance metadata real values merged into broadcast (规格 §5.3)', () => {
  // 每个用例独立 env：用例间会修改 AM caps / instance metadata，共享 env 会互相污染
  const makeEnv = () =>
    createProxyTestEnv({
      protocol: 'openai',
      accessModelName: 'gpt-4-test',
    })

  it('instance metadata.contextWindow/maxOutputTokens override stored AM caps', async () => {
    const env = await makeEnv()
    try {
      const db = getDatabase()
      await db
        .update(modelInstances)
        .set({ metadata: { contextWindow: 777000, maxOutputTokens: 65536 } })
        .where(eq(modelInstances.id, env.instanceId))

      const res = await env.app.request('/api/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${env.virtualKey}` },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { data: Array<Record<string, unknown>> }
      const entry = body.data.find((m) => m.id === 'gpt-4-test')
      expect(entry).toBeDefined()
      if (!entry) return
      expect(entry.context_length).toBe(777000)
      expect(entry.context_window).toBe(777000)
      expect(entry.max_output_tokens).toBe(65536)

      // 单模型端点同源
      const single = await env.app.request('/api/v1/models/gpt-4-test', {
        method: 'GET',
        headers: { Authorization: `Bearer ${env.virtualKey}` },
      })
      const singleBody = (await single.json()) as Record<string, unknown>
      expect(singleBody.context_length).toBe(777000)
    } finally {
      await env.close()
    }
  })

  it('overlay also applies when AM inherits caps from group (no own capabilities)', async () => {
    const env = await makeEnv()
    try {
      const db = getDatabase()
      await db
        .update(accessModels)
        .set({ capabilities: null })
        .where(eq(accessModels.id, env.accessModelId))
      await db
        .update(modelInstances)
        .set({ metadata: { contextWindow: 888000 } })
        .where(eq(modelInstances.id, env.instanceId))

      const res = await env.app.request('/api/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${env.virtualKey}` },
      })
      const body = (await res.json()) as { data: Array<Record<string, unknown>> }
      const entry = body.data.find((m) => m.id === 'gpt-4-test')
      expect(entry).toBeDefined()
      if (!entry) return
      expect(entry.context_length).toBe(888000)
      expect(entry.context_window).toBe(888000)
    } finally {
      await env.close()
    }
  })

  it('no instance metadata -> stored AM caps are broadcast unchanged', async () => {
    const env = await makeEnv()
    try {
      const res = await env.app.request('/api/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${env.virtualKey}` },
      })
      const body = (await res.json()) as { data: Array<Record<string, unknown>> }
      const entry = body.data.find((m) => m.id === 'gpt-4-test')
      expect(entry).toBeDefined()
      if (!entry) return
      expect(entry.context_length).toBe(128000)
      expect(entry.context_window).toBe(128000)
    } finally {
      await env.close()
    }
  })

  it('disabled model group instance metadata does not feed the real-caps overlay', async () => {
    const env = await makeEnv()
    try {
      const db = getDatabase()
      await db
        .update(modelInstances)
        .set({ metadata: { contextWindow: 777000 } })
        .where(eq(modelInstances.id, env.instanceId))
      await db
        .update(modelGroups)
        .set({ enabled: false })
        .where(eq(modelGroups.id, env.modelGroupId))

      const res = await env.app.request('/api/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${env.virtualKey}` },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { data: Array<Record<string, unknown>> }
      const entry = body.data.find((m) => m.id === 'gpt-4-test')
      expect(entry).toBeDefined()
      if (!entry) return
      expect(entry.context_length).toBe(128000)
      expect(entry.context_window).toBe(128000)
    } finally {
      await env.close()
    }
  })
})

describe('camelCase compat view — vision / cost / mediaInput (冗余发射)', () => {
  // 每用例独立 env：用例会改 DB 行（AM caps / instance metadata）
  const makeEnv = () =>
    createProxyTestEnv({
      protocol: 'openai',
      accessModelName: 'gpt-4-test',
    })

  it('vision model emits input with image; cost carries camelCase cache keys', async () => {
    const env = await makeEnv()
    try {
      const db = getDatabase()
      const [am] = await db
        .select()
        .from(accessModels)
        .where(eq(accessModels.id, env.accessModelId))
      const caps = { ...(am?.capabilities ?? {}) } as Record<string, unknown>
      await db
        .update(accessModels)
        .set({
          capabilities: {
            ...caps,
            vision: true,
            cost: { input: 2.5, output: 15, cache_read: 0.25, cache_write: 0 },
          },
        })
        .where(eq(accessModels.id, env.accessModelId))

      const res = await env.app.request('/api/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${env.virtualKey}` },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { data: Array<Record<string, unknown>> }
      const entry = body.data.find((m) => m.id === 'gpt-4-test')
      expect(entry).toBeDefined()
      if (!entry) return
      expect(entry.input).toEqual(['text', 'image'])
      expect((entry.capabilities as Record<string, unknown>).vision).toBe(true)
      const cost = entry.cost as Record<string, unknown>
      expect(cost.cacheRead).toBe(0.25)
      expect(cost.cacheWrite).toBe(0)
      expect(cost.cache_read).toBe(0.25)
      expect(cost.input).toBe(2.5)
    } finally {
      await env.close()
    }
  })

  it('mediaInput passes through from instance metadata', async () => {
    const env = await makeEnv()
    try {
      const db = getDatabase()
      await db
        .update(modelInstances)
        .set({
          metadata: {
            mediaInput: {
              image: { maxSidePx: 2048, preferredSidePx: 2048, tokenMode: 'detail' },
            },
          },
        })
        .where(eq(modelInstances.id, env.instanceId))

      const res = await env.app.request('/api/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${env.virtualKey}` },
      })
      const body = (await res.json()) as { data: Array<Record<string, unknown>> }
      const entry = body.data.find((m) => m.id === 'gpt-4-test')
      expect(entry).toBeDefined()
      if (!entry) return
      expect(entry.mediaInput).toEqual({
        image: { maxSidePx: 2048, preferredSidePx: 2048, tokenMode: 'detail' },
      })
    } finally {
      await env.close()
    }
  })

  it('mediaInput omitted when no instance config', async () => {
    const env = await makeEnv()
    try {
      const res = await env.app.request('/api/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${env.virtualKey}` },
      })
      const body = (await res.json()) as { data: Array<Record<string, unknown>> }
      const entry = body.data.find((m) => m.id === 'gpt-4-test')
      expect(entry).toBeDefined()
      if (!entry) return
      expect(entry.mediaInput).toBeUndefined()
    } finally {
      await env.close()
    }
  })
})
