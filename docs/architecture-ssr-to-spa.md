# 架构调整：从 SSR 到 SPA

**日期**: 2026-01-26
**原因**: 修复 `AsyncLocalStorage is not a constructor` 错误

---

## 问题背景

用户访问 `/admin/login` 时遇到错误：
```
TypeError: import_node_async_hooks.AsyncLocalStorage is not a constructor
```

这个错误是因为 TanStack Start 的 SSR 模式在浏览器环境中尝试使用 Node.js 专有的 `async_hooks` 模块导致的。

---

## 架构变更

### 之前（SSR 模式）

```
统一端口 3000
├── TanStack Start SSR
│   ├── server.tsx (服务端渲染 + API 路由)
│   └── client.tsx (客户端 hydration)
└── Hono API (集成到 server.tsx)
```

**问题**:
- TanStack Start 1.149.0 + Vite 6 的 SSR 配置复杂
- Node.js 模块在浏览器环境中报错
- 开发体验不佳

### 现在（SPA 模式）

```
前端：Vite + React SPA (端口 3000)
├── TanStack Router (纯客户端路由)
├── React 19 (纯客户端渲染)
└── 代理 /api -> http://localhost:3001

后端：Hono API (端口 3001)
├── JWT 认证
├── 供应商管理 API
├── 模型管理 API
└── 其他 API
```

**优势**:
- ✅ 配置简单，易于调试
- ✅ 前后端完全分离
- ✅ 开发时热更新更快
- ✅ 避免了 SSR 相关的复杂性
- ✅ 符合传统 SPA + API 的架构模式

---

## 变更文件

### 1. `apps/web/app/client.tsx`

```typescript
// 之前：SSR hydration
import { StartClient } from '@tanstack/react-start/client';
import { hydrateRoot } from 'react-dom/client';

hydrateRoot(document, <StartClient />);

// 现在：纯 SPA 渲染
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';
import { routeTree } from './routeTree.gen';

const router = createRouter({ routeTree });
const rootElement = document.getElementById('root')!;
const root = createRoot(rootElement);
root.render(<RouterProvider router={router} />);
```

### 2. `apps/web/vite.config.ts`

```typescript
// 添加 API 代理
server: {
  port: 3000,
  proxy: {
    '/api': {
      target: 'http://localhost:3001',
      changeOrigin: true,
    },
  },
}
```

### 3. `apps/web/server.ts` (新增)

独立的 API 服务器入口：

```typescript
import { apiApp } from './app/server/api';

export default {
  port: 3001,
  fetch: apiApp.fetch,
};
```

### 4. `apps/web/package.json`

更新开发脚本：

```json
{
  "scripts": {
    "dev": "bun run dev:api & bun run dev:web",
    "dev:web": "vite dev --port 3000",
    "dev:api": "bun run server.ts"
  }
}
```

---

## 开发工作流

### 启动开发服务器

```bash
cd apps/web
bun run dev
```

这会同时启动：
1. API 服务器（端口 3001）
2. 前端开发服务器（端口 3000，自动代理 /api 到 3001）

### 访问应用

- 前端：http://localhost:3000
- 登录页面：http://localhost:3000/admin/login
- 管理后台：http://localhost:3000/admin/dashboard
- API 文档：http://localhost:3001/api

### 单独启动

如果需要单独启动：

```bash
# 只启动前端
bun run dev:web

# 只启动 API（需要先启动前端才能代理）
bun run dev:api
```

---

## 生产部署

生产环境的部署策略需要调整：

### 选项 1：分离部署（推荐）

```
前端（Nginx + 静态文件）
└── 反向代理 /api -> API 服务器

API 服务器（Bun）
└── 运行 server.ts
```

### 选项 2：单一服务器

创建一个统一的生产服务器：

```typescript
// production-server.ts
import { apiApp } from './app/server/api';
import { serveStatic } from 'hono/bun';

const app = new Hono();

// API 路由
app.route('/api', apiApp);

// 静态文件
app.use('/*', serveStatic({ root: './dist' }));

// SPA fallback
app.get('*', serveStatic({ path: './dist/index.html' }));

export default {
  port: 3000,
  fetch: app.fetch,
};
```

---

## 技术栈对比

### 之前

- 🔴 TanStack Start (SSR)
- 🔴 Vinxi → Vite 6 (迁移中)
- 🔴 Hono 集成到 SSR
- 🔴 复杂的构建配置

### 现在

- ✅ TanStack Router (纯客户端)
- ✅ Vite 6 (标准配置)
- ✅ Hono 独立运行
- ✅ 简单的开发/构建流程

---

## 性能影响

| 指标 | SSR 模式 | SPA 模式 |
|------|---------|----------|
| 首屏加载（首次） | 更快（服务端渲染） | 稍慢（需要下载JS） |
| 首屏加载（缓存后） | 快 | 很快 |
| 路由切换 | 需要服务端请求 | 即时（客户端） |
| SEO | 更好 | 一般（可用预渲染） |
| 开发体验 | 复杂 | 简单 |
| 部署复杂度 | 高 | 低 |

**结论**: 对于管理后台应用，SPA 模式更合适，因为：
- 不需要 SEO
- 用户需要登录后才能访问
- 更重视开发体验和维护成本

---

## 待办事项

- [ ] 更新部署文档
- [ ] 添加生产构建脚本
- [ ] 配置静态资源服务
- [ ] 优化构建产物大小
- [ ] 添加路由懒加载

---

## 相关文档

- [Vinxi 到 Vite 迁移](./migration-vinxi-to-vite.md)
- [统一端口架构](./unified-port-architecture.md)
- [Phase 2 进度](./phase-2-progress.md)

---

**文档版本**: 1.0
**最后更新**: 2026-01-26
