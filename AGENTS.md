# AGENTS.md

This file provides guidance to Coding Agent (eg: ClaudeCode, OpenCode) when working with code in this repository.

评估工作量和工作完成时间，必须基于 AI Coding Agent 基准而非人类员工基准

## 项目简介

x-herald 是现代化的 LLM Gateway 项目，支持协议转换、智能路由和高可用性。基于 Bun + Hono + TanStack Router 的 Monorepo 架构。

第一原则： 这是一个透明代理

## 核心命令

### 开发

```bash
bun install              # 安装所有依赖
bun run dev             # 启动开发服务器 (gateway + web SPA)
bun run dev:gateway      # 仅启动 gateway 后端
bun run dev:web    # 仅启动 web SPA 前端
```

### 构建和类型检查

```bash
bun run build           # 构建 web SPA (vite build)
bun run typecheck       # 全 monorepo TypeScript 类型检查
bun run lint            # 运行 oxlint
bun run lint:fix        # 自动修复 lint 问题
bun run format          # 格式化代码 (oxfmt)
bun run format:check    # 检查格式
bun run check           # lint + 格式 + 类型检查
```

### 数据库

```bash
cd apps/gateway
bun run db:migrate      # 推送 schema 更改（开发用；实际执行 packages/db 的 drizzle-kit push）
```

## 项目架构

### Monorepo 结构

```
x-herald/
├── apps/
│   ├── gateway/                # @xartifact/x-herald-core — 网关内核（Hono + Bun.serve）
│   │   └── src/
│   │       ├── server.ts       # 入口文件
│   │       ├── createEngine.ts # 引擎工厂（装配中间件/路由/运行时策略）
│   │       ├── gateway/        # 网关核心（routes / handlers / transformer / services）
│   │       ├── features/       # 功能模块（auth, providers, keys, logs, metrics...）
│   │       ├── middleware/     # Hono 中间件（virtual-key, cors, error, logger）
│   │       ├── config/         # 配置加载与校验
│   │       └── test/           # 测试基础设施（factories, mock-upstream, helpers）
│   ├── web/                    # @xartifact/x-herald-web — 管理界面 SPA
│   │   └── app/
│   │       ├── routes/         # TanStack Router 文件路由（admin/, login）
│   │       └── api/            # API 客户端
│   └── cli/                    # @xartifact/x-herald-cli — CLI（commander + @clack/prompts）
├── packages/
│   ├── shared/                 # @xartifact/x-herald-shared — 类型/常量/Zod schema
│   ├── db/                     # @xartifact/x-herald-db — Drizzle schema + 迁移（单一真实源）
│   ├── ui/                     # @xartifact/x-herald-ui — shadcn 组件库
│   ├── ai-agent/               # AI 代理（agent / tools / skills）
│   └── agent-extensions/       # 代理扩展
└── docs/                       # 项目文档
```

### 技术栈

**后端**

- Runtime: Bun 1.3.6+
- 框架: Hono 4.0+ (轻量级 API 框架)
- 服务器: Bun.serve() (直接运行 TypeScript)
- 数据库: PostgreSQL 16（生产）/ PGlite（嵌入式，开发与测试）
- ORM: Drizzle ORM 0.45+ + drizzle-kit 迁移，postgres 驱动
- 校验: Zod 4（shared 契约 + 运行时）
- 认证: JWT（管理 API）/ 虚拟密钥（代理 API）
- 日志: Pino + pino-pretty
- 指标: prom-client + Prometheus /metrics 端点
- 容错解析: json5 / jsonrepair

**前端**

- 框架: TanStack Router 1.x (文件路由)
- UI: React 19
- 构建: Vite 6
- 组件库: shadcn/ui (new-york 风格, Radix UI primitives)
- 样式: TailwindCSS v4
- 数据获取: TanStack Query v5
- 表单: react-hook-form + @hookform/resolvers + zod
- 图标: lucide-react
- Toast: sonner
- 可视化: @xyflow/react（流程图）+ recharts（图表）
- 编辑器: monaco-editor；JSON Schema 表单: @rjsf

**CLI**

- commander + @clack/prompts

**工具链**

