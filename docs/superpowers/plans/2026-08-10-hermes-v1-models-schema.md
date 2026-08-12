# Hermes v1/models Schema 兼容实现方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 x-herald 的 `/api/v1/models` 返回 Hermes 可自动发现的上下文元数据（`context_length` 键 + 单模型端点 + 真实值来源），使 `get_model_context_length('Agent', base_url)` 返回 1048576 且不再打 "Could not determine context length" 警告。

**Architecture:** 三个改动点，全部落在现有模型广播链路上：(1) 共享 `ModelSchema` 接口与 `toModelSchema` 输出加 `context_length`（键序在 `context_window` 之前，绕开 Hermes 路径 A 的 JSON 顺序陷阱）；(2) 新增单模型端点 `GET /api/v1/models/:id`（Hermes 路径 C 的阻断点，必须返回 JSON，未知模型也 JSON 404，绝不落 SPA HTML 兜底）；(3) `fetchAccessibleModels` 从路由目标实例的 `metadata`/`config` 读上游真实 context 值合并进广播值（`syncModels` 管线已把 OpenRouter 等上游 `context_length` 写入 `instance.metadata.contextWindow`，只差读取侧）。

**Tech Stack:** Bun + Hono + Drizzle ORM（PGlite 测试）+ zod（测试镜像 schema）+ bun:test（`createProxyTestEnv` 全链路测试环境）。

## Global Constraints

- **路径 A 键序陷阱（Hermes §3 陷阱 1）：** 条目 JSON 里 `context_length` 必须出现在 `context_window` **之前**（Python dict 保持 JSON 插入序，先出现者胜）。JS 对象字面量键序即 JSON 序，不得在后续代码里改键序。
- **路径 C 阻断点（Hermes §3 陷阱 3）：** 单模型端点任何情况都必须返回 JSON——未知模型返回 JSON 404（`{error:{message:"model_not_found",type:"invalid_request_error",code:"model_not_found"}}`），绝不允许落到 SPA `index.html`（200 HTML 会让 Hermes 抛 JSONDecodeError 被 except 吞掉，整条本地探测链终止，列表兜底都走不到）。
- **数值规则（Hermes §2a）：** Hermes 侧 `_coerce_reasonable_int` 接受 `1024 ≤ v ≤ 10,000,000` 的 int/float/数字字符串，拒绝 bool/0/负数。网关广播 0 无意义但无害（Hermes 忽略 0），为保持输出确定性**始终发射** `context_length`（与 `context_window` 同值）。
- **snake_case：** 所有对外字段 snake*case，`data[].id` 保持 `/^[A-Za-z0-9.*:\/-]+$/`（`ID_PATTERN` 已强制，勿动）。
- **三层完整性（AGENTS.md）：** shared（类型）+ gateway（路由/服务）+ 测试缺一不可；不建静态 provider 价格/上下文表（YAGNI，sync 管线已覆盖 OpenRouter passthrough）。
- **禁止 DDL：** 本方案只读 jsonb，零数据库结构变更，不需要迁移文件。
- **x99 验证注意：** Hermes 探测有 30s TTL 缓存；改完网关需重启生效（路由注册在 `createEngine` 中先于 SPA `serveStatic`，**无需重建 SPA**）。
- 不要创建总结文档（repo 规则）；commit message 遵循 `feat(gateway): <subject>`，72 字符内小写开头。

---

## 现状要点（实现者必读，均已在代码中核实）

- `toModelSchema`（含 `ID_PATTERN` 与 `ModelSchema` 组装）在 `apps/gateway/src/gateway/api.ts:17-42`，**不在** `model-list.ts`（规格文档 §4 写错了位置）。
- 共享类型只有 interface，没有 zod；严格 zod 镜像在 `apps/gateway/src/__tests__/v1-models.test.ts:94-112`（`.strict()`，会拒绝未声明的键——加 `context_length` 必须同步更新镜像，否则 "whole payload passes strict ModelSchema validation" 测试失败）。
- 单模型端点当前不存在：`GET /api/v1/models/Agent` 落空 → `createEngine.ts:248-249` 的 SPA `serveStatic` 返回 200 HTML（即文档说的阻断点）。
- `syncModels`（`apps/gateway/src/features/providers/service.ts:285-347`）→ `buildInstanceMetadata`（`service-helpers.ts:264-286`）已把上游 `context_length` 写入 `model_instances.metadata.contextWindow`，注释明示"供后续 /v1/models 端点组装"。本方案只需在 `model-list.ts` 读取。
- `fetchAccessibleModels`（`model-list.ts:217-396`）已有 matcher → `amToGroupIds`（amId → Set&lt;groupId&gt;）映射（第 243-258 行），实例读取复用同一套 group id 集合即可。
- 鉴权：`virtualKeyMiddleware` 接受 `x-api-key` 或 `Authorization: Bearer`，Hermes 的 `api_key` 参数可用（容器版无 key 请求会被拦——那是容器侧问题，本方案不处理）。
- 实例/组能力数值合并语义：`mergeCapabilities` 数值取 MAX（`model-list.ts:187-188`），真实值覆盖沿用 MAX。

