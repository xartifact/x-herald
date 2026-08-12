# x-herald

> 现代化的 LLM Gateway — 协议转换、虚拟模型路由、高可用代理

[![Version](https://img.shields.io/badge/version-0.1.1-green)]() [![Tests](https://img.shields.io/badge/tests-1620%20pass-brightgreen)]() [![Coverage](https://img.shields.io/badge/coverage-80.46%25%20funcs%2F82.68%25%20lines-yellow)]()

---

## 项目简介

x-herald 是一个透明代理网关，统一管理对 LLM 服务商的访问。核心思路是将对外暴露的模型名称（虚拟模型）与实际后端模型实例解耦，通过路由规则引擎灵活调度。

---

## 核心特性

### 代理能力

| 特性 | 状态 |
| --- | --- |
| OpenAI / Anthropic 双向协议转换 | ✅ |
| 同协议透传（passthrough） | ✅ |
| 流式（SSE）双向转换 | ✅ |
| Anthropic thinking 块支持 | ✅ |
| Gemini 协议支持（定型中） | 🔄 |

### 路由与模型管理

| 特性 | 状态 |
| --- | --- |
| 虚拟模型 + 路由规则引擎 | ✅ |
| `__catchall__` 全局兜底路由 | ✅ |
| 模型组 + 模型实例（优先级路由） | ✅ |
| 访问模型（白名单/黑名单） | ✅ |
| 模型路由可视化（Dagre 流程编辑） | ✅ |

### 安全与限流

| 特性 | 状态 |
| --- | --- |
| 虚拟密钥认证（`Authorization: Bearer` / `x-api-key`） | ✅ |
| 密钥缓存（30s TTL） | ✅ |
| RPM / RPD / Token 速率限制 | ✅ |
| 密钥启用/禁用/过期 | ✅ |

### 高可用

| 特性 | 状态 |
| --- | --- |
| 自动重试（指数退避，含 521/524 等） | ✅ |
| 实例级故障转移（failover） | ✅ |
| 健康检查（定期探测 + TTFB 监控） | ✅ |
| 熔断器（按实例，3 连 fail 自动熔断） | ✅ |
| 超时控制（TTFB 限时 / Streaming 超时 / 总预算控制） | ✅ |

### 监控与成本

| 特性 | 状态 |
| --- | --- |
| 请求日志（含自动清理） | ✅ |
| 实例性能快照（TTFB / 成功率 / TPS） | ✅ |
| 性能基线 + 异常检测（> 2x 基线自动告警） | ✅ |
| 成本追踪（按密钥 / 服务商 / 模型） | ✅ |
| 服务商健康排名 | ✅ |

### 管理界面

| 特性 | 状态 |
| --- | --- |
| Dashboard 概览统计（3 个实时 API） | ✅ |
| 服务商管理 CRUD | ✅ |
| 模型组 + 实例 CRUD（Dialog 表单） | ✅ |
| 虚拟模型 + 路由规则编辑 | ✅ |
| 密钥管理 CRUD | ✅ |
| 请求日志查询 + 详情 | ✅ |
| 客户端模型统计 | ✅ |
| 配置导入 / 导出（JSON v1） | ✅ |
| 熔断器状态监控 | ✅ |
| 服务商统计面板 | ✅ |
| 网关性能指标 | ✅ |
| AI 辅助诊断 | ✅ |

---

## 技术栈

**后端**

- Runtime: **Bun** 1.3+
- 框架: **Hono** 4.x (轻量级 API 框架)
- 服务器: Bun.serve() (直接运行 TypeScript)
- 数据库: PostgreSQL 16 / **PGlite**（嵌入式、零依赖，`venv` 测试用）
- ORM: **Drizzle ORM**
- 日志: Pino

**前端**

- 框架: TanStack Router (文件路由)
- UI: **React 19**
- 构建: **Vite** 8.x
- 组件库: **shadcn/ui** (new-york) + TailwindCSS v4
- 数据获取: TanStack Query v5
- 表单: react-hook-form + zod
- 图表: Recharts

**工程化**

- 包管理: Bun workspaces
- Linting: **oxlint** (161 rules, 150+ plugins)
- 格式化: **oxfmt**
- 测试: `bun:test` 后端单元测试 + **Playwright** E2E
- 组件测试: Vitest + jsdom + React Testing Library
- 覆盖率: Bun 原生 coverage (lcov + text)
- Git Hooks: lint-staged (pre-commit format+lint) + pre-push full CI
- CI: GitHub Actions (format + lint + typecheck + tests + Docker build + E2E)

---

## 项目结构

```
x-herald/
├── apps/
│   ├── gateway/          # 网关内核（Hono + Bun.serve）
│   │   └── src/
│   │       ├── gateway/          # 网关核心（API 路由、转换器、处理链）
│   │       ├── features/         # 功能模块（auth, providers, keys, logs, metrics...）
│   │       ├── middleware/       # Hono 中间件（CORS, auth, logging, error）
│   │       ├── db/               # 数据库迁移、schema
│   │       └── test/             # 测试基础设施（factories, helpers, mock upstream）
│   ├── web/              # 管理界面 SPA（TanStack Router + React 19）
│   │   ├── app/routes/          # 文件路由
│   │   └── e2e/                # Playwright E2E 测试
│   └── cli/              # 管理 CLI 工具
├── packages/
│   ├── db/               # 数据库 schema 定义、连接管理
│   ├── shared/           # 共享类型、Zod schemas、常量
│   ├── ui/               # shadcn/ui 组件库
│   └── ai-agent/         # AI 辅助智能体 SDK
├── docs/                # 架构和开发文档
└── docker-compose.yml   # Docker 部署
```

---

## 快速开始

### 前置要求

- Bun >= 1.3.6
- PostgreSQL 16（可选，PGlite 可用于开发）

### 本地开发

```bash
bun install              # 安装依赖
cp .env.example .env     # 配置环境变量（可选）

# 启动开发服务器 (gateway + web SPA)
bun run dev
```

### 质量检查

```bash
bun run lint             # oxlint 代码检查
bun run format           # oxfmt 格式化
bun run format:check     # 格式检查
bun run typecheck        # 全 monorepo TypeScript 类型检查
bun run check            # 格式 + lint + 类型检查
```

### 测试

```bash
bun run test             # 后端单元/集成测试 (1620 个, bun:test)
bun run test:ui          # UI 组件测试 (Vitest)
bun run test:e2e:ui      # Playwright E2E 测试 (交互式 UI)
bun run ci               # 本地全量 CI（format + lint + typecheck + tests）
```

---

## 测试架构

| 层 | 工具 | 数量 | 位置 |
|---|---|---|---|
| 单元测试 | `bun:test` | 1620 | `apps/gateway/src/**/*.test.ts` |
| 组件测试 | Vitest + React Testing Library | 40 | `**/*.ui.test.tsx` |
| E2E | Playwright | 109 | `apps/web/e2e/**/*.spec.ts` |

**测试基础设施：**
- Hono test client — 快速测试 API 路由
- PGlite 内嵌 PostgreSQL 兼容数据库 — 零依赖测试环境
- Mock 上游服务器 — 模拟 LLM API（OpenAI/Anthropic 响应模板、SSE 流、错误注入）
- 工厂函数 — `createTestProvider()`, `createTestModelGroup()`, `createTestVirtualKey()` 等

### 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 连接字符串 | — |
| `DB_TYPE` | `postgres` 或 `pglite` | 自动检测 |
| `JWT_SECRET` | JWT 签名密钥 | — |
| `ADMIN_PASSWORD` | 管理员初始密码 | `change-me-in-production` |
| `LOG_LEVEL` | 日志级别（trace/debug/info/warn/error） | `info` |
| `PROVIDER_SKIP_TLS_VERIFY` | 跳过 TLS 证书验证（容器内使用） | `false` |

---

## Gateway API

所有 Gateway 请求需携带虚拟密钥（`Authorization: Bearer <key>`）。

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/v1/chat/completions` | OpenAI Chat Completions |
| `POST` | `/api/v1/responses` | OpenAI Responses（兼容） |
| `POST` | `/api/v1/messages` | Anthropic Messages |
| `POST` | `/api/v1/messages/count_tokens` | Anthropic Token 计数 |
| `GET`  | `/api/v1/models` | 可用虚拟模型列表 |

管理 API（需登录）：`/api/providers`、`/api/model-groups`、`/api/virtual-models`、`/api/model-routes`、`/api/keys`、`/api/logs`、`/api/config`、`/api/settings`

---

## Docker 部署

```bash
docker compose build
docker compose up -d
docker compose logs -f gateway
```

---

## 许可证

MIT License

---

## 致谢

- [llm-gateway](https://github.com/sxueck/llm-gateway) — 原始项目和灵感来源
- [LiteLLM](https://github.com/BerriAI/litellm) — LLM 代理参考
- [Bulletproof React](https://github.com/alan2207/bulletproof-react) — 架构模式参考
