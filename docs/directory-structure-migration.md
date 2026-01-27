# 目录结构调整更新说明

## 更新日期
2026-01-26

## 变更概述

将项目从分散的目录结构调整为使用 `src/` 目录组织的标准 Next.js 项目结构。

## 变更详情

### 1. 目录移动

| 原路径 | 新路径 | 说明 |
|--------|--------|------|
| `app/` | `src/app/` | Next.js App Router 页面 |
| `components/` | `src/components/` | React 组件 |
| `middleware.ts` | `src/middleware.ts` | Next.js 中间件 |
| `app.config.ts` | ❌ 已删除 | TanStack Start 配置文件（不再需要） |

### 2. 配置文件更新

#### tsconfig.json
```diff
  "compilerOptions": {
    "paths": {
-     "@/*": ["./*"],
+     "@/*": ["./src/*"],
    }
  },
- "include": ["app/**/*", "next-env.d.ts", ".next/types/**/*.ts", "middleware.ts"],
+ "include": ["src/**/*", "next-env.d.ts", ".next/types/**/*.ts"],
```

#### tailwind.config.js
```diff
  export default {
-   content: ['./app/**/*.{ts,tsx}'],
+   content: ['./src/**/*.{ts,tsx}'],
  }
```

### 3. 导入路径更新

#### src/app/api/[...path]/route.ts
```diff
- import { apiApp } from '../../../src/api';
+ import { apiApp } from '@/api';
```

### 4. 最终目录结构

```
apps/web/
├── src/                    ← 所有源代码都在这里
│   ├── app/               ← 前端页面
│   ├── components/        ← React 组件
│   ├── features/          ← API 功能模块
│   ├── middleware/        ← Hono 中间件
│   ├── lib/              ← 工具库
│   ├── api.ts            ← API 入口
│   └── middleware.ts     ← Next.js 中间件
├── next.config.mjs
├── tsconfig.json
├── tailwind.config.js
└── package.json
```

## 验证结果

### ✅ TypeScript 检查
```bash
$ bun run typecheck
✓ 通过，无错误
```

### ✅ 生产构建
```bash
$ bun run build
✓ 构建成功

Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /admin/dashboard
├ ○ /admin/login
├ ○ /admin/models
├ ○ /admin/providers
├ ƒ /api/[...path]
└ ○ /test-api
```

### ✅ 开发服务器
```bash
$ bun run dev
✓ 启动成功，监听端口 3000
✓ Tailwind CSS 正常工作（无警告）
```

## 优势

### 1. 更清晰的项目结构
- 所有源代码集中在 `src/` 目录
- 配置文件和源代码分离
- 易于理解和维护

### 2. 更好的 IDE 支持
- IDE 可以更好地识别项目结构
- 自动导入建议更准确
- 路径别名 `@/*` 更直观

### 3. 更标准的 Next.js 实践
- 遵循 Next.js 官方推荐的项目结构
- 便于团队协作
- 易于新成员上手

### 4. 更好的工具集成
- Tailwind CSS 扫描路径更精确
- TypeScript 配置更简洁
- 构建工具配置更清晰

## 影响范围

### ✅ 无需修改
- 所有 API 代码（`src/features/`、`src/api.ts`）
- 所有页面组件功能
- 所有业务逻辑
- 环境变量配置
- 数据库配置

### ✅ 自动处理
- TypeScript 路径解析（通过 `tsconfig.json` 配置）
- Tailwind CSS 样式扫描（通过 `tailwind.config.js` 配置）
- Next.js 路由系统（自动检测 `src/app/` 目录）

### ⚠️ 需要注意
- 如果有自定义脚本引用了旧路径，需要更新
- 如果有外部工具配置了旧路径，需要更新

## 迁移步骤总结

1. ✅ 移动目录：`app/` → `src/app/`
2. ✅ 移动目录：`components/` → `src/components/`
3. ✅ 移动文件：`middleware.ts` → `src/middleware.ts`
4. ✅ 删除文件：`app.config.ts`（TanStack Start 配置）
5. ✅ 更新配置：`tsconfig.json`
6. ✅ 更新配置：`tailwind.config.js`
7. ✅ 更新导入：`src/app/api/[...path]/route.ts`
8. ✅ 验证构建
9. ✅ 验证开发服务器

## 后续建议

1. **更新文档**: 确保所有项目文档反映新的目录结构
2. **通知团队**: 告知团队成员目录结构变更
3. **更新脚本**: 检查并更新任何自定义脚本中的路径引用
4. **CI/CD 配置**: 确认 CI/CD 配置无需更新（通常无需更改）

## 总结

目录结构调整已成功完成，所有测试通过。项目现在使用标准的 Next.js `src/` 目录结构，代码组织更加清晰，维护更加便利。
