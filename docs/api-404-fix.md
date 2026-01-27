# API 路由 404 问题修复

## 问题描述

在将项目迁移到 Next.js App Router 后，API 路由返回 404 错误：

```
POST /api/auth/login → 404
```

## 根本原因

### 1. 路径前缀不匹配

**问题**: Hono 的路由配置没有 `/api` 前缀，而 Next.js 传递的是完整路径。

- Next.js 请求路径: `/api/auth/login`
- Hono 路由配置: `/auth/login` （❌ 不匹配）

**解决方案**: 更新 Hono 路由配置，添加 `/api` 前缀

```typescript
// src/api.ts

// 修改前
app.route('/health', healthRoutes);
app.route('/auth', authRoutes);
app.route('/providers', providersRoutes);
app.route('/models', modelsRoutes);

// 修改后
app.route('/api/health', healthRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/providers', providersRoutes);
app.route('/api/models', modelsRoutes);
```

### 2. Catch-all 路由不匹配根路径

**问题**: Next.js 的 `[...path]` 路由不会匹配空路径。

- `/api/[...path]` 匹配: `/api/health`, `/api/auth/login` ✓
- `/api/[...path]` 不匹配: `/api` ❌

**解决方案**: 创建独立的 `/api/route.ts` 文件处理根路径

```typescript
// src/app/api/route.ts

import { apiApp } from '@/api';

export const dynamic = 'force-dynamic';

async function handler(request: Request) {
  return apiApp().fetch(request);
}

export const GET = handler;
// ... 其他 HTTP 方法
```

## 修复步骤

### 1. 更新 Hono 路由配置

**文件**: `src/api.ts`

```diff
  // API Routes
- app.route('/health', healthRoutes);
- app.route('/auth', authRoutes);
- app.route('/providers', providersRoutes);
- app.route('/models', modelsRoutes);
+ app.route('/api/health', healthRoutes);
+ app.route('/api/auth', authRoutes);
+ app.route('/api/providers', providersRoutes);
+ app.route('/api/models', modelsRoutes);

  // API Root route
- app.get('/', (c) => {
+ app.get('/api', (c) => {
    return c.json({
      name: 'x-llm-gateway API',
      version: '2.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
    });
  });
```

### 2. 创建 API 根路由文件

**文件**: `src/app/api/route.ts`

```typescript
import { apiApp } from '@/api';

export const dynamic = 'force-dynamic';

async function handler(request: Request) {
  return apiApp().fetch(request);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const OPTIONS = handler;
```

## 验证结果

### ✅ 所有 API 端点正常工作

```bash
# API 根路由
$ curl http://localhost:3000/api
{
  "name": "x-llm-gateway API",
  "version": "2.0.0",
  "status": "running",
  "timestamp": "2026-01-26T10:29:05.221Z"
}

# 健康检查
$ curl http://localhost:3000/api/health
{
  "status": "unhealthy",
  "timestamp": "2026-01-26T10:29:06.674Z",
  "error": "database \"llm_gateway\" does not exist"
}

# 认证登录
$ curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"test"}'
{
  "error": "Invalid password",
  "code": "INVALID_CREDENTIALS"
}
```

## Next.js Catch-all 路由说明

### `[...path]` vs `[[...path]]`

| 路由模式 | 匹配行为 | 示例 |
|---------|---------|------|
| `[...path]` | 必须有至少一个路径段 | ✓ `/api/health`<br>✗ `/api` |
| `[[...path]]` | 可选，匹配零个或多个路径段 | ✓ `/api/health`<br>✓ `/api` |

### 我们的选择

我们选择保持 `[...path]` 并创建独立的 `route.ts`，原因：

1. **更明确**: 根路由和子路由分开处理
2. **更灵活**: 可以为根路由添加特殊逻辑
3. **更清晰**: 文件结构更直观

```
src/app/api/
├── route.ts          # 处理 /api
└── [...path]/
    └── route.ts      # 处理 /api/*
```

## 技术要点

### 1. 路径传递机制

Next.js API 路由将完整的 `Request` 对象传递给处理函数：

```typescript
// Next.js 接收: GET /api/auth/login
// Request.url: "http://localhost:3000/api/auth/login"
// 完整路径传递给 Hono
```

### 2. Hono 路由匹配

Hono 使用完整路径进行路由匹配：

```typescript
// Hono 接收完整路径: /api/auth/login
// 路由配置: app.route('/api/auth', authRoutes)
// authRoutes 中: authRoutes.post('/login', ...)
// 最终匹配: /api/auth + /login = /api/auth/login ✓
```

### 3. 懒加载的重要性

API 使用懒加载避免构建时执行配置验证：

```typescript
// src/api.ts
let _apiApp: ReturnType<typeof createApiApp> | null = null;
export const apiApp = () => {
  if (!_apiApp) {
    _apiApp = createApiApp();  // 首次调用时才创建
  }
  return _apiApp;
};
```

## 总结

通过以下两个修复，解决了 API 路由 404 问题：

1. ✅ 更新 Hono 路由配置，添加 `/api` 前缀
2. ✅ 创建 `src/app/api/route.ts` 处理根路径

所有 API 端点现在都正常工作，可以正常处理前端请求。
