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

## Server Component / Client Component 隔离

- **默认所有组件为 Server Component**，不写 `'use client'`
- 只有需要浏览器 API（`window`/`document`）、React Hooks（`useState`/`useEffect`）或事件监听时，才声明 `'use client'`
- **Client Component 禁止通过 props 接收未序列化的数据**（函数、class 实例、未转 ISO 字符串的 Date）

## 组件规范

- **Props 顶层字段不超过 5 个**。超过必须拆分子组件或使用 Context，禁止堆叠可选字段
- **禁止内联 Props 类型**（如 `({ name }: { name: string })`），必须提取为具名 interface
- 组件内逻辑（hooks、事件处理、数据转换）必须在 JSX 渲染区前完成
- 复杂逻辑超过 20 行必须提取为 Custom Hook 或纯函数工具

## Hooks 规范

- **一个 Custom Hook 只做一件事**。内部有 3 个以上 `useEffect` 即为上帝 Hook，必须拆分
- **`useEffect` 回调函数体不超过 15 行**；业务逻辑必须提取为具名函数，不得在 effect 内内联
- 禁止在 `useEffect` 中直接书写数据获取逻辑（见下方数据获取规范）

## 数据获取规范

- **禁止在 Client Component 中裸调 `fetch` 或任何 HTTP 客户端**
- 所有异步数据获取必须封装为具名 Custom Hook，使用 React Query v5
- Hook 必须包含语义化 `queryKey`，以及适当的 `staleTime` / `gcTime`

```typescript
// ❌ 禁止
useEffect(() => {
  fetch('/api/user')
    .then((r) => r.json())
    .then(setUser)
}, [])

// ✅ 必须封装为 Hook
function useUser(userId: string) {
  return useQuery({
    queryKey: ['user', userId],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}`)
      if (!res.ok) throw new Error('Failed to fetch user')
      return UserSchema.parse(await res.json())
    },
    staleTime: 60_000,
  })
}
```

## 表单与校验

- 表单必须使用 react-hook-form + zod 进行校验
- Toast 通知统一使用 sonner
- 所有页面使用 TypeScript，表单 Schema 必须显式声明类型
