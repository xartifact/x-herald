# @x-llm-gateway/web — Next.js + Hono 全栈应用

> ⚠️ **已弃用 (Deprecated)**
>
> `apps/web` 中的管理界面功能已全部迁移至 `apps/tanstack` (TanStack Router SPA)。
> 新的管理界面开发请使用 `apps/tanstack`。
>
> `apps/web` 仍保留 Gateway API 后端路由（Hono）、Drizzle ORM 数据库迁移以及 Next.js 服务端渲染能力，仅管理前端部分已弃用。

## 保留的功能

- Gateway API 端点 (`/api/v1/*`)
- 管理 API 端点 (`/api/*`)
- PostgreSQL / PGlite 数据库迁移
- 服务端渲染 (SSR) 页面
- CLI 集成入口

## 迁移说明

迁移完成后，`apps/web` 中的以下文件可安全删除：

- `src/app/admin/*` — Admin 页面组件（已由 TanStack SPA 覆盖）
- `src/features/admin/*` — Admin 功能模块