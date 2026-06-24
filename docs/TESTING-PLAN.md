# x-llm-gateway 测试计划

## 现状

| 包 | 测试文件数 | 通过率 | 备注 |
|---|---|---|---|
| `apps/gateway` | 19 | 296/303 pass | 7 fail 来自预先存在的 schema-cleaner 问题 |
| `apps/web` | 17 (e2e) | 109/109 pass | 管理前端 SPA 的 Playwright E2E 测试 |
| `packages/shared` | 0 | — | 纯类型/常量，编译检查即可 |
| `packages/ui` | 2 | — | import resolution + hook 测试 |
| `apps/cli` | 0 | — | CLI 工具无测试 |

### 现有测试覆盖的领域

- **Gateway 服务**: error-normalizer, retry-codes, token-estimator, url-join
- **协议转换**: anthropic(ingress/egress/stream), openai, cross-protocol, schema-cleaner, tool-arguments-parser
- **Model Routes 编排**: build-flow, compile-flow, layout-flow, dagre-import
- **Middleware**: 基础中间件测试

### 零覆盖的领域（高风险）

- **13 个管理 API 路由** — `features/*/api.ts` 全部无测试
- **核心业务服务** — `features/*/service.ts` (providers, model-groups, keys, logs 等)
- **createEngine() 集成** — 无测试验证路由正确挂载
- **认证流程** — JWT login/verify 无测试
- **DB schema + 迁移** — 无 schema 验证测试
- **前端组件** — tanstack 全部页面无测试

---

## 测试分层

```
                         ┌──────────────────────────────┐
                         │     E2E (Playwright)          │
                         │  全链路: 启动引擎 → 浏览器操作   │
                         │  覆盖: 登录 → CRUD → 验证显示   │
                         └──────────────────────────────┘
                                    │
                         ┌──────────────────────────────┐
                         │  Integration (Hono test client)│
                         │  createEngine({mountAdminAPI}) │
                         │  app.request() → 验证状态码+响应 │
                         │  覆盖: 13 个 API 端点组合      │
                         └──────────────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
   Unit (engine)            Unit (engine)              Component (ui)
   service 逻辑              gateway/transformer        React 组件
   bun:test                 bun:test                   vitest
   co-located               co-located                 co-located
```

---

## 测试目录结构

### apps/gateway

```
apps/gateway/src/
├── features/
│   ├── providers/
│   │   ├── service.ts
│   │   ├── service.test.ts        ← 业务逻辑单元测试
│   │   ├── api.ts
│   │   └── api.test.ts            ← API 路由测试 (Hono client)
│   ├── model-groups/
│   │   ├── service.ts
│   │   ├── service.test.ts
│   │   ├── api.ts
│   │   └── api.test.ts
│   ├── keys/
│   │   └── ...
│   ├── auth/
│   │   ├── middleware.ts
│   │   ├── middleware.test.ts
│   │   ├── api.ts
│   │   └── api.test.ts
│   ├── logs/
│   │   └── ...
│   ├── settings/
│   ├── access-models/
│   ├── model-routes/
│   ├── config-io/
│   ├── circuit-breaker/
│   ├── health/
│   ├── metrics/
│   ├── ai-assist/
│   └── gateway-config/
├── gateway/
│   ├── services/
│   │   ├── route-rule-engine.ts
│   │   ├── route-rule-engine.test.ts
│   │   ├── model-group-router.ts
│   │   └── model-group-router.test.ts
│   ├── handlers/
│   │   └── ...
│   └── transformer/               ← 已有测试，巩固即可
├── lib/
│   ├── logger.ts
│   ├── logger.test.ts
│   ├── ai-caller.ts
│   └── ai-caller.test.ts
├── middleware/
│   ├── virtual-key.ts
│   ├── virtual-key.test.ts
│   ├── error.ts
│   └── error.test.ts
├── config/
│   ├── env.ts
│   └── env.test.ts
├── db/
│   ├── client.ts
│   └── client.test.ts
├── __tests__/                       ← 跨模块集成测试
│   ├── helpers/
│   │   ├── test-db.ts               ← PGlite 测试 DB
│   │   ├── seed.ts                  ← 测试数据种子
│   │   ├── factories.ts             ← 数据工厂函数
│   │   └── auth-helper.ts           ← JWT token 生成
│   ├── api-integration.test.ts      ← 全量 API 路由验证
│   ├── create-engine.test.ts        ← createEngine 启动验证
│   └── circuit-breaker-lifecycle.test.ts
├── index.ts
├── createEngine.ts
└── server.ts
```

### packages/ui

```
packages/ui/src/
├── components/
│   ├── providers/
│   │   ├── provider-table.tsx
│   │   └── provider-table.ui.test.tsx   ← vitest
│   └── ...
├── hooks/
│   ├── use-logs.ts
│   └── use-logs.test.ts
└── __tests__/
    └── ...
```

### apps/web