## 设计决策（与规格文档的偏差及理由）

1. **单模型端点放 `api.ts` 而非 `openai.ts`（规格 §5.1 建议后者）。** 理由：`toModelSchema`/`ID_PATTERN` 留在原文件避免导出改动；与 `/models` 列表端点同文件共享 `fetchAccessibleModels` + `logRequest` 模式；Anthropic SDK 从不调用单模型 GET，无协议分叉需求。
2. **`context_length` 始终发射**（含值为 0 时），保证输出确定性；Hermes 对 0 直接忽略并回退 `context_window`。
3. **真实值覆盖规则：** 路由目标实例的 `metadata.contextWindow` → `config.capabilityOverrides.contextWindow`（前者为 sync 管线规范位置，优先）；多个目标组实例取 MAX；实例有真实值时**覆盖** AM/组存储值（存储值被 `DEFAULT_ACCESS_MODEL_CAPABILITIES` 的 1M 污染且与显式配置不可区分，实例值是唯一可靠的上游事实）。`maxOutputTokens` 同规则（`metadata.maxOutputTokens` → `config.capabilityOverrides.maxTokens`），服务 Hermes §2b 的 pre-flight 检查。

---

### Task 1: 列表条目加 `context_length`（shared 类型 + `toModelSchema` + 测试镜像）

**Files:**

- Modify: `packages/shared/src/types/model-schema.ts`（`ModelSchema` 接口，约 140-144 行）
- Modify: `apps/gateway/src/gateway/api.ts`（`toModelSchema`，20-30 行）
- Modify: `apps/gateway/src/__tests__/v1-models.test.ts`（镜像 schema 94-112 行 + OpenAI describe 块内新增断言）

**Interfaces:**

- Consumes: `ModelCapabilities.contextWindow`（`model-list.ts:16-24`，现有）
- Produces: `ModelSchema.context_length?: number`（shared 新增可选键）；`toModelSchema(m: AccessibleModel): ModelSchema | null` 输出含 `context_length`，键序在 `context_window` 之前

- [ ] **Step 1: 写失败测试**

在 `v1-models.test.ts` 的 `ModelSchema` 镜像（`context_window` 之前）加键：

```ts
const ModelSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9._:\/-]+$/),
    object: z.literal('model'),
    owned_by: z.string(),
    name: z.string().optional(),
    context_length: z.number().int().positive().optional(),
    context_window: z.number().int().positive(),
    max_output_tokens: z.number().int().positive(),
    capabilities: CapabilitiesSchema,
    cost: CostSchema.optional(),
    compat: CompatSchema.optional(),
    headers: z.record(z.string(), z.string()).optional(),
    thinking_level_map: ThinkingLevelMapSchema.optional(),
    created: z.number().int().min(1000000000).max(4102444800).optional(),
  })
  .strict()
```

在 OpenAI protocol describe 块内（`gpt-4-test` 条目，现有 fixture 的 AM caps 为 `contextWindow: 128000`）追加两个用例：

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd apps/gateway && bun test src/__tests__/v1-models.test.ts -t "context_length"
```

预期：两个新用例 FAIL（`context_length` undefined；严格镜像因未知键拒绝整个 payload），现有用例通过。

- [ ] **Step 3: 实现**

`packages/shared/src/types/model-schema.ts`，`ModelSchema` 接口在 `context_window` 前插入：

```ts
  /** 最大输入上下文窗口（tokens），Hermes 兼容键；须在 context_window 之前出现（JSON 键序） */
  context_length?: number
  /** 最大输入上下文窗口（tokens），必填 */
  context_window: number
