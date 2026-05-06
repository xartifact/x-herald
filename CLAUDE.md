# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

x-llm-gateway 是现代化的 LLM Gateway 项目，支持协议转换、智能路由和高可用性。基于 Next.js + Hono 的 Monorepo 架构。

第一原则： 这是一个透明代理

## 核心命令

### 开发
```bash
bun install              # 安装所有依赖
bun run dev             # 启动开发服务器 (http://localhost:3000)
bun run dev:web         # 同上，明确指定 web 应用
```

### 构建和类型检查
```bash
bun run build           # 构建生产版本
bun run typecheck       # 运行 TypeScript 类型检查
bun run lint            # 运行 ESLint
bun run format          # 格式化代码 (Prettier)
```

### 数据库
```bash
cd apps/web
bun run db:generate     # 生成数据库迁移
bun run db:migrate      # 运行数据库迁移
bun run db:push         # 直接推送 schema 更改（开发用）
bun run db:studio       # 打开 Drizzle Studio
```

## 项目架构

### Monorepo 结构
```
x-llm-gateway/
├── apps/
│   └── web/                    # Next.js + Hono 全栈应用
│       ├── src/
│       │   ├── app/            # Next.js App Router (前端页面)
│       │   │   ├── admin/      # 管理界面
│       │   │   ├── api/        # Hono API 路由
│       │   │   └── page.tsx    # 首页
│       │   ├── components/     # 共享 React 组件
│       │   ├── core/           # 核心业务逻辑
│       │   ├── features/       # 按功能划分的模块
│       │   ├── hooks/          # React Hooks
│       │   ├── lib/            # 工具库
│       │   ├── types/          # TypeScript 类型定义
│       │   └── ui/             # shadcn/ui 组件
│       └── drizzle/            # 数据库 schema 和迁移
└── docs/                       # 项目文档
```

### 技术栈

**后端**
- Runtime: Bun 1.3.6+
- 框架: Hono 4.0+ (轻量级，接管 Next.js API 路由)
- 数据库: PostgreSQL 16
- ORM: Drizzle ORM 0.45+
- 认证: JWT
- 日志: Pino

**前端**
- 框架: Next.js 16+ (App Router)
- UI: React 19
- 组件库: shadcn/ui (new-york 风格)
- 样式: TailwindCSS v4
- 数据获取: React Query v5
- 表单: react-hook-form + zod
- 图标: lucide-react
- Toast: sonner

### 架构特点

1. **Hono 接管 API 路由**：所有 API 请求由 Hono 处理 (`/api/*`)
2. **Next.js App Router**：前端页面使用 App Router
3. **功能驱动开发**：按功能模块组织代码，每个功能同时完成前后端
4. **Clean Architecture**：业务逻辑与框架解耦

## 代码组织

### 前端代码结构（Bulletproof React 风格）

```
src/
├── app/                    # Next.js 路由
├── components/             # 共享组件
├── features/               # 功能模块（按领域划分）
│   ├── providers/          # 供应商管理
│   ├── models/             # 模型管理
│   └── keys/               # 密钥管理
├── hooks/                  # 共享 Hooks
├── lib/                    # 工具函数
├── types/                  # TypeScript 类型
└── ui/                     # shadcn/ui 组件
```

### 后端代码结构

```
src/
├── app/api/                # Hono API 路由
│   ├── [[...route]]/       # Catch-all 路由
│   └── route.ts            # Hono 应用入口
└── core/                   # 核心业务逻辑
    ├── config/             # 配置管理
    ├── db/                 # 数据库连接和 schema
    └── middleware/         # Hono 中间件
```

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
- 数据获取使用 React Query v5

已安装的 shadcn/ui 组件：
- 基础：button, input, label, badge, separator
- 表单：form, checkbox, switch, select, textarea
- 布局：card, table, tabs, dialog, dropdown-menu
- 反馈：alert, sonner

添加新组件：
```bash
bunx shadcad@latest add [component-name]
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

**当前进度**：
| Phase | 功能 | 后端 | 前端 | 状态 |
|-------|------|------|------|------|
| 1 | 基础设施 | ✅ | ✅ | 已完成 |
| 2 | 供应商管理 | ✅ | 🔄 | 进行中 |
| 3 | 模型组管理 | ✅ | 📋 | 规划中 |

详见：`docs/DEVELOPMENT-ROADMAP.md`

## 关键文档

- `README.md` - 项目概览和快速开始
- `docs/DEVELOPMENT-ROADMAP.md` - 详细开发路线图
- `docs/unified-port-architecture.md` - 统一端口架构
- `apps/web/SHADCN-UI-USAGE.md` - UI 组件使用指南
- `.claude/rules/*.md` - 详细开发规范

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
- 模型系统使用新的 model_groups + model_instances（旧的 models + model_routes 已废弃）
- 参考资料链接：
  - Hono: https://hono.dev/llms.txt
  - Next.js: https://nextjs.org/docs/llms.txt
  - Shadcn/UI: https://ui.shadcn.com/llms.txt
  - Bun: https://bun.sh/llms.txt

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **x-llm-gateway** (3222 symbols, 5689 relationships, 162 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/x-llm-gateway/context` | Codebase overview, check index freshness |
| `gitnexus://repo/x-llm-gateway/clusters` | All functional areas |
| `gitnexus://repo/x-llm-gateway/processes` | All execution flows |
| `gitnexus://repo/x-llm-gateway/process/{name}` | Step-by-step execution trace |

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
