# x-llm-gateway

> 现代化的 LLM Gateway — 协议转换、虚拟模型路由、高可用代理

[![Version](https://img.shields.io/badge/version-2.0.0-green)]()

---

## 项目简介

x-llm-gateway 是一个透明代理网关，统一管理对 LLM 服务商的访问。核心思路是将对外暴露的模型名称（虚拟模型）与实际后端模型实例解耦，通过路由规则引擎灵活调度。

---

## 核心特性

| 特性 | 状态 |
|------|------|
| OpenAI / Anthropic 双向协议转换 | ✅ |
| 同协议透传（passthrough） | ✅ |
| 虚拟模型 + 路由规则引擎 | ✅ |
| `__catchall__` 全局兜底路由 | ✅ |
| 模型组 + 模型实例（优先级路由） | ✅ |
| 虚拟密钥（速率限制 / Token 额度） | ✅ |
| 自动重试（指数退避，含 521 错误） | ✅ |
| Anthropic thinking 块支持 | ✅ |
| 请求日志（含自动清理） | ✅ |
| 配置导入 / 导出（JSON v1） | ✅ |

---

## 技术栈

**后端**
- Runtime: Bun
- 框架: Next.js (App Router) + Hono
- 数据库: PostgreSQL 16 / PGlite（嵌入式）
- ORM: Drizzle ORM
- 日志: Pino

**前端**
- React 19 + Next.js App Router
- shadcn/ui (new-york) + TailwindCSS v4
- React Query v5 + react-hook-form + zod

---

## 项目结构

```
x-llm-gateway/
├── apps/
│   └── web/                    # Next.js + Hono 全栈应用
│       ├── src/
│       │   ├── app/            # Next.js App Router（页面 + API 入口）
│       │   │   └── admin/      # 管理界面
│       │   ├── core/           # 核心基础设施（DB / Config / Middleware）
│       │   ├── features/       # 功能模块（按领域划分）
│       │   └── types/          # TypeScript 类型
│       └── drizzle/            # DB schema & migrations
└── docs/                       # 文档
```

---

## 快速开始

### 前置要求

- Bun >= 1.3.6
- PostgreSQL 16（或使用内置 PGlite，无需额外安装）

### 本地开发

```bash
# 安装依赖
bun install

# 配置环境变量
cp .env.example .env
# 编辑 .env，至少配置 DATABASE_URL 和 JWT_SECRET

# 运行数据库迁移（首次启动前）
cd apps/web && bunx drizzle-kit migrate

# 启动开发服务器
bun run dev
# 访问 http://localhost:3000
```

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
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
|------|------|------|
| `POST` | `/api/v1/chat/completions` | OpenAI Chat Completions |
| `POST` | `/api/v1/responses` | OpenAI Responses（兼容） |
| `POST` | `/api/v1/messages` | Anthropic Messages |
| `POST` | `/api/v1/messages/count_tokens` | Anthropic Token 计数 |
| `GET` | `/api/v1/models` | 可用虚拟模型列表 |

管理 API（需登录）：`/api/providers`、`/api/model-groups`、`/api/virtual-models`、`/api/model-routes`、`/api/keys`、`/api/logs`、`/api/config`、`/api/settings`

---

## 路由机制

请求进入时，网关按以下顺序寻找路由目标：

1. 按请求的 `model` 字段查找匹配的虚拟模型
2. 对该虚拟模型执行路由规则引擎，按优先级匹配第一条规则
3. 若未找到虚拟模型，自动落入 `__catchall__` 全局路由

### 路由规则条件字段

| 字段 | 说明 |
|------|------|
| `request.model` | 请求的模型名称 |
| `context.streaming` | 是否为流式请求 |
| `context.apiKeyName` | 使用的虚拟密钥名称 |
| `context.hour` | 当前小时（0-23） |
| `context.clientType` | 客户端类型 |

支持的操作符：`eq`、`ne`、`in`、`starts_with`、`exists`

### 路由动作

| 动作 | 说明 |
|------|------|
| `route_to_group` | 路由到指定模型组（按实例优先级选择） |
| `route_to_instance` | 路由到指定模型实例 |
| `reject` | 拒绝请求 |
| `fallback` | 使用请求模型名透传 |

### `__catchall__` 虚拟模型

系统内置的全局兜底虚拟模型，不可删除或重命名。所有未匹配到具体虚拟模型的请求都会路由至此。默认附带一条优先级 9999 的 `reject` 规则，可在管理界面修改为实际的路由目标。

---

## 管理界面

访问 `http://localhost:3000/admin`，包含以下页面：

- **Dashboard** — 概览统计
- **Providers** — 服务商管理（API Key、Base URL）
- **Model Groups** — 模型组 + 模型实例管理
- **Virtual Models** — 虚拟模型管理
- **Model Routes** — 路由规则配置
- **Keys** — 虚拟密钥管理（速率限制、Token 额度）
- **Logs** — 请求日志查询
- **Client Models** — 客户端模型统计
- **Settings** — 配置导入 / 导出

---

## Docker 部署

```bash
docker-compose build
docker-compose up -d
docker-compose logs -f gateway
```

---

## 许可证

MIT License

---

## 致谢

- [llm-gateway](https://github.com/sxueck/llm-gateway) - 原始项目和灵感来源
- [LiteLLM](https://github.com/BerriAI/litellm) - LLM 代理参考
- [Bulletproof React](https://github.com/alan2207/bulletproof-react) - 架构模式参考
