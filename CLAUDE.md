# Claude

## 技术栈参考资料

- Hono.dev (v4.11.6)：https://hono.dev/llms.txt
- Next.js：https://nextjs.org/docs/llms.txt
- Shadcn/UI：https://ui.shadcn.com/llms.txt
- TailwindCSS v4
- React 19
- Bun.sh (v1.3.6)：https://bun.sh/llms.txt
- React Query(v5)

## 项目架构

- 项目基于 Next.js 和 Hono.dev
- Next.js 使用 App Router
- Hono 接管 Next.js API 路由

## 开发模式

**功能驱动的全栈同步开发**

- 每个功能同时完成前端和后端
- 完成一个功能后再开始下一个
- 快速迭代，边开发边测试
- 更快看到成果，更好的反馈循环

详细开发路线图：`docs/DEVELOPMENT-ROADMAP.md`

### 当前进度

| Phase | 功能 | 后端 | 前端 | 状态 |
|-------|------|------|------|------|
| 1 | 基础设施 | ✅ | ✅ | 已完成 |
| 2 | 供应商管理 | ✅ | 🔄 | 进行中 |
| 3 | 模型管理 | ✅ | 📋 | 规划中 |

## UI 组件规范

- **UI 框架**：使用 shadcn/ui (new-york 风格)
- **图标库**：lucide-react
- **表单管理**：react-hook-form + zod
- **Toast 通知**：sonner

### 已安装的 shadcn/ui 组件

基础组件：button, input, label, badge, separator
表单组件：form, checkbox, switch, select, textarea
布局组件：card, table, tabs, dialog, dropdown-menu
反馈组件：alert, sonner (toast)

### 添加新组件

```bash
bunx shadcn@latest add [component-name]
```

详细使用指南：`apps/web/SHADCN-UI-USAGE.md`

## 开发规范

- 不要创建总结文档
- 项目使用 Bun.sh，使用 Bun.sh 运行项目
- 代码使用 TypeScript 严格模式
- 前端使用 shadcn/ui 组件构建界面
- API 遵循 RESTful 规范
- 遵循 Bulletproof React 和 Clean Architecture
- 使用 React Query(v5) 完成请求
- 单组件不要超过300行代码，超过需要封装
- 单函数不要超过150行代码，超过需要封装
