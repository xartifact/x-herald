# @xartifact/x-herald-web — Web SPA 管理界面

> 新一代管理界面 SPA，逐步取代 `apps/web` 中的 Admin 页面。

## 技术栈

- React 19 + TanStack Router (文件路由)
- TanStack Query v5 (服务端状态管理)
- `@xartifact/x-herald-ui` (shadcn/ui 组件库)
- TailwindCSS v4

## 开发

```bash
# 启动开发服务器（需在 monorepo 根目录）
bun run dev

# 或直接在此目录
cd apps/web && bunx @tanstack/router-devtools
```

## 管理员页面覆盖情况

| 页面                         | 路由                     | 状态                                                             |
| ---------------------------- | ------------------------ | ---------------------------------------------------------------- |
| Dashboard（概览统计）        | `/admin`                 | ✅ 已完成 — 接入 3 个实时 API（providers / model-groups / keys） |
| Providers（服务商管理）      | `/admin/providers`       | ✅                                                               |
| Model Groups（模型组管理）   | `/admin/model-groups`    | ✅ 已完成 — 完整 CRUD（创建/编辑/删除/启用切换），Dialog 表单    |
| Virtual Models（虚拟模型）   | `/admin/model-routes`    | ✅ (合并路由)                                                    |
| Model Routes（路由规则）     | `/admin/model-routes`    | ✅                                                               |
| Keys（虚拟密钥）             | `/admin/keys`            | ✅                                                               |
| Logs（请求日志）             | `/admin/logs`            | ✅                                                               |
| Client Models（客户端模型）  | `/admin/client-models`   | ✅                                                               |
| Settings（配置导入/导出）    | `/admin/settings`        | ✅                                                               |
| Circuit Breaker（熔断器）    | `/admin/circuit-breaker` | ✅                                                               |
| Access Models（访问模型）    | `/admin/access-models`   | ✅                                                               |
| Provider Stats（服务商统计） | `/admin/provider-stats`  | ✅                                                               |
| Metrics（性能指标）          | `/admin/metrics`         | ✅                                                               |

## API 通信

所有管理 API 请求通过反向代理（Vite dev server 或生产部署的反向代理）转发至后端 `/api/*`。使用 TanStack Query 管理请求缓存和自动失效。
