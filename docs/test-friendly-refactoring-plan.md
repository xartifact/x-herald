# Test-Friendly Refactoring Plan (2026-06-22)

> 基于最新代码状态分析 + 测试基础设施审查制定。
> 目标：在不引入 DI 框架的前提下，使代码库支持分层测试（单元/集成/E2E/UI）。
> 与 Architecture Fix Plan 正交但深度耦合 — 一些测试友好性改动依赖架构改造。

---

## 现状评估（2026-06-22）

### 测试全景

| 层 | 文件数 | 运行器 | 状态 |
|---|:---:|---|---|
| 后端单元/集成 (`*.test.ts`) | 80 | `bun:test` | ✅ 覆盖面广 |
| UI 组件 (`*.ui.test.tsx`) | 5 | `vitest` | ⚠️ 仅 providers/keys |
| E2E (`*.spec.ts`) | 10 | `@playwright/test` | ✅ 覆盖主要 CRUD 页面 |
| TanStack 应用 | 1 | `bun:test` | ⚠️ 几乎空白 |
| Shared 包 | 0 | — | ❌ 无测试 |

### 测试基础设施盘点

| 文件 | 用途 | 质量 |
|------|------|------|
| `apps/gateway/src/test/setup.ts` | PGlite 内存 DB + 迁移 + createEngine | ✅ 优秀，155 行 |
| `apps/gateway/src/test/factories.ts` | 8 个工厂函数 | ✅ 好 |
| `apps/gateway/src/test/hono-helper.ts` | testRequest / authenticatedRequest | ✅ 够用 |
| `apps/gateway/src/test/crud-helper.ts` | setupCrudTest / teardownCrudTest | ✅ 好 |
| `apps/gateway/src/test/ui-setup.ts` | jest-dom + ResizeObserver polyfill | ✅ 11 行够用 |
| `apps/gateway/bunfig.toml` | coverage=true, thresholds=0.10/0.15 | ✅ 配置好但从未收集 |
| `vitest.ui.ts` | jsdom env, *.ui.test.tsx | ✅ 干净 |
| `apps/web/playwright.config.ts` | 3 projects, PGlite webServer, auth state | ✅ 优秀 |

### 测试友好性评分

| 层 | 评分 | 主要阻断 |
|---|:---:|---|
| Failover executor | 4/5 | 原生 `fetch()` |
| Shared types | 4/5 | 缺 Zod schema 测试 |
| 前端路由 | 3/5 | 无 API client DI |
| 引擎组合 | 2/5 | 无 DI，eager 单例 |
| Transformer registry | 2/5 | 无 reset |
| Virtual key middleware | 2/5 | Cache 不可注入 |
| 限流引擎 | 2/5 | 时间硬编码 |
| Feature services (x7) | 1/5 | 直接 `getDatabase()` 调用 |
| 熔断器 | 1/5 | 时间硬编码 + fire-and-forget |

---

## 核心原则

> **不引入 DI 框架**。通过参数注入 + 纯函数提取 + 好基础设施提升可测试性。
> Node.js 的模块系统本身就是 DI 容器 — 显式参数注入是补充而非替代。

### 测试分层目标

```
Layer 1: 纯函数单元      → 无依赖，无 mock，极快      ~40%
Layer 2: Service 单元     → mock DB，快                ~30%
Layer 3: API 集成          → PGlite 内存 DB，中速       ~20%
Layer 4: E2E 流程          → 完整引擎 + Playwright      ~10%
```

---

## Phase T1：时间注入（~3h）P0

> 解锁熔断器和限流器的确定性测试。

### T1.1 熔断器时间注入
- `circuit-breaker-state.ts` 构造函数接受 `now: () => number`（默认 `Date.now`）
- `circuit-breaker-policy.ts` 的 `refreshConfigIfStale` 同理
- 所有 `Date.now()` 替换为 `this.now()`
- 测试用 `createTimeController()` 注入固定时间

### T1.2 限流引擎时间注入
- `SlidingWindowCounter` 构造函数接受 `now: () => number`
- `DailyAccumulator` 同理
- `RateLimitEngine` 传递 `now` 给内部计数器

### T1.3 创建时间控制工具

