# 前端开发规范

## 技术栈
- 框架：Next.js (App Router)
- UI 库：shadcn/ui (new-york 风格)
- 样式：TailwindCSS v4
- React：v19
- 数据获取：React Query (v5)
- 表单：react-hook-form + zod

## UI 组件使用
- 基础组件：button, input, label, badge, separator
- 表单组件：form, checkbox, switch, select, textarea
- 布局组件：card, table, tabs, dialog, dropdown-menu
- 反馈组件：alert, sonner (toast)
- 图标库：lucide-react

## 添加新组件
```bash
bunx shadcn@latest add [component-name]
```

## 开发要求
- 所有页面使用 TypeScript
- 表单必须使用 zod 进行校验
- 异步操作使用 React Query
- Toast 通知统一使用 sonner
