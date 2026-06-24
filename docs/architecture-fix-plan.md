# Architecture Fix Plan

> 基于 2026-06-22 代码结构分析制定。不引入 tRPC、不引入 DI 框架，所有修复在当前技术栈内完成。

## 原则

1. 按影响面 × 成本排序，高收益低成本优先
2. 每个阶段可独立交付，不依赖后续阶段
3. 不破坏现有功能，每步可验证
4. 工作量按 AI Coding Agent 基准估算

---

## Phase 1：零成本修复（~2h）

> 改动小、风险低、收益明确，应第一个做。

### 1.1 authMiddleware 提到 engine 层

- **问题**：10 个 feature 直接 `import { authMiddleware } from '../auth/middleware'`，auth 策略变更需改 10 个文件
- **改动**：`createEngine.ts` 中 `app.use('/api/*', authMiddleware)`（排除 `/api/v1`）；删除 10 个 feature `api.ts` 中的 authMiddleware import 和单独挂载
- **结果**：消除 10 处直接耦合，auth 策略变更只改 1 个文件
- **验证**：`bun run typecheck` 通过 + `bun test` 通过

### 1.2 shared 纳入根 typecheck

- **问题**：`typecheck` 脚本不含 `packages/shared`，shared 类型错误不会被根命令捕获
- **改动**：`package.json` 的 `typecheck` 脚本加入 `cd packages/shared && tsc --noEmit`
- **验证**：`bun run typecheck` 含 shared 检查

### 1.3 统一 Zod 版本

- **问题**：shared/gateway/ui 声明 `^4.3.6`，web 声明 `^4.4.3`
- **改动**：所有 `package.json` 中 zod 统一为 `^4.4.3`
- **验证**：`bun install` 后 `bun.lock` 无版本分歧

### 1.4 清理 deprecated 别名

- **问题**：`virtualModels = accessModels`、`virtualModelRouter = accessModelRouter` 多个弃用别名残留
- **改动**：全局搜索别名定义，删除后更新所有引用方
- **验证**：全局搜索 `virtualModels`、`virtualModelRouter` 无结果

---

## Phase 2：类型边界修复（~4h）

> 解决 UI 包对 Engine 的依赖和前端类型导入不一致。

### 2.1 Schema 集中到 shared

- **问题**：`key-form-types.ts` 等本地 schema/类型与 shared 重复定义
- **改动**：本地 schema 迁移到 `packages/shared/src/schemas/`；类型用 `z.infer` 推导
- **结果**：前后端共用一份 schema，消除重复定义
- **验证**：UI 包内无本地 schema 定义文件

### 2.2 前端类型统一从 shared 导入

- **问题**：keys/model-groups 从 `@x-llm-gateway/gateway` 导入类型，providers/logs 从 `@x-llm-gateway/shared` 导入
- **改动**：全部改为从 `@x-llm-gateway/shared` 导入
- **验证**：`grep -r "from.*@x-llm-gateway/gateway" apps/web/ packages/ui/src/` 无类型导入

### 2.3 将 Engine 导出的共享类型迁移到 shared

- **问题**：UI 包依赖 Engine 包获取类型，后端类型泄漏到前端
- **改动**：Engine `src/index.ts` 中被 UI 使用的域类型（`ModelGroup`、`ModelInstance`、`VirtualKey` 等）迁移到 shared；engine 改为从 shared re-export
- **结果**：UI 包 `package.json` 可移除对 engine 的 workspace 依赖
- **验证**：移除依赖后 `bun run typecheck` 通过

### 2.4 统一 Admin API 响应格式

- **问题**：旧功能用 `extractData: true` 直接返回 data，新功能用 `extractData: false` + `ApiResponse<T>`
- **改动**：所有 admin API 统一返回 `ApiResponse<T>`；前端统一用 `extractData: false` + `response.data`
- **验证**：前端 hooks 中无 `extractData: true` 模式

---

## Phase 3：Service 层一致性（~2h）

> 补齐 model-routes 和 access-models 缺失的 service 层。

### 3.1 model-routes 补 service 层

- **问题**：`api.ts` 中直接 `getDatabase().select(...)`，绕过 service 分层
- **改动**：创建 `features/model-routes/service.ts`，迁移查询逻辑；api.ts 改为调用 service
- **验证**：`api.ts` 中无 `getDatabase()` 调用

### 3.2 access-models 补 service 层

- 同上，创建 `features/access-models/service.ts`
- **验证**：`api.ts` 中无 `getDatabase()` 调用

---

## Phase 4：运行时健壮性（~5h）

> 提升故障恢复和数据一致性。

### 4.1 故障转移事务协调

- **问题**：failover-executor 中日志/用量/成本更新各自独立 SQL，崩溃可能致部分日志
- **改动**：`gateway/handlers/shared/failover-executor.ts` 中更新操作包裹 `db.transaction()`
- **验证**：模拟故障转移中途崩溃，数据库中无孤立记录