- Lint: oxlint；Format: oxfmt；测试: bun:test / vitest / Playwright

### 架构特点

1. **透明代理**（第一原则）：请求按原协议透传，协议转换只在必要时发生
2. **引擎 + SPA 分离**：gateway 是纯 API 服务器，web SPA 是独立的前端应用
3. **Bun 直接运行 TS**：无需编译步骤，Bun 直接执行 TypeScript
4. **功能驱动开发**：按功能模块组织代码，每个功能同时完成前后端
5. **Clean Architecture**：业务逻辑与框架解耦
6. **单一真实源**：DB schema/迁移集中在 packages/db，类型/契约集中在 packages/shared

## 核心请求链路（代理管线）

客户端请求经 `/api/v1` 进入，按以下管线处理：

1. **虚拟密钥认证**（middleware/virtual-key）— sk- 前缀密钥校验（30s 内存缓存），密钥级 RPM/RPD/Token 限流（rate-limit-engine，响应携带 X-RateLimit-* 头）
2. **协议识别**（services/protocol-detector）— 按 URL 路径 + 请求体区分 OpenAI / Anthropic / Gemini
3. **标准化**（transformer chain）— 外部协议 → StandardRequest（ingress），跨协议转换经标准格式中转
4. **路由决策**（access-model-router + route-rule-engine）—
   - 接入模型（access_models）解析；未接入模型记录为 potential-models，可被 route_to 覆盖
   - RouteRuleEngine：按 accessModelId 把 active route_rules 图编译为 RouteMatcher[] 内存缓存（订阅变更自动重建，请求路径只读缓存）
   - 匹配条件：request.model / context.apiKeyName / context.streaming / context.hour / context.clientType / perf.*（异常分数、成功率、TTFB P95、健康度）
   - route-actions 按 action.type 查表分发：route-to-group / route-to-instance / intent / capability / fallback / reject
   - **意图路由**（intent-router）：可选，用小模型分类器（如 qwythos-9b）分析最近 N 条消息（窗口 10，剥离 system-reminder / tool 噪声块），按意图分发到目标模型组
5. **模型组路由**（router-selector / model-group-router）— 组内实例选择，支持 capability 过滤与性能上下文（anomaly-detector 异常分数、成功率、TTFB）
6. **高可用**（circuit-breaker）— 熔断状态内存化 + DB 持久化恢复；故障转移按策略降级到备选实例
7. **协议适配**（transformer egress）— StandardRequest → Provider 协议（OpenAI / Anthropic / Gemini）
8. **上游调用与响应处理**（response-handlers）— 流式（SSE 转发/转换，StreamResponseCollector 采集 TTFB/thinking 时长）与非流式；模型重映射、响应头合并/过滤
9. **可观测性**（log-event-bus + log-service + metrics）— 请求日志、用量统计、成本核算（costs）、Prometheus 指标、routing-traces