```

`apps/gateway/src/gateway/api.ts`，`toModelSchema` 的 `entry` 字面量改为（**键序不能动**）：

```ts
const entry: ModelSchema = {
  id: m.name,
  object: 'model',
  owned_by: 'x-herald',
  context_length: caps?.contextWindow ?? 0,
  context_window: caps?.contextWindow ?? 0,
  max_output_tokens: caps?.maxOutputTokens ?? 0,
  capabilities: {
    vision: caps?.vision ?? false,
    reasoning: caps?.reasoning ?? false,
  },
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd apps/gateway && bun test src/__tests__/v1-models.test.ts
```

预期：全部通过（含两个新用例与既有 strict/键序用例）。

- [ ] **Step 5: 提交**

```bash
git add packages/shared/src/types/model-schema.ts apps/gateway/src/gateway/api.ts apps/gateway/src/__tests__/v1-models.test.ts
git commit -m "feat(gateway): expose context_length in v1/models entries"
```

---

### Task 2: 单模型端点 `GET /api/v1/models/:id`

**Files:**

- Modify: `apps/gateway/src/gateway/api.ts`（在 `/models` 处理器后新增路由）
- Modify: `apps/gateway/src/__tests__/v1-models.test.ts`（新增 describe 块）

**Interfaces:**

- Consumes: `fetchAccessibleModels`（`model-list.ts:217`）、`toModelSchema`（Task 1 后含 `context_length`）、`logRequest`（`log-service.ts:225`，status 取值 `'success' | 'failure' | 'pending'`）
- Produces: `GET /api/v1/models/:id` —— 命中返回 `toModelSchema` 输出（200）；未命中返回 JSON 404（`{ error: { message: 'model_not_found', type: 'invalid_request_error', code: 'model_not_found' } }`）；异常返回 JSON 500。**任何响应都必须是 JSON**

- [ ] **Step 1: 写失败测试**

在 `v1-models.test.ts` 末尾新增 describe（复用同一 fixture env，OpenAI protocol）：

```ts
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
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd apps/gateway && bun test src/__tests__/v1-models.test.ts -t "single model"
```

预期：三个用例 FAIL——`/api/v1/models/gpt-4-test` 现返回 SPA HTML 200（`env.app` 无 dist 时走 notFound JSON 404，两种情况都拿不到模型对象）。

- [ ] **Step 3: 实现**

`apps/gateway/src/gateway/api.ts`，在 `/models` 处理器（124 行）之后追加：

```ts
/**
 * GET /v1/models/:id — 单模型查询（Hermes 本地探测路径 C）。
 * 必须始终返回 JSON：未知模型也返回 JSON 404（否则 Hermes 抛
 * JSONDecodeError 被 except 吞掉，整条本地探测链终止）。
 * 路由注册先于 createEngine 中的 SPA serveStatic，不会落 SPA 兜底。
 */
gatewayRoutes.get('/models/:id', async (c) => {
  const startTime = Date.now()
  const virtualKey = c.get('virtualKey')
  const modelId = c.req.param('id')
  const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
  const userAgent = c.req.header('user-agent') || 'unknown'

  try {
    const models = await fetchAccessibleModels(virtualKey)
    const match = models.find((m) => m.name === modelId)
    const entry = match ? toModelSchema(match) : null

    await logRequest({
      virtualKey,
      modelName: modelId,
      status: entry ? 'success' : 'failure',
      statusCode: entry ? 200 : 404,
      responseTimeMs: Date.now() - startTime,
      clientIp,
      userAgent,
      requestPath: c.req.path,
      requestMethod: 'GET',
      streaming: false,
      incomingProtocol: 'openai',
    })

    if (!entry) {
      return c.json(
        {
          error: {
            message: 'model_not_found',
            type: 'invalid_request_error',
            code: 'model_not_found',
          },
        },
        404,
      )
    }
    return c.json(entry)
  } catch (error) {
    logger.error({ error, modelId }, 'Single model lookup error')
    return c.json(
      {
        error: { message: 'Failed to get model', type: 'internal_error', code: 'internal_error' },
      },
      500,
    )
  }
})
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd apps/gateway && bun test src/__tests__/v1-models.test.ts
```

预期：全部通过（含新 describe 三个用例）。

- [ ] **Step 5: 提交**

```bash
git add apps/gateway/src/gateway/api.ts apps/gateway/src/__tests__/v1-models.test.ts
git commit -m "feat(gateway): add single-model GET v1/models/:id endpoint"
```

---

### Task 3: 实例真实值合并进广播（`fetchAccessibleModels`）

**Files:**

- Modify: `apps/gateway/src/gateway/services/model-list.ts`（顶部 import + `fetchAccessibleModels`）
- Modify: `apps/gateway/src/__tests__/v1-models.test.ts`（新用例 + 顶部 import）

**Interfaces:**

- Consumes: `modelInstances`/`modelGroupMemberships`/`providers`（`@xartifact/x-herald-db` 或 `../db` 均可，`model-list.ts` 现有 import 源为 `@xartifact/x-herald-db`）；`InstanceConfig.capabilityOverrides.contextWindow/maxTokens`（shared，现有）
- Produces: `fetchAccessibleModels` 返回的 `AccessibleModel.capabilities.contextWindow/maxOutputTokens` 被实例真实值覆盖（无实例值时行为不变）

- [ ] **Step 1: 写失败测试**

`v1-models.test.ts` 顶部补 import：

```ts
import { getDatabase } from '../db/client'
import { modelInstances, accessModels } from '../db'
import { eq } from '@xartifact/x-herald-db'
```

在 Task 2 的 describe 之后新增：

````ts
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
})

- [ ] **Step 2: 运行测试确认失败**

```bash
cd apps/gateway && bun test src/__tests__/v1-models.test.ts -t "instance metadata"
````

预期：新用例 FAIL（`context_length` 仍为 128000，未读到实例 metadata）。

- [ ] **Step 3: 实现**

`apps/gateway/src/gateway/services/model-list.ts`：

a) import 区（现有 `modelGroups, accessModels` 行附近）追加：

