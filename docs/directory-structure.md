# 项目目录结构说明

## 概述

项目采用标准的 Next.js 项目结构，所有源代码都组织在 `src/` 目录下。

## 目录结构

```
apps/web/
├── src/
│   ├── app/                    # Next.js App Router 页面
│   │   ├── admin/             # 管理后台页面
│   │   │   ├── layout.tsx     # 管理后台布局（带认证验证）
│   │   │   ├── login/         # 登录页
│   │   │   ├── dashboard/     # 仪表板
│   │   │   ├── providers/     # 供应商管理
│   │   │   └── models/        # 模型管理
│   │   ├── api/               # API 路由
│   │   │   └── [...path]/     # Hono API 代理
│   │   ├── test-api/          # API 测试页
│   │   ├── styles/            # 全局样式
│   │   │   └── globals.css
│   │   ├── layout.tsx         # 根布局
│   │   └── page.tsx           # 首页
│   │
│   ├── components/            # React 组件
│   │   └── admin/             # 管理后台组件
│   │       └── AdminNav.tsx   # 导航组件
│   │
│   ├── features/              # API 功能模块
│   │   ├── auth/              # 认证功能
│   │   ├── health/            # 健康检查
│   │   ├── models/            # 模型管理 API
│   │   └── providers/         # 供应商管理 API
│   │
│   ├── middleware/            # Hono 中间件
│   │   ├── auth.ts            # 认证中间件
│   │   ├── cors.ts            # CORS 中间件
│   │   ├── error.ts           # 错误处理中间件
│   │   └── logger.ts          # 日志中间件
│   │
│   ├── lib/                   # 工具库
│   │   └── logger.ts          # 日志工具
│   │
│   ├── api.ts                 # Hono API 入口
│   └── middleware.ts          # Next.js 中间件（路由守卫）
│
├── next.config.mjs            # Next.js 配置
├── tsconfig.json              # TypeScript 配置
├── tailwind.config.js         # Tailwind CSS 配置
├── postcss.config.js          # PostCSS 配置
└── package.json               # 项目依赖

```

## 路径别名

在 `tsconfig.json` 中配置了以下路径别名：

```json
{
  "@/*": ["./src/*"],
  "@x-llm-gateway/shared": ["../../packages/shared/src"]
}
```

### 使用示例

```typescript
// 导入组件
import AdminNav from '@/components/admin/AdminNav';

// 导入 API
import { apiApp } from '@/api';

// 导入工具
import logger from '@/lib/logger';

// 导入共享包
import { Something } from '@x-llm-gateway/shared';
```

## 前端页面 (src/app/)

### 公开页面
- `/` - 首页 (`src/app/page.tsx`)
- `/test-api` - API 测试页 (`src/app/test-api/page.tsx`)

### 管理后台页面（需要认证）
- `/admin/login` - 登录页
- `/admin/dashboard` - 仪表板
- `/admin/providers` - 供应商管理
- `/admin/models` - 模型管理

## API 路由 (src/api.ts + src/features/)

所有 `/api/*` 请求通过 `src/app/api/[...path]/route.ts` 代理到 Hono API。

### API 端点
- `GET /api` - API 根路由
- `GET /api/health` - 健康检查
- `POST /api/auth/login` - 登录
- `GET /api/auth/me` - 获取当前用户信息
- `GET /api/providers` - 获取供应商列表
- `POST /api/providers` - 创建供应商
- `DELETE /api/providers/:id` - 删除供应商
- `GET /api/models` - 获取模型列表
- `POST /api/models` - 创建模型
- `DELETE /api/models/:id` - 删除模型

## 认证流程

1. **路由守卫（第一层）**: `src/middleware.ts`
   - 检查访问 `/admin/*`（除 `/admin/login` 外）的请求
   - 验证 cookie 中的 `admin_token`
   - 无 token 则重定向到登录页

2. **客户端验证（第二层）**: `src/app/admin/layout.tsx`
   - 在客户端完整验证 token 有效性
   - 调用 `/api/auth/me` 验证 token
   - 显示加载状态
   - 验证失败则清除 token 并重定向

## 样式系统

- **框架**: Tailwind CSS 3.4
- **全局样式**: `src/app/styles/globals.css`
- **配置**: `tailwind.config.js`
- **扫描路径**: `src/**/*.{ts,tsx}`

## 关键配置说明

### next.config.mjs
```javascript
const nextConfig = {
  reactStrictMode: true,
  turbopack: {},  // 启用 Turbopack
};
```

### tsconfig.json
- `baseUrl: "."` - 相对于项目根目录
- `paths` - 路径别名配置
- `include: ["src/**/*"]` - 包含所有 src 目录文件

### tailwind.config.js
- `content: ['./src/**/*.{ts,tsx}']` - 扫描 src 目录下的所有 TS/TSX 文件

## 开发命令

```bash
# 开发模式
bun run dev

# 类型检查
bun run typecheck

# 生产构建
bun run build

# 启动生产服务器
bun run start
```

## 优势

1. **清晰的结构**: 所有源代码集中在 `src/` 目录
2. **前后端分离**:
   - 前端页面: `src/app/`
   - API 服务: `src/api.ts` + `src/features/`
3. **易于导航**: 使用路径别名 `@/*`
4. **类型安全**: TypeScript 配置覆盖所有源代码
5. **样式隔离**: Tailwind 只扫描 src 目录
6. **模块化**: 功能按模块组织（features、components、middleware）

## 注意事项

1. **API 懒加载**: `src/api.ts` 使用懒加载模式，避免构建时执行配置验证
2. **动态路由**: API 路由标记为 `export const dynamic = 'force-dynamic'`
3. **中间件弃用警告**: Next.js 16 建议使用 "proxy" 替代 "middleware"（不影响功能）