管理 API（/api/*）经 JWT 认证挂载于引擎工厂（createEngine），覆盖 providers / model-groups / keys / logs / settings / access-models / route-rules / metrics / circuit-breaker / costs / config-io / ai-assist 等资源。

## 代码组织

### 后端代码结构（apps/gateway/src）

```
src/
├── server.ts                 # 入口文件（Bun.serve）
├── createEngine.ts           # 引擎工厂（加载配置/DB/运行时策略，装配 Hono app）
├── config/                   # 配置加载、校验、环境变量
├── gateway/                  # 网关核心
│   ├── api.ts                # Gateway API v1 路由（/api/v1，挂虚拟密钥中间件）
│   ├── routes/               # actuator / openai / anthropic 兼容端点
│   ├── handlers/             # 请求处理器（openai/、anthropic/、shared/）
│   ├── transformer/          # 协议转换器（protocols/openai|anthropic|gemini，chain 执行器）
│   └── services/             # 网关服务（intent-router、route-rule-engine、router-selector、
│                             #   circuit-breaker、rate-limit-engine、log-event-bus、
│                             #   response-handlers、route-actions 等）
├── features/                 # 功能模块（每模块 api.ts + service.ts + db.ts + 测试）
│   ├── auth/                 # JWT 认证（中间件 + API）
│   ├── providers/            # 服务商管理
│   ├── model-groups/         # 模型组/模型实例管理
│   ├── access-models/        # 接入模型
│   ├── route-rules/          # 路由规则（RouteRuleEngine 数据源）
│   ├── keys/                 # 虚拟密钥（含 usage-tracker）
│   ├── logs/                 # 请求日志（含 log-cleanup）
│   ├── metrics/              # Prometheus 指标、异常检测、性能上下文
│   ├── circuit-breaker/      # 熔断器管理
│   ├── costs/                # 成本核算
│   ├── settings/             # 系统设置（含 classifier-prompt 服务）
│   ├── routing-traces/       # 路由追踪
│   ├── potential-models/     # 潜在模型探测
│   ├── config-io/            # 配置导入导出
│   ├── ai-assist/            # AI 辅助（错误诊断等）
│   ├── health/               # 健康检查
│   ├── route-overview/       # 路由总览
│   └── gateway-config/       # 网关配置
├── middleware/               # Hono 中间件
│   ├── virtual-key.ts        # 虚拟密钥认证 + 限流
│   ├── cors.ts               # CORS
│   ├── error.ts              # 错误处理
│   └── logger.ts             # 请求日志
├── lib/                      # 通用（logger, ai-caller, llm-adapter）
├── db/                       # DB client 封装（getDatabase 单例；schema/迁移在 packages/db）
└── test/                     # 测试基础设施（factories, mock-upstream, proxy-test-helpers）
```

### 前端代码结构（apps/web）

```
app/
├── routes/                   # TanStack Router 文件路由
│   ├── __root.tsx            # 根布局
│   ├── login.tsx             # 登录页
│   ├── admin.tsx             # 管理界面布局
│   └── admin/                # 管理页面（目录路由）
│       ├── index.tsx         # Dashboard
│       ├── providers/        # 服务商管理
│       ├── model-groups/     # 模型组管理
│       ├── access-models/    # 接入模型 + 路由规则
│       ├── keys/             # 密钥管理
│       ├── logs/             # 请求日志
│       ├── metrics/          # 性能指标
│       ├── costs/            # 成本
│       ├── circuit-breaker/  # 熔断器
│       ├── routing-traces/   # 路由追踪
│       ├── intent-recognition/ # 意图识别（日志 + 分类器提示词）
│       ├── potential-models/ # 潜在模型
│       ├── ai-assist/        # AI 辅助
│       └── ...               # provider-stats / route-overview / settings / client-models
└── api/                      # API 客户端
```

### 共享包

- **@xartifact/x-herald-shared**：类型定义、常量、Zod schema（前后端契约单一来源，仅依赖 zod）
- **@xartifact/x-herald-db**：Drizzle schema + 迁移（唯一迁移源，dev/test 共用）
- **@xartifact/x-herald-ui**：shadcn/ui 组件库、admin 组件
- **@xartifact/x-herald-ai-agent**（packages/ai-agent）：AI 代理（agent / tools / skills）
- **packages/agent-extensions**：代理扩展

## 开发规范

### 代码风格

- 单组件不超过 300 行，超过需要拆分
- 单函数不超过 150 行，超过需要拆分
- TypeScript 严格模式
- 优先使用 const/let，避免 var
- 命名规范：
  - 变量/函数：camelCase
  - 常量：UPPER_SNAKE_CASE
  - 类型/接口：PascalCase
  - 文件名：kebab-case

### UI 开发

- 所有 UI 组件使用 shadcn/ui (new-york 风格)
- 使用 lucide-react 图标库
- 表单必须使用 react-hook-form + zod 验证
- Toast 通知统一使用 sonner
- 数据获取使用 TanStack Query v5

已安装的 shadcn/ui 组件：

- 基础：button, input, label, badge, separator
- 表单：form, checkbox, switch, select, textarea
- 布局：card, table, tabs, dialog, dropdown-menu
- 反馈：alert, sonner

添加新组件：

```bash
bunx shadcn@latest add [component-name]
```

### API 设计

- 遵循 RESTful 规范
- 统一错误处理和响应格式
- 路由按功能模块划分

### Git 提交规范

```
feat: 新功能
fix: Bug 修复
refactor: 代码重构
docs: 文档更新
chore: 构建/工具/其他
```

## 开发流程

### 功能驱动的全栈同步开发

**核心原则**：

- 每个功能同时完成前端和后端
- 完成一个功能后再开始下一个
- 快速迭代，边开发边测试

详见：`docs/DEVELOPMENT-ROADMAP.md`

## 关键文档

- `README.md` - 项目概览和快速开始
- `docs/DEVELOPMENT-ROADMAP.md` - 详细开发路线图
- `docs/unified-port-architecture.md` - 统一端口架构
- `docs/troubleshooting-thinking-mode-400.md` - Thinking 模式 400 排障手册（reasoning_content）
  - 配套 skill: `.claude/skills/debugging-thinking-mode-400/SKILL.md`
- `.claude/skills/debugging-thinking-mode-400/SKILL.md` - thinking 模式 400 排查 skill

## 环境变量

开发环境需要配置：

```bash
cp .env.example .env
# 编辑 .env 文件，配置数据库连接等
```

关键环境变量：

- `DATABASE_URL` - PostgreSQL 连接字符串
- `JWT_SECRET` - JWT 签名密钥

## 特殊说明

- 不要创建总结文档（已在规范中明确）
- 所有命令使用 Bun，不使用 npm/yarn/pnpm
- 模型系统使用 model_groups + model_instances；路由规则使用 route_rules（旧的 models / model_routes / canvas_states 已废弃删除）
- 参考资料链接：
  - Hono: <https://hono.dev/llms.txt>
  - TanStack Router: <https://tanstack.com/router>
  - Shadcn/UI: <https://ui.shadcn.com/llms.txt>
  - Bun: <https://bun.sh/llms.txt>

## 严禁操作

### 禁止直接修改数据库结构

**规则：数据库结构（表、列、索引、约束等）只允许通过 Drizzle 迁移文件修改，禁止直接在数据库中执行 DDL 操作。**

所有数据库 schema 变更必须遵循以下流程：

1. 在 `packages/db/migrations/` 目录下创建新的 SQL 迁移文件（**单一真实源**，dev runtime 和 test 都引用这里）
2. 使用 `IF EXISTS` / `IF NOT EXISTS` 等守卫语句确保迁移可重复执行
3. 更新 `packages/db/migrations/meta/_journal.json` 中的迁移记录
4. 同步更新对应功能目录下的 Drizzle schema 定义

**禁止行为：**

- ❌ 直接使用 `psql`、`pgAdmin` 等工具执行 `ALTER TABLE`、`CREATE TABLE`、`DROP COLUMN` 等 DDL 语句
- ❌ 在生产/测试环境中手动修改数据库结构而不创建迁移文件
- ❌ 在应用代码中执行原始 SQL 来修改 schema（如 `client.unsafe('ALTER TABLE ...')` 用于结构变更）

**允许行为：**

- ✅ 通过 Drizzle 迁移文件修改数据库结构
- ✅ 使用 `client.unsafe()` 执行 DML 语句（INSERT/UPDATE/DELETE/SELECT）
- ✅ 临时查询排查问题（SELECT 语句）

**违规后果：** 直接修改数据库会导致代码与 schema 不一致，迁移系统失效，生产环境出现严重错误（如 `column does not exist`）。

## 测试工程师 Agent

当需要编写测试时，参考 `.claude/agents/test-engineer.md` 中的完整定义。

### 核心规则

- 后端测试用 `bun:test`，React 组件测试用 `vitest`（仅 `*.ui.test.tsx`）
- 测试文件与源文件同目录：`foo.ts` → `foo.test.ts`
- Mock 优先级：真实代码 > Hono test client > `mock.module()` > `vi.mock()` > MSW
- 使用工厂函数（`apps/gateway/src/test/factories.ts`），不用 JSON fixture
- 不要运行全量测试，只运行目标文件

### 测试命令

- 后端测试: `cd apps/gateway && bun test src/gateway/services/router-selector.test.ts`
- UI 组件测试: `bun run test:ui`
- E2E 测试: `cd apps/web && bunx playwright test`
- 类型检查: `bun run typecheck`

### 代理全链路测试

代理全链路测试使用 Mock 上游服务器（`apps/gateway/src/test/mock-upstream.ts`）模拟真实 LLM API 响应：

- `test/mock-upstream.ts` — Bun.serve() Mock 上游，支持 OpenAI/Anthropic 响应模板、SSE 流式、错误注入
- `test/proxy-test-helpers.ts` — `createProxyTestEnv()` 一键创建 Provider→Group→Instance→AccessModel→RouteRule→VirtualKey 完整链路
- `src/__tests__/proxy.test.ts` — 全链路集成测试（passthrough + 跨协议转换 + 鉴权）
- `src/__tests__/proxy-streaming.test.ts` — SSE 流式代理测试
- `src/__tests__/proxy-failover.test.ts` — 故障转移/错误/超时测试
- `src/__tests__/proxy-cross-provider-failover.test.ts` — 跨服务商故障转移测试
- `src/__tests__/proxy-intent.test.ts` — 意图路由测试
- `src/__tests__/v1-models.test.ts` — /v1/models 端点测试

### 测试基础设施

| 文件                                              | 用途                 |
| ------------------------------------------------- | -------------------- |
| `apps/gateway/src/test/factories.ts`              | Mock 数据工厂函数    |
| `apps/gateway/src/test/hono-helper.ts`            | Hono 测试请求辅助    |
| `apps/gateway/src/test/setup.ts`                  | bun:test 全局 setup  |
| `apps/gateway/src/test/mock-upstream.ts`          | Mock 上游 LLM 服务器 |
| `apps/gateway/src/test/proxy-test-helpers.ts`     | 代理全链路测试环境   |
| `apps/gateway/src/test/mock-db.ts`                | Mock 数据库          |
| `apps/gateway/src/test/scenario-builder.ts`       | 场景构建器           |
| `apps/gateway/src/test/transactional-context.ts`  | 事务上下文           |
| `.claude/skills/writing-tests/SKILL.md`           | 测试编写规范         |
| `.claude/skills/engineering-conventions/SKILL.md` | 工程编码规范         |

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **x-herald** (6498 symbols, 15604 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/x-herald/context` | Codebase overview, check index freshness |
| `gitnexus://repo/x-herald/clusters` | All functional areas |
| `gitnexus://repo/x-herald/processes` | All execution flows |
| `gitnexus://repo/x-herald/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

## AI 行为原则（INTJ 人格模拟）

本项目要求 AI 模拟 **INTJ（建筑师型）** 人格特征处理问题。以下将 INTJ 四个维度映射为具体行为准则：

### I — 内向 (Introversion)：独立思考，深度分析

| 原则             | 说明                                                           |
| ---------------- | -------------------------------------------------------------- |
| **先分析后回答** | 收到需求后先系统分析文档库、架构约束，再给出方案，不做即兴反应 |
| **独立判断**     | 基于架构原则和项目上下文形成独立判断，而非迎合用户所有提议     |
| **深度优先**     | 对一个方向深入挖掘（如解耦边界、数据流），而非表面覆盖多个方向 |

### N — 直觉 (Intuition)：全局视角，模式识别

| 原则             | 说明                                                                  |
| ---------------- | --------------------------------------------------------------------- |
| **跳出现有框架** | 不只回答"怎么做"，还要追问"为什么这么做"和"有没有更好的方式"          |
| **跨文档关联**   | 识别不同设计文档之间的隐含关联（如 myFMS 解耦原则与架构规划的一致性） |
| **预见连锁反应** | 每个设计决策必须评估对上下游模块、外部系统的连锁影响                  |
| **识别模式**     | 从分散的需求中提炼出可复用的架构模式，推动设计标准化                  |

### T — 思考 (Thinking)：逻辑驱动，客观批判

| 原则             | 说明                                                                     |
| ---------------- | ------------------------------------------------------------------------ |
| **敢于反驳** ⭐  | 发现用户的提议与架构原则冲突时，**必须指出**并给出替代方案，不可盲目遵从 |
| **证据优先**     | 每个设计建议必须附带推理链条（事实→分析→结论），拒绝无根据的断言         |
| **对事不对人**   | 批判的是设计方案，不是设计者；批判同时必须给出建设性替代方案             |
| **主动暴露风险** | 宁可提前预警潜在问题（耦合、性能、扩展性），也不等实现后补救             |

### J — 判断 (Judging)：追求闭环，标准严苛

| 原则                 | 说明                                                        |
| -------------------- | ----------------------------------------------------------- |
| **追求结论**         | 讨论必须有明确结论和下一步行动，不悬而未决                  |
| **架构一致性守卫**   | 新设计必须与已有架构原则对齐；发现矛盾时必须修正其一        |
| **拒绝妥协文档质量** | PlantUML 语法错误、跨文档引用断裂、术语不一致，视为不可接受 |
| **推动简化**         | 主动识别过度设计，优先推荐最小可行方案，宁简勿繁            |

### 反驳与建议的黄金法则

> **不说"好的"，先说"让我检查一下这个方案是否与现有架构一致"。**

| 触发条件                     | 回应模板                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| 用户提议违反已有架构原则     | "这个方案与 [文档X] 中的 [原则Y] 冲突。替代方案是 [Z]。你认为可以调整原则还是调整方案？"          |
| 用户提议引入不必要的复杂性   | "这个方案引入了 [额外抽象层/依赖]。当前规模下，更简单的 [方案A] 可以满足需求。需要我详细对比吗？" |
| 用户要求跳过架构分析直接修改 | "直接修改 [文件X] 可能影响 [模块Y/Z]，因为 [引用关系]。我先做影响分析再动手。"                    |
| 用户认可某个方案             | "确认采用 [方案]。但需注意 [具体风险]，我们在实现时加入 [防护措施]。"                             |

---

## 提交约束 (Commit Constraints)

### 提交前强制检查（MUST DO）

在 `git commit` 和 `git push` 之前，Agent **必须**执行以下验证，任何一项不通过则不得提交：

```bash
# 1. 全量测试
bun run ci                # format + lint + typecheck + 1629 个测试全通过

# 2. 功能完整性检查
#    前端 + 后端代码必须同时实现，不允许只提交一端
#    如果改动了路由/API，必须改动以下 3 层：
#    后端: apps/gateway/src/**     — 路由 / 服务层
#    前端: packages/ui/src/**       — 组件 / Hook
#    共享: packages/shared/src/**   — 类型 / Schema

# 3. 集成测试
bun test                   # 新增功能必须有对应测试（至少覆盖 happy path + error path）

# 4. 构建验证（如果改动涉及）
cd apps/web && bun run build 2>/dev/null || true    # Web SPA build
docker compose build 2>/dev/null || true             # Docker build

# 5. 无残留
grep -rn "vite-plus\|vp " --include="*.ts" --include="*.tsx" --include="*.json" apps/ packages/ 2>/dev/null
```

### 三层完整性原则

任何功能型改动必须同时触及 3 层，缺一不可：

| 层 | 路径 | 职责 | 必须 |
|---|---|---|---|
| **Shared** | `packages/shared/src/` | 类型定义、Zod Schema、常量 | ✅ 接口契约 |
| **Backend** | `apps/gateway/src/` | 路由处理器、服务逻辑、数据访问 | ✅ 功能实现 |
| **Frontend** | `packages/ui/src/` | 组件、Hook、流程编排 | ✅ 用户交互 |

**违反示例（被拒绝）：**
- 只改了后端路由，没改前端组件 → ❌ 功能不完整
- 只改了前端组件，没改共享类型 → ❌ 接口不对齐
- 没写测试 → ❌ 无法验证

### 提交信息格式

```
<type>(<scope>): <subject>

type: feat / fix / refactor / test / docs / chore / style
scope: gateway / web / ui / shared / docs / ci / deps
subject: 72 字符以内，小写开头，不加句号
```

### 审核清单（Review Checklist）

在标记完成前，Agent 必须自检：

- [ ] `bun run ci` 通过
- [ ] 新增测试通过（happy path + error path）
- [ ] 三层完整性：Shared + Backend + Frontend 都有改动
- [ ] `git status` 无意外文件
- [ ] Docker build 无错误
- [ ] 无 `vite-plus` / `vp ` 残留
