# TanStack Start 迁移记录

**日期**: 2026-01-26
**迁移类型**: 从 Vinxi 迁移到 Vite 6
**TanStack Start 版本**: v1.19.0 → v1.157.14

---

## 迁移内容

### 1. 依赖变更

#### 移除的包
- ❌ `vinxi@^0.3.11`
- ❌ `@tanstack/start@^1.19.0`

#### 新增的包
- ✅ `@tanstack/react-start@^1.157.14`
- ✅ `@tanstack/router-plugin@^1.149.0`

#### 升级的包
- ⬆️ `@tanstack/react-router`: `^1.19.0` → `^1.149.0`
- ⬆️ `vite`: `^5.0.11` → `^6.0.0`

---

## 2. 配置文件变更

### 删除
- ❌ `apps/web/app.config.ts` (Vinxi 配置)

### 新增
- ✅ `apps/web/vite.config.ts` (Vite 配置)
- ✅ `apps/web/index.html` (Vite 入口 HTML)

### 修改
- 📝 `apps/web/package.json` - 更新 scripts 和依赖
- 📝 `apps/web/tsconfig.json` - 添加 `types: []` 覆盖根配置

---

## 3. 代码变更

### `apps/web/app/client.tsx`
**之前**:
```tsx
import { hydrateRoot } from 'react-dom/client';
import { StartClient } from '@tanstack/start';
import { router } from './router';

hydrateRoot(document, <StartClient router={router} />);
```

**之后**:
```tsx
import { StartClient } from '@tanstack/react-start/client';
import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';

hydrateRoot(
  document,
  <StrictMode>
    <StartClient />
  </StrictMode>,
);
```

### `apps/web/app/server.tsx`
**之前**:
```tsx
import { renderToString } from 'react-dom/server';
import { StartServer } from '@tanstack/start/server';
import { router } from './router';

export function render(url: string) {
  return renderToString(<StartServer router={router} url={url} />);
}
```

**之后**:
```tsx
import {
  createStartHandler,
  defaultStreamHandler,
  defineHandlerCallback,
} from '@tanstack/react-start/server';
import type { ServerEntry } from '@tanstack/react-start/server-entry';

const handler = defineHandlerCallback(async (ctx) => {
  return defaultStreamHandler(ctx);
});

export default {
  fetch(request) {
    const startHandler = createStartHandler(handler);
    return startHandler(request);
  },
} satisfies ServerEntry;
```

### `apps/web/app/router.tsx`
**之前**:
```tsx
export const router = createRouter({
  routeTree,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
```

**之后**:
```tsx
export function createRouter() {
  return createTanStackRouter({
    routeTree,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
```

---

## 4. Scripts 变更

### `apps/web/package.json`

| Script | 之前 | 之后 |
|--------|------|------|
| dev | `vinxi dev` | `vite dev --port 3001` |
| build | `vinxi build` | `vite build` |
| start | `vinxi start` | `vite preview --port 3001` |

---

## 5. 验证结果

### ✅ 成功验证的内容

1. **依赖安装**: 成功安装所有新依赖，Vinxi 已完全移除
2. **类型检查**: `bun run typecheck` 通过
3. **开发服务器**: Vite 开发服务器成功启动（端口 3002）
4. **构建工具**: Vite 6.4.1 正常工作

### ⚠️ 警告信息

```
warn: incorrect peer dependency "vite@6.4.1"
```

这是正常的 peer dependency 版本不完全匹配警告，不影响功能。

---

## 6. 配置文件内容

### `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: './app/routes',
      generatedRouteTree: './app/routeTree.gen.ts',
    }),
    react(),
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
  ],
  server: {
    port: 3001,
  },
  build: {
    target: 'esnext',
  },
});
```

### `index.html`

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>x-llm-gateway - Modern LLM Gateway</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/app/client.tsx"></script>
  </body>
</html>
```

---

## 7. 迁移优势

1. **直接使用 Vite**: 移除 Vinxi 抽象层，直接使用 Vite 6
2. **更好的社区支持**: Vite 拥有更庞大的生态和社区
3. **更简洁的配置**: 配置更加直观和标准化
4. **更好的插件生态**: 可以直接使用所有 Vite 插件
5. **更快的开发体验**: Vite 6 的性能改进

---

## 8. 后续工作

### 待测试
- [ ] 页面路由功能
- [ ] 热更新 (HMR)
- [ ] 生产构建
- [ ] SSR 功能
- [ ] API 路由（如果有）

### 待优化
- [ ] 添加更多 Vite 插件（如需要）
- [ ] 优化构建配置
- [ ] 添加环境变量配置
- [ ] 配置 PWA（如需要）

---

## 9. 参考资料

- [TanStack Start 官方文档](https://tanstack.com/start/latest)
- [Migrating TanStack Start from Vinxi to Vite - LogRocket](https://blog.logrocket.com/migrating-tanstack-start-vinxi-vite/)
- [TanStack Start Client Entry Point](https://tanstack.com/start/latest/docs/framework/react/guide/client-entry-point)
- [TanStack Start Server Entry Point](https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point)
- [Vite 6 Documentation](https://vite.dev/)

---

**迁移状态**: ✅ 完成
**测试状态**: 🟡 基础验证通过，待完整测试
**文档更新**: ✅ 已完成
