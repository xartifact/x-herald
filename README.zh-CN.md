# x-herald

> 现代化的 LLM Gateway — 协议转换、意图路由、高可用代理与生产级可观测性。

[English](./README.md) · [简体中文](./README.zh-CN.md)

[![Runtime](https://img.shields.io/badge/runtime-Bun%201.3%2B-f9f1e5?logo=bun)]() [![Tests](https://img.shields.io/badge/tests-1900%2B%20pass-brightgreen)]() [![License](https://img.shields.io/badge/license-MIT-blue)]()

---

## 项目简介

x-herald 是一个**透明代理**网关（第一原则：请求按原协议透传，只在必要时转换），统一管理对 LLM 服务商的访问。它把对外暴露的模型名（接入模型）与实际后端实例解耦，通过编译为内存缓存的路由规则引擎灵活调度。

```
客户端 (OpenAI / Anthropic / Responses / JEV SDK)
   │  虚拟密钥 (sk-…)
   ▼
┌────────────────────────── x-herald 网关 ─────────────────────────────┐
│  认证限流 → 协议识别 → 归一化 → 路由决策 → 故障转移                    │
│  → 协议适配 → 上游调用 → SSE 转换 → 日志 / 指标 / 成本                │
└──────────────────────────────────────────────────────────────────────┘
   │                        │                        │
   ▼                        ▼                        ▼
 服务商 A                 服务商 B                 服务商 C
 (OpenAI 兼容)           (Anthropic)             (自定义 / JEV)
```

---

## 核心特性

### 代理与协议

| 特性                                                             | 状态 |
| ---------------------------------------------------------------- | ---- |
| OpenAI ⇄ Anthropic 双向协议转换                                  | ✅   |
| OpenAI Responses API（`/api/v1/responses`）原生代理 + usage 提取 | ✅   |
| 同协议透传（零转换开销）                                         | ✅   |
| 流式（SSE）双向转换，thinking 块支持                             | ✅   |
| JEV System One 透明代理（类型化决策，非 Chat）                   | ✅   |
| Embeddings 维度强制（matryoshka 截断）                           | ✅   |

### 路由

| 特性                                                                                   | 状态 |
| -------------------------------------------------------------------------------------- | ---- |
| 接入模型与后端实例解耦                                                                 | ✅   |
| 路由规则引擎：按模型/密钥/流式/时段/客户端/性能上下文匹配                              | ✅   |
| 规则动作：route-to-group / route-to-instance / intent / capability / fallback / reject | ✅   |
| 意图路由：小模型分类器按对话意图分发                                                   | ✅   |
| 降级链（主备路由，如限流时降级）                                                       | ✅   |
| 未知模型探测（potential-models）                                                       | ✅   |
| 路由追踪：每请求链路 + 每候选结果                                                      | ✅   |

### 高可用

| 特性                                                      | 状态 |
| --------------------------------------------------------- | ---- |
| 实例级故障转移 + 自动重试（指数退避）                     | ✅   |
| 按实例熔断器（连续失败自动熔断，DB 持久化恢复）           | ✅   |
| TTFB 超时策略（实例级配置 + 总预算控制 + P95 基线自适应） | ✅   |
| 上游流空闲看门狗                                          | ✅   |
| 健康检查 + 实例性能快照（TTFB / 成功率 / TPS）            | ✅   |
| 异常检测（> 2× 基线自动标记，反馈路由上下文）             | ✅   |

### 可观测性与成本

| 特性                                                                                                                  | 状态 |
| --------------------------------------------------------------------------------------------------------------------- | ---- |
| 完整请求日志：请求头、请求体、流内容、逐 attempt 详情                                                                 | ✅   |
| 实时流量面板（SSE 推送、等待/进行状态、手动取消）                                                                     | ✅   |
| **精确断连语义**：cancelled 与 failure 区分，三值断开分类（完整后挂断 / 中途取消 / 零数据断开），提前挂断也入账 usage | ✅   |
| 无上游响应时仍记录实际路由模型（回退实例 `actualModelName`）                                                          | ✅   |
| 按密钥 / 服务商 / 模型的成本追踪                                                                                      | ✅   |
| Prometheus `/metrics` 端点                                                                                            | ✅   |
| AI 辅助错误诊断                                                                                                       | ✅   |

### 安全与多租户

| 特性                                                           | 状态 |
| -------------------------------------------------------------- | ---- |
| 虚拟密钥（Bearer / x-api-key，30s 缓存）                       | ✅   |
| 密钥级 RPM / RPD / Token 限流（`X-RateLimit-*` 响应头）        | ✅   |
| 密钥启停/过期、allowed-models 白名单                           | ✅   |
| **工作空间隔离**（服务商/模型组/密钥/日志/路由按工作空间隔离） | ✅   |
| JWT 管理 API                                                   | ✅   |

### 管理控制台

Dashboard、服务商、模型组与实例、接入模型 + 路由规则（可视化编辑）、密钥、日志（实时 + 详情查看器）、路由追踪、意图识别、潜在模型、熔断器、成本、性能指标、服务商统计、路由总览、客户端模型、控制台日志、AI 辅助、设置、配置导入导出（JSON）、工作空间切换。

---

## 技术栈

**后端** — Bun 1.3+ · Hono 4 · Bun.serve()（直接运行 TypeScript）· PostgreSQL 16 / PGlite（嵌入式）· Drizzle ORM · Zod 4 · Pino · prom-client

**前端** — React 19 · TanStack Router + Query v5 · Vite 8 · shadcn/ui (new-york) · TailwindCSS v4 · Recharts · @xyflow/react · Monaco

**工程化** — Bun workspaces · oxlint · oxfmt · bun:test / Vitest / Playwright · GitHub Actions CI · Docker

---

## 项目结构

```
x-herald/
├── apps/
│   ├── gateway/          # 网关内核（Hono + Bun.serve）
│   │   └── src/
│   │       ├── gateway/     # 路由 / 处理器 / 转换器 / 服务
│   │       ├── features/    # auth、providers、keys、logs、metrics、costs、
│   │       │                # route-rules、workspaces、routing-traces 等
│   │       └── test/        # 工厂、mock 上游、代理测试辅助
│   ├── web/              # 管理界面 SPA（TanStack Router + React 19）
│   └── cli/              # 管理 CLI
├── packages/
│   ├── db/              # Drizzle schema + 迁移（单一真实源）
│   ├── shared/           # 类型、Zod schema、常量（前后端契约）
│   ├── ui/               # shadcn/ui 组件库 + 管理端组件
│   └── ai-agent/         # AI 代理 SDK
└── docs/
```

---

## 快速开始

```bash
bun install              # 安装依赖
cp .env.example .env     # 可选：配置环境变量

bun run dev              # 网关 + 管理界面 SPA
```

默认开发端口：网关 `43173`（`PORT` 覆盖），SPA `5173`（被占用时 Vite 自动递增）。Vite `/api` 代理指向 `http://localhost:43173`（`GATEWAY_API_PROXY` 覆盖）。

### 质量检查

```bash
bun run check           # 格式 + lint + 类型检查（全包）
bun run ci              # 本地全量 CI（check + 测试）
bun run test            # 后端测试（bun:test，1900+）
bun run test:ui         # UI 组件测试（Vitest）
bun run test:e2e:ui     # Playwright E2E
```

### 环境变量

| 变量             | 说明                   | 默认值                    |
| ---------------- | ---------------------- | ------------------------- |
| `DATABASE_URL`   | PostgreSQL 连接字符串  | —                         |
| `DB_TYPE`        | `postgres` 或 `pglite` | 自动检测                  |
| `JWT_SECRET`     | JWT 签名密钥           | —                         |
| `ADMIN_PASSWORD` | 管理员初始密码         | `change-me-in-production` |
| `LOG_LEVEL`      | 日志级别               | `info`                    |

---

## Gateway API

所有 `/api/v1` 请求需携带虚拟密钥：`Authorization: Bearer sk-…`

| 方法   | 路径                            | 说明                       |
| ------ | ------------------------------- | -------------------------- |
| `POST` | `/api/v1/chat/completions`      | OpenAI Chat Completions    |
| `POST` | `/api/v1/responses`             | OpenAI Responses API       |
| `POST` | `/api/v1/messages`              | Anthropic Messages         |
| `POST` | `/api/v1/messages/count_tokens` | Anthropic Token 计数       |
| `POST` | `/api/v1/systemone`             | JEV System One（透明代理） |
| `POST` | `/api/v1/embeddings`            | Embeddings                 |
| `GET`  | `/api/v1/models`                | 可用接入模型列表           |
| `GET`  | `/metrics`                      | Prometheus 指标            |

管理 API（JWT）：`/api/providers`、`/api/model-groups`、`/api/access-models`、`/api/route-rules`、`/api/keys`、`/api/logs`、`/api/routing-traces`、`/api/costs`、`/api/circuit-breakers`、`/api/workspaces`、`/api/config`、`/api/settings` 等。

示例：

```bash
curl http://localhost:43173/api/v1/chat/completions \
  -H 'Authorization: Bearer sk-your-virtual-key' \
  -H 'Content-Type: application/json' \
  -d '{"model": "Plan", "messages": [{"role": "user", "content": "hi"}], "stream": true}'
```

客户端请求的 `Plan` 由路由规则引擎解析到具体实例（如 X-AIO 上的 `glm-5.3`），全程应用故障转移、熔断与成本核算。

---

## Docker 部署

```bash
docker compose build
docker compose up -d
docker compose logs -f x-herald
```

镜像：`ghcr.io/xartifact/x-herald:alpha`

---

## 文档

- `docs/architecture-fix-plan.md` — 架构修复计划
- `docs/troubleshooting-thinking-mode-400.md` — Thinking 模式 400（reasoning_content）排障手册
- `docs/client-disconnect-logging-fix-plan.md` — 客户端断连日志语义
- `docs/log-storage-optimization-plan.md` — 日志存储优化
- `docs/i18n-architecture.md` — i18n 架构

---

## 许可证

MIT

## 致谢

- [llm-gateway](https://github.com/sxueck/llm-gateway) — 原始项目和灵感来源
- [LiteLLM](https://github.com/BerriAI/litellm) — LLM 代理参考
- [Bulletproof React](https://github.com/alan2207/bulletproof-react) — 架构模式参考