### 4.2 globalThis 单例收敛

- **问题**：4 处 globalThis 用法（dbClient、postgresClient、transformerRegistry、circuitBreaker）
- **改动**：审计每处用法，能降级为模块级 `let` 变量的降级；保留确实需要 HMR 穿越的
- **验证**：globalThis 上的属性数量减少

### 4.3 迁移从启动流程分离

- **问题**：每次服务器启动都跑迁移，生产环境不应如此
- **改动**：新增 `MIGRATE_ON_BOOT` 环境变量（默认 `false`）；仅开发环境自动迁移；生产用 `bun run db:migrate` 独立执行
- **验证**：`MIGRATE_ON_BOOT=false` 启动时跳过迁移

### 4.4 修复迁移编号重复

- **问题**：0016 和 0019 各有两个文件，`_journal.json` 与实际文件不一致
- **改动**：重命名重复文件；修正 `_journal.json` 条目
- **验证**：迁移编号唯一，journal 与文件一致

---

## Phase 5：前端工程化（~3h）

### 5.1 路由代码分割

- **问题**：`main.tsx` eager import 14 个页面，首屏包体积大
- **改动**：改为 TanStack Router `lazy` 模式或迁移到文件路由
- **验证**：`vite build` 后 chunk 数量 > 1，首屏包体积下降

### 5.2 统一 shadcn Form 使用（可选）

- **问题**：安装了 `<Form>` / `<FormField>` 但实际用 `form.watch()` + 原始 `<Input>`
- **改动**：逐页面替换为 Form 组件（ROI 较低，可跳过）
- **决策点**：建议跳过或降低优先级

---

## Phase 6：限流分布式化（~8h）

> 最大工作量单项修复，独立于前 5 个阶段。需 Redis 环境。

### 6.1 引入 Redis 限流后端

- **改动**：新增 `gateway/services/rate-limit-redis.ts`，用 Redis 实现 token bucket / sliding window；保留内存版作为 fallback
- **验证**：两实例共享 Redis，同 key 请求计数正确累加

### 6.2 限流引擎抽象接口

- **改动**：定义 `RateLimitEngine` 接口（`check(key, limits) → { allowed, remaining }`）；内存版和 Redis 版各实现一份；通过配置切换
- **验证**：配置切换后限流行为正确

### 6.3 密钥用量统计持久化

- **改动**：`DailyAccumulator` 改为 DB 持久化（`key_usage_daily` 表已存在），内存仅做读缓存
- **验证**：重启后用量统计不丢失

---

## Phase 7：代码质量清理（~3h）

### 7.1 合并错误处理文件

- `error-classifier.ts`、`error-handler.ts`、`gateway-error-handler.ts`、`provider-error-handler.ts` → 合并为 1-2 个文件

### 7.2 config-io 修正导入路径

- 同包内 `@x-llm-gateway/gateway` 自引用改为相对路径

### 7.3 shared 中移除 process.env

- `shared/constants/index.ts` 中的 `APP_VERSION`、`IS_DEVELOPMENT` 等移到 engine 的 config 模块

### 7.4 gateway/services 分组

- 32 个文件按职责分子目录：`routing/`、`error/`、`logging/`、`limiting/`

---

## 依赖关系与执行顺序

```
Phase 1 (零成本修复)          ← 无依赖，立即开始
    ↓
Phase 2 (类型边界)            ← 依赖 Phase 1.3（Zod 统一）
    ↓
Phase 3 (Service 层)           ← 独立，可与 Phase 2 并行
    ↓
Phase 4 (运行时健壮性)         ← 独立，可与 Phase 2/3 并行
    ↓
Phase 5 (前端工程化)           ← 独立，可与 Phase 4 并行
    ↓
Phase 6 (限流分布式化)         ← 独立，需 Redis 环境
    ↓
Phase 7 (代码质量清理)         ← 最后，收尾
```

可并行批次：
- 批次 A：Phase 1（串行）
- 批次 B：Phase 2 + Phase 3 + Phase 4 + Phase 5（4 路并行）
- 批次 C：Phase 6（独立）
- 批次 D：Phase 7（收尾）

---

## 总览

| 阶段 | 解决问题数 | 预估工时 | 优先级 |
|------|:---:|:---:|:---:|
| Phase 1 | 4 | ~2h | P0 |
| Phase 2 | 3 | ~4h | P1 |
| Phase 3 | 1 | ~2h | P1 |
| Phase 4 | 4 | ~5h | P1 |
| Phase 5 | 2 | ~3h | P2 |
| Phase 6 | 1 | ~8h | P2 |
| Phase 7 | 4 | ~3h | P3 |
| **合计** | **19** | **~27h** | |