```ts
import {
  modelGroups,
  accessModels,
  modelInstances,
  modelGroupMemberships,
  providers,
} from '@xartifact/x-herald-db'
import type { InstanceConfig } from '@xartifact/x-herald-shared'
```

b) 文件级新增两个小助手（放在 `normalizeCapabilities` 之后）：

```ts
function pickPositiveNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined
}

/** 从实例 metadata/config 读上游真实能力；metadata 优先（syncModels 管线规范位置） */
function readInstanceRealCaps(
  metadata: Record<string, unknown> | null | undefined,
  config: InstanceConfig | null | undefined,
): { contextWindow: number; maxOutputTokens: number } | null {
  const meta = metadata ?? {}
  const overrides = (config?.capabilityOverrides ?? {}) as Record<string, unknown>
  const contextWindow = pickPositiveNumber(meta.contextWindow ?? overrides.contextWindow)
  const maxOutputTokens = pickPositiveNumber(meta.maxOutputTokens ?? overrides.maxTokens)
  if (contextWindow === undefined && maxOutputTokens === undefined) return null
  return { contextWindow: contextWindow ?? 0, maxOutputTokens: maxOutputTokens ?? 0 }
}

/** 实例真实值覆盖广播值（存储值被 1M 默认污染，实例值才是上游事实） */
function overlayRealCaps(
  capabilities: ModelCapabilities,
  real: { contextWindow: number; maxOutputTokens: number } | null,
): void {
  if (!real) return
  if (real.contextWindow > 0) capabilities.contextWindow = real.contextWindow
  if (real.maxOutputTokens > 0) capabilities.maxOutputTokens = real.maxOutputTokens
}
```

c) `fetchAccessibleModels` 内：在 `groupCapMap` 构建之后、`capMap` 合并循环之前，插入实例查询与 `realCapsByAm` 构建：

```ts
// 批量取目标组启用实例的 metadata/config（上游真实能力，syncModels 已写入）
const instanceRows =
  targetGroupIds.size > 0
    ? await db
        .select({
          groupId: modelGroupMemberships.groupId,
          metadata: modelInstances.metadata,
          config: modelInstances.config,
        })
        .from(modelGroupMemberships)
        .innerJoin(modelInstances, eq(modelGroupMemberships.instanceId, modelInstances.id))
        .innerJoin(providers, eq(modelInstances.providerId, providers.id))
        .where(
          and(
            inArray(modelGroupMemberships.groupId, Array.from(targetGroupIds)),
            eq(modelInstances.enabled, true),
            isNull(modelInstances.deletedAt),
            eq(providers.enabled, true),
            isNull(providers.deletedAt),
          ),
        )
    : []

// amId → 目标组全部实例的 MAX(真实 contextWindow / maxOutputTokens)
const realCapsByAm = new Map<string, { contextWindow: number; maxOutputTokens: number }>()
for (const [amId, groupIds] of amToGroupIds) {
  let real: { contextWindow: number; maxOutputTokens: number } | null = null
  for (const row of instanceRows) {
    if (!groupIds.has(row.groupId)) continue
    const caps = readInstanceRealCaps(row.metadata, row.config)
    if (!caps) continue
    if (!real) real = { contextWindow: 0, maxOutputTokens: 0 }
    real.contextWindow = Math.max(real.contextWindow, caps.contextWindow)
    real.maxOutputTokens = Math.max(real.maxOutputTokens, caps.maxOutputTokens)
  }
  if (real) realCapsByAm.set(amId, real)
}
```