```typescript
// test/time-control.ts
export function createTimeController() {
  let currentTime = 1_700_000_000_000;
  return {
    now: () => currentTime,
    advance: (ms: number) => { currentTime += ms; },
    set: (ts: number) => { currentTime = ts; },
  };
}
```

**验证**：熔断器冷却测试从真实等待 60s → 0ms。

---

## Phase T2：Service 参数注入（~4h）P0

> 解锁所有业务逻辑的单元测试 — 最大收益项。

### T2.1 Service 函数接受可选 DB 参数

```typescript
// 修改前
export async function listKeys(): Promise<VirtualKey[]> {
  const db = getDatabase();  // ← 隐式依赖
  return db.select()...
}

// 修改后
export async function listKeys(db?: Database): Promise<VirtualKey[]> {
  const database = db ?? getDatabase();
  return database.select()...
}
```

### 涉及文件（7 个 service）
- `features/providers/service.ts`
- `features/model-groups/service.ts`
- `features/keys/service.ts`
- `features/model-routes/service.ts`
- `features/access-models/service.ts`
- `features/costs/service.ts`
- `features/gateway-config/service.ts`

### T2.2 通用 Mock DB Builder

```typescript
// test/mock-db.ts
export function createMockDb() {
  // 支持 Drizzle 查询链：select().from().where().limit().orderBy()
  // 支持 insert().values().returning()
  // 支持 update().set().where().returning()
  // 提供 db._setResult('select', rows) 快捷设置返回值
  // 提供 db._reset() 清除所有 mock 状态
}
```

**验证**：keys service 测试从 57 行 mock setup → 5 行。

---

## Phase T3：单例 Reset 基础设施（~2h）P1

> 解决测试间状态泄漏。

### T3.1 各模块导出 reset 函数
- `transformerRegistry` 添加 `clear()` 方法
- `circuitBreakerRegistry` 添加 `reset()` 方法
- `rateLimitEngine` 添加 `reset()` 方法
- `logEventBus` 添加 `reset()` 方法

### T3.2 统一状态重置工具

```typescript
// test/state-reset.ts
export async function resetAllState() {
  transformerRegistry.clear();
  circuitBreakerRegistry.reset();
  rateLimitEngine.reset();
  logEventBus.reset();
  invalidateAllVirtualKeys();
  mock.restore();
}
```

**验证**：测试套件中无状态泄漏。

---

## Phase T4：纯函数提取（~3h）P1

> 将决策逻辑从 I/O 中分离。

### T4.1 熔断器状态转换逻辑提取

```typescript
// circuit-breaker-logic.ts — 纯函数
export function decideStateTransition(state: InstanceState, now: number): InstanceState {
  // 纯逻辑，无 I/O
}
```

### T4.2 限流决策逻辑提取

```typescript
// rate-limit-logic.ts — 纯函数
export function decideRateLimit(entries: Entry[], maxRequests: number, now: number): RateLimitResult {
  // 纯逻辑
}
```

**验证**：决策路径测试无需 mock 任何基础设施。

---

## Phase T5：测试基础设施升级（~3h）P1

### T5.1 场景化数据构建器

```typescript
// test/scenario-builder.ts
export async function buildScenario(db: Database) {
  const provider = await seedProvider(db, { name: 'OpenAI' });
  const group = await seedModelGroup(db, { name: 'gpt-4' });
  const instance = await seedInstance(db, { providerId: provider.id });
  await seedMembership(db, { groupId: group.id, instanceId: instance.id });
  return { provider, group, instance };
}
```

### T5.2 事务隔离测试上下文

```typescript
// test/transactional-context.ts
export async function createTransactionalTest() {
  // 复用全局 PGlite（不每次新建）
  // beforeEach 开启事务，afterEach 回滚
}
```

### T5.3 流式响应测试工具

```typescript
// test/stream-helper.ts
export function createMockStream(chunks: string[]): ReadableStream<Uint8Array> { ... }
export async function readStream(stream: ReadableStream): Promise<string[]> { ... }
```

### T5.4 补充工厂函数
- `createTestCircuitBreakerEvent`
- `createTestHealthRun`
- `createTestInstancePerfSnapshot`
- `createTestAnomalyEvent`

---