```
apps/web/app/
├── routes/
│   ├── admin/
│   │   ├── providers/
│   │   │   ├── index.tsx
│   │   │   └── index.ui.test.tsx
│   │   └── ...
│   └── login.tsx
│   └── login.ui.test.tsx
```

---

## 工具与约定

### 测试运行器

| 层 | 工具 | 理由 |
|---|---|---|
| 后端 unit/integration | `bun:test` | 内置，零配置，快 |
| React 组件 | `vitest` | 已有配置，jsdom 环境 |
| E2E | `Playwright` | 浏览器自动化标准 |

### 核心规范

1. **Co-located**: 测试文件与源码同目录：`foo.ts` → `foo.test.ts`
2. **Factory 函数**: 不用 JSON fixture 文件，用 factory 函数创建测试数据
3. **独立 PGlite**: 每个测试文件用独立的 PGlite 内存实例，互不干扰
4. **不 mock Hono**: 用 `app.request()` 真实发 HTTP 请求，只 mock 外部 HTTP 调用
5. **不依赖预存数据**: 每个测试自己 seed 所需数据

### API 测试模式

```typescript
// features/providers/api.test.ts
import { describe, it, expect, beforeAll } from 'bun:test'
import { createEngine } from '../../createEngine'

describe('providers API', () => {
  let app: Hono
  let token: string

  beforeAll(async () => {
    const engine = await createEngine({ mountAdminAPI: true })
    app = engine.app

    // 登录获取 token
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'test' })
    })
    token = (await loginRes.json()).token
  })

  it('GET /api/providers → 200 + empty list', async () => {
    const res = await app.request('/api/providers', {
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toEqual([])
  })

  it('GET /api/providers (no auth) → 401', async () => {
    const res = await app.request('/api/providers')
    expect(res.status).toBe(401)
  })
})
```

### Service 测试模式

```typescript
// features/providers/service.test.ts
import { describe, it, expect } from 'bun:test'
import { createTestDb } from '../../__tests__/helpers/test-db'
import { createTestProvider } from '../../__tests__/helpers/factories'
import { createProvider, listProviders } from './service'

describe('provider service', () => {
  it('createProvider → inserts and returns provider', async () => {
    const db = await createTestDb()
    const data = createTestProvider({ name: 'OpenAI' })
    const result = await createProvider(db, data)  // 注：需要 service 接受 db 参数
    expect(result.name).toBe('OpenAI')
  })

  it('listProviders → returns all providers', async () => {
    const db = await createTestDb()
    // seed data
    await db.insert(providers).values(createTestProvider())
    const results = await listProviders(db)
    expect(results).toHaveLength(1)
  })
})
```

---

## 优先级路线图

### P0 — API 集成测试（高价值，低工作量）

| 文件 | 工作量 | 价值 |
|---|---|---|
| `features/health/api.test.ts` | 小 | 确认引擎启动正常 |
| `features/auth/api.test.ts` | 小 | 认证安全关键路径 |
| `features/providers/api.test.ts` | 中 | CRUD 典型模式 |
| `features/keys/api.test.ts` | 中 | 类似 providers |
| `features/model-groups/api.test.ts` | 中 | 最复杂 CRUD |
| `__tests__/helpers/test-db.ts` | 中 | 测试基础设施 |
| `__tests__/helpers/factories.ts` | 中 | 数据工厂 |
| `__tests__/api-integration.test.ts` | 大 | 全量路由验证 |

### P1 — 核心业务服务测试

| 文件 | 工作量 | 价值 |
|---|---|---|
| `features/providers/service.test.ts` | 中 | CRUD 逻辑 |
| `features/model-groups/service.test.ts` | 中 | 组+实例管理 |
| `features/keys/service.test.ts` | 中 | 密钥管理 |
| `config/loader.test.ts` | 小 | 配置加载 |
| `middleware/virtual-key.test.ts` | 小 | 虚拟密钥认证 |

### P2 — 巩固已有测试

| 任务 | 说明 |
|---|---|
| 修复 `schema-cleaner.test.ts` 7 个失败 | 预先存在，需要诊断 |
| 删除 `apps/web` 中的重复测试文件 | 迁移后清理 |
| 补充 gateway services 测试覆盖 | route-rule-engine, model-group-router 等 |

### P3 — UI 组件测试

| 任务 | 说明 |
|---|---|
| `packages/ui` 核心组件 | Dialog, Form, Table 等通用组件 |
| `apps/web` 页面级测试 | 每个管理页面的渲染+交互 |

### P4 — E2E 测试

| 任务 | 说明 |
|---|---|
| Playwright 配置 | 安装 + 配置 |
| 登录 → 创建 provider → 创建模型组 → 验证 | 完整用户流程 |

---

## 实施建议

1. **先做基础设施** — `helpers/test-db.ts`, `helpers/factories.ts`, `helpers/auth-helper.ts`
2. **然后做 P0 API 测试** — 每个 api.test.ts 独立可运行，逐步覆盖
3. **再做 P1 服务测试** — service.test.ts 不依赖 DB 实例可单独跑
4. **最后做 UI + E2E** — 依赖前端框架知识