d) 两个 return 分支内应用覆盖：

AM 自有 caps 分支（`return accessible.map((am) => {` 第一处）：

```ts
const real = realCapsByAm.get(am.id)
if (ownCap) {
  const capabilities = normalizeCapabilities(ownCap)
  overlayRealCaps(capabilities, real ?? null)
  const extras = buildModelExtras(
    capabilities,
    ownCap.cost,
    ownCap.compat,
    ownCap.headers,
    ownCap.thinking_level_map ?? ownCap.thinkingLevelMap,
  )
  return {
    name: am.name,
    displayName: am.displayName,
    createdAt: am.createdAt,
    capabilities,
    ...extras,
  }
}
const inherited = capMap.get(am.id)
const capabilities = inherited?.capabilities ?? null
if (capabilities) overlayRealCaps(capabilities, real ?? null)
return {
  name: am.name,
  displayName: am.displayName,
  createdAt: am.createdAt,
  capabilities,
  cost: inherited?.cost ?? null,
  compat: inherited?.compat ?? null,
  headers: inherited?.headers ?? null,
  thinkingLevelMap: inherited?.thinkingLevelMap ?? null,
}
```

注意：`inherited.capabilities` 已是 `mergeCapabilities` 产出的副本，原地覆盖安全。`InstanceConfig` 类型导入若与现有 `ModelCost` 等 import 冲突，合并进同一 import 语句。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd apps/gateway && bun test src/__tests__/v1-models.test.ts
bun run typecheck
```

预期：v1-models 全部通过；typecheck 无错误。

- [ ] **Step 5: 提交**

```bash
git add apps/gateway/src/gateway/services/model-list.ts apps/gateway/src/__tests__/v1-models.test.ts
git commit -m "feat(gateway): merge instance metadata context into v1/models"
```

---

### Task 4: 全量验证（本地 + x99 验收）

**Files:** 无改动（仅验证）

- [ ] **Step 1: 目标测试 + 类型检查**

```bash
cd apps/gateway && bun test src/__tests__/v1-models.test.ts
bun run typecheck
```

预期：v1-models.test.ts 全绿；typecheck 通过。

- [ ] **Step 2: 回归（模型列表相关既有测试）**

```bash
cd apps/gateway && bun test src/__tests__/proxy.test.ts
bun test src/gateway/services/access-model-router.test.ts
```

预期：全绿（`fetchAccessibleModels` 行为在无实例 metadata 时不变）。

- [ ] **Step 3: x99 验收（Hermes 侧，规格 §7 原脚本）**

部署重启网关后执行：

```bash
cd ~/.hermes/hermes-agent && venv/bin/python3 -c "
import sys; sys.path.insert(0,'.')
from agent.model_metadata import get_model_context_length
print(get_model_context_length('Agent','http://127.0.0.1:5005/api/v1',
      api_key='xg_d97e1602dd9c6ec0a2b1a2e6de886e0f29c3d8de642cec694469c3f61a327165'))"
```

预期：返回 `1048576`，且不再打 "Could not determine context length" 警告。注意 30s TTL 缓存：若此前探测失败过，等待或清缓存后再验。

- [ ] **Step 4: 可选——`bun run ci` 全量回归**

提交约束要求提交前全量通过；若改动已合并到主干，由合入方执行 `bun run ci`。

---

## Self-Review（规格覆盖核对）

- 规格 §5.1 单模型端点 → Task 2（JSON 404 / 未知模型 / 不落 SPA）✓
- 规格 §5.2 `context_length` + 键序 + 共享类型 → Task 1 ✓（规格称"测试不会破坏"有误——严格 zod 镜像必须同步加键，已修正）
- 规格 §5.3 真实值来源 → Task 3（`metadata.contextWindow` 主、`config.capabilityOverrides` 兜底、MAX 合并、OpenRouter passthrough 经 syncModels 已覆盖；静态表按 YAGNI 不做）✓
- 规格 §3 陷阱 1（键序）/ 陷阱 3（路径 C 必须 JSON）→ Task 1 / Task 2 ✓
- 规格 §3 陷阱 2（路径 C 需 `context_length` 或 `max_model_len`）→ Task 1 提供 `context_length` ✓
- 规格 §2b 最大输出 tokens → 既有 `max_output_tokens` 保持 + Task 3 实例真实值 ✓
- 规格 §7 验证脚本 → Task 4 ✓
- 规格 §2c 价格键（可选）→ 不在最小集，广播的 `cost` 嵌套对象已存在，未映射 Hermes 顶层价格键（记录为后续可选项，非本方案范围）