## Phase T6：CI 集成与覆盖缺口（~3h）P2

### T6.1 CI 加入 UI 和 E2E 测试

```yaml
# .github/workflows/test.yml
- name: Engine tests
  run: cd apps/gateway && bun test
- name: UI tests
  run: bun run test:ui
- name: E2E tests
  run: bun run test:e2e:ui
```

### T6.2 覆盖率基线

```bash
cd apps/gateway && bun test --coverage
# 建立基线，逐步提高 bunfig.toml 阈值
```

### T6.3 补齐缺失测试
- `features/circuit-breaker/api.test.ts` — feature 级测试
- `features/gateway-config/service.test.ts` — service 级测试
- Shared Zod schema 测试（`providerSchema`、`thinkingMappingFormSchema`）
- E2E: circuit-breaker、client-models、provider-stats 页面

---

## Phase T7：UI 组件测试扩展（~3h）P2

### T7.1 组件测试模板

```typescript
// test/ui/component-test-helpers.tsx
export function renderWithProviders(component: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{component}</QueryClientProvider>);
}

export function mockApiResponse<T>(endpoint: string, response: T) { ... }
```

### T7.2 补齐关键组件测试
- ProviderFormDialog — 表单验证 + 提交
- KeyFormDialog — 创建/编辑流程
- ModelGroupFormDialog — 组 + 实例管理
- LogTable — 数据渲染 + 分页
- CircuitBreakerPanel — 状态展示

### T7.3 API Hook 测试
- 每个 feature 的主查询 hook 1 个测试文件
- 使用 `renderHook` + `waitFor` 验证数据获取

---

## 执行顺序

```
Phase T1 (时间注入)     ← 无依赖，立即开始
Phase T2 (Service DI)   ← 无依赖，可与 T1 并行
    ↓
Phase T3 (单例 Reset)   ← 依赖 T1/T2 完成
Phase T4 (纯函数提取)    ← 依赖 T1
    ↓
Phase T5 (测试基础设施)  ← 依赖 T2/T3
Phase T6 (CI 集成)      ← 独立
Phase T7 (UI 测试)      ← 独立，可与 T5/T6 并行
```

可并行批次：
- 批次 A：T1 + T2 同时进行
- 批次 B：T3 + T4（依赖 T1）+ T6（独立）
- 批次 C：T5 + T7（依赖 T2/T3）

---

## 总览

| 阶段 | 内容 | 工时 | 优先级 |
|------|------|:---:|:---:|
| T1 | 时间注入 | ~3h | P0 |
| T2 | Service 参数注入 + Mock DB | ~4h | P0 |
| T3 | 单例 Reset | ~2h | P1 |
| T4 | 纯函数提取 | ~3h | P1 |
| T5 | 测试基础设施 | ~3h | P1 |
| T6 | CI 集成 + 缺口 | ~3h | P2 |
| T7 | UI 组件测试 | ~3h | P2 |
| | **合计** | **~21h** | |

---

## 预期指标

| 指标 | 当前 | 目标 |
|------|------|------|
| Service 测试 mock setup 行数 | ~57 行 | ~5 行 |
| 熔断器冷却测试时间 | 真实等待 60s | 0ms |
| 限流窗口测试时间 | 真实等待窗口期 | 0ms |
| 可独立测试的纯函数模块 | 2 个 | 5+ 个 |
| UI 组件测试文件 | 5 | 15+ |
| CI 执行的测试类型 | 1（engine） | 3（engine + UI + E2E） |
| 覆盖率基线 | 未收集 | 已建立 |

---

## 不要做什么

1. **不引入 DI 框架**（tsyringe / inversify）— Node.js 模块系统 + 参数注入足够
2. **不追求 100% 覆盖率** — 聚焦高价值测试（决策逻辑、边界条件、故障路径）
3. **不重写已有测试** — 渐进式改进，旧测试保持运行直到自然替换
4. **不引入 MSW** — 项目 API 是 Hono 内部调用，fetch mock 比网络层 mock 更直接
5. **不引入 Playwright E2E 之外的端到端工具** — 已有 `test:e2e:ui` 命令，本计划聚焦单元/组件层
6. **不修改 Drizzle schema** — 所有改动在 service 层和工具函数