不要一次性全做完。目标：每次迭代增加 2-3 个测试文件，持续提升覆盖率。

---

## E2E 测试覆盖度（apps/web）

### 总体指标

| 指标 | 数值 |
|---|---|
| 测试文件 | 17 个 `*.spec.ts` + `auth.setup.ts` + `helpers.ts` |
| 测试总数 | 109 (chromium: 106, unauthenticated: 3) |
| 项目配置 | 3 projects: `setup`(auth), `unauthenticated`(login), `chromium`(带认证) |
| 基础设施 | gateway (port 3000) + vite (port 5173) webServer 自动管理 |
| 总代码行 | ~1,250 行 |

### 按页面覆盖矩阵

| 管理页面 | 路由 | 测试数 | 覆盖深度 |
|---|---|---|---|
| **Login** | `/login` | 3 | ✅ 表单可见、正确登录跳转、错误密码提示 |
| **Dashboard** | `/admin` | 4 | ✅ 标题、统计卡片、导航链接存在、导航跳转 |
| **Providers** | `/admin/providers` | 7 | ✅ 标题、创建、搜索、编辑、删除、切换启用/禁用、搜索空态 |
| **Model Groups** | `/admin/model-groups` | 6 | ✅ 标题、创建、搜索、编辑、删除、搜索空态 |
| **Keys** | `/admin/keys` | 7 | ✅ 标题、创建(含关闭弹窗)、搜索、编辑、删除、切换启用/禁用、搜索空态 |
| **Access Models** | `/admin/access-models` | 7 | ✅ 标题、创建、搜索、编辑、删除、切换启用/禁用、搜索空态 |
| **Model Routes** | `/admin/model-routes` | 3 | ⚠️ 标题、无加载/错误、FlowEditor canvas |
| **Logs** | `/admin/logs` | 6 | ✅ 过滤控件、搜索空态、清理弹窗 |
| **Settings** | `/admin/settings` | 7 | ✅ 导入/导出按钮和下载、AI/熔断器 section |
| **Circuit Breaker** | `/admin/circuit-breaker` | 8 | ✅ 统计卡片、实时状态、事件历史、过滤、刷新 |
| **Client Models** | `/admin/client-models` | 7 | ✅ 摘要、过滤、搜索、列表/空态、刷新 |
| **Costs** | `/admin/costs` | 8 | ✅ 摘要、日期过滤、3 Tab 切换、每个 Tab 内容验证 |
| **Provider Stats** | `/admin/provider-stats` | 8 | ✅ 摘要、工具栏、排名、徽章、刷新、空态 |
| **Metrics** | `/admin/metrics` | 6 | ✅ 摘要、实例性能表、供应商质量表、图表渲染 |
| **AI Assist** | `/admin/ai-assist` | 10 | ✅ 表单交互、禁用态、表头、空态、错误模式 |

### 覆盖缺口（按优先级排序）

#### 高优先级

| 缺口 | 原因 | 建议测试 |
|---|---|---|
| **Log Detail 页面** (`/admin/logs/$logId`) | 完全无测试，唯一带动态路由参数的页面 | 页面加载、日志详情渲染、返回列表 |
| **Model Routes CRUD** | 路由规则是核心功能，当前仅验证 canvas 渲染，无规则创建/编辑/删除 | 创建规则、编辑条件/动作、删除规则、拖拽排序 |

#### 中优先级

| 缺口 | 原因 | 建议测试 |
|---|---|---|
| **Model Groups 切换启用/禁用** | 其他 CRUD 模块都有 toggle 测试，唯独缺这个 | toggle 开关交互、启用/禁用状态验证 |
| **Circuit Breaker 确认弹窗** | Reset/Trip 确认对话框的交互未覆盖 | 打开弹窗、确认操作、取消操作 |

#### 低优先级

| 缺口 | 原因 | 建议测试 |
|---|---|---|
| **Client Models 排序/时间范围** | 仅验证控件存在，未验证切换行为 | 排序字段切换、时间范围预设切换 |
| **Costs 日期预设切换** | 仅验证 Tab 切换，未验证日期预设值改变后的内容变化 | 日期预设(7d/30d/all)切换后数据更新 |
| **Provider Stats 排序交互** | 仅验证控件存在，未验证排序结果变化 | 排序字段切换、升降序切换 |

### 覆盖深度说明

- **100% 页面覆盖** — 所有 15 个 admin 路由页面 + login 页面都有至少 1 个测试
- **4/7 CRUD 模块有完整 CRUD** — providers, keys, access-models 完整 CRUD + toggle；model-groups 缺 toggle
- **只读/监控模块** — 覆盖页面加载、UI 组件存在性、数据空态、错误态
- **跨页面覆盖** — `monitoring.spec.ts` 遍历所有页面验证路由不 404；`login.spec.ts` 验证认证控制