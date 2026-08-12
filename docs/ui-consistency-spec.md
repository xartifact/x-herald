# UI 一致性设计规范

> 本规范是 x-herald 管理界面 UI 风格统一的**编码契约**。所有 UI 改动以本文件为准。
> 设计依据见 2026-08-03 全站 UI 一致性审计结论。

## 1. 设计令牌：语义色

### 1.1 新增令牌（`apps/web/app/styles/app.css`）

在现有 `@theme` / `:root` / `.dark` 中新增三组语义色令牌，与 `--destructive` 同级管理：

| 令牌                                 | light HSL                         | dark HSL（预留，dark mode 启用时生效） | 用途                      |
| ------------------------------------ | --------------------------------- | -------------------------------------- | ------------------------- |
| `--success` / `--success-foreground` | `142.1 76.3% 36.3%` / `0 0% 100%` | `142.1 70% 45%` / `142.1 80% 10%`      | 成功 / 良好 / 高成功率    |
| `--warning`                          | `35.5 91.6% 49.2%` / `0 0% 100%`  | `35.5 92% 50%` / `35.5 92% 15%`        | 警告 / 中等 / 待处理 / 慢 |
| `--info`                             | `221.2 83.2% 53.3%` / `0 0% 100%` | `221.2 83% 60%` / `221 83% 15%`        | 信息 / 中性强调 / TTFB    |

`@theme` 同步映射 `--color-success` / `--color-warning` / `--color-info`（与现有 `--color-destructive` 一致），从而支持 `bg-success` / `text-warning` / `border-info` 等工具类。

> **关键策略**：浅底容器一律用 `bg-success/10`（alpha 透明度），不定义 `-50` 之类的浅色档。同一色相 + alpha 让 light / dark 自动适配，dark mode 启用时零额外工作。

### 1.2 裸色 → 令牌映射规则

| 现状裸色                                               | 语义                     | 替换为                                                                |
| ------------------------------------------------------ | ------------------------ | --------------------------------------------------------------------- |
| `green-{500,600,700}`、`emerald-{600}`                 | 成功 / 良好              | `success`                                                             |
| `amber-{400,500,600,700}` **+** `yellow-{500,600,700}` | 警告 / 中等 / 待处理     | **统一** → `warning`                                                  |
| `red-{500,600,700,900}`                                | 失败 / 错误 / 严重       | `destructive`                                                         |
| `blue-{500,600,700,900}`                               | 信息 / 中性强调          | `info`                                                                |
| `gray-{50..900}`（中性文字/背景/边框）                 | 前景/次要/强调/背景/边框 | `foreground` / `muted-foreground` / `accent` / `bg-accent` / `border` |

**文字**：`text-success` / `text-warning` / `text-info` / `text-destructive`
**浅底容器**：`bg-success/10 border-success/20`（替代 `bg-green-50 border-green-200`）
**实心/进度条**：`bg-success`（替代 `bg-green-500`）

### 1.3 例外：视觉语言色（不令牌化）

- **Flow Editor 节点配色**（`flow-editor-constants.ts` + `nodes/*.tsx`）：按节点类型固定配色（请求入口=blue、目标=green、条件=amber、意图=violet、能力=cyan、拒绝=red、兜底=purple），内部自洽且与右侧 property-panel 一一对应，**保留不动**。
- **消息角色色**（`timeline-message-card-utils.ts`：user/assistant/system/tool）：保留为视觉语言，集中到一个 `roleColors` 常量映射，值统一到令牌：`user→info`、`assistant→primary`(紫)、`system→muted`、`tool→success`。
- **Cost 统计卡的装饰彩虹色**（`cost-summary-cards.tsx` 四张卡 emerald/blue/purple/orange）：非语义、仅装饰，**中性化**——图标统一 `text-muted-foreground`，数值统一 `text-foreground`，移除四色彩虹。仅在表达"好坏"语义时才着色（成功率/延迟阈值）。

## 2. 共享组件（`packages/ui/src/shared/components/`）

三个组件放在与 `status-toggle.tsx` / `ListPagination.tsx` 同级，从 `shared/index.ts` 导出。

### 2.1 `PageHeader`

统一全站页面标题，消除 3xl/2xl/xl 字号混用与 h1/h2 混用。

```tsx
interface PageHeaderProps {
  title: string
  description?: React.ReactNode // 标题下描述
  actions?: React.ReactNode // 右侧操作区（新建按钮等）
  icon?: React.ReactNode // 可选标题图标
}
```

渲染规范：

- 外层 `flex flex-col gap-4 md:flex-row md:items-center md:justify-between`
- 标题：`<h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">`
- 描述：`<p className="text-sm text-muted-foreground mt-1">`
- actions 右侧容器：`flex items-center gap-2`

迁移要求：所有页面主标题统一用 `<PageHeader>`，删除页面内手写的 `<h1>/<h2> + 描述 + flex justify-between` 三件套。

### 2.2 `StatCard`

统一 6+ 套并行统计卡实现。

```tsx
interface StatCardProps {
  title: string
  value: React.ReactNode
  icon?: React.ReactNode
  sub?: React.ReactNode // 副文本
  loading?: boolean // true → 数值位渲染 <Skeleton className="h-8 w-16">
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info' // 数值语义着色
}
```

渲染规范：

- `Card` + `CardHeader`（`flex items-center justify-between`，title `text-sm font-medium`，icon `text-muted-foreground`）
- `CardContent`：数值 `text-2xl font-bold`，`tone` 非 default 时叠加 `text-success/text-warning/text-destructive/text-info`；`loading` 时渲染 `<Skeleton className="h-8 w-16" />`
- `sub`：`text-xs text-muted-foreground mt-1`

迁移要求：`LogStatsCards` / `CostSummaryCards` / `MetricsSummaryCards` / `CircuitBreakerStatsCards` / `intent-logs StatCard` / `key-stats-sheet StatCard` 全部改基于共享 `StatCard`。

### 2.3 `EmptyState`

统一空状态 padding 与结构。

```tsx
interface EmptyStateProps {
  title?: string // 不传则按 searchQuery 推断（找不到 vs 还没有）
  description?: React.ReactNode
  icon?: React.ReactNode
  action?: React.ReactNode // "新建"按钮
  searchQuery?: string // 区分"搜索无结果"与"尚未创建"
}
```

渲染规范：

- `CardContent className="py-12 text-center space-y-4"`
- 默认文案：`searchQuery` 非空 → "没有找到匹配的结果"（无 action）；为空 → "还没有数据"
- 有 `action` 时渲染在文案下方

迁移要求：CRUD 页（providers/model-groups/keys/access-models）+ potential-models + provider-stats + 表格空行统一改用 `<EmptyState>`。

### 2.4 Loading 规范（非组件，全局约定）

| 场景                 | 规范                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------- |
| 卡片数值 loading     | `<StatCard loading>`（内部 Skeleton）或 `<Skeleton className="h-8 w-16">`               |
| 表格 loading         | Skeleton 行（沿用 `LogTableSkeleton` 模式）或 `<Loader2 className="animate-spin">` 居中 |
| 按钮内 loading       | `<Loader2 className="mr-2 h-4 w-4 animate-spin">`                                       |
| 页面/区块 loading    | 文案 "加载中..." 须搭配 `<Loader2 animate-spin>`，禁用纯文字加载                        |
| **禁用**自制 spinner | 删除 `border-b-2 border-purple-600` 等手搓 spinner，统一 `<Loader2>`                    |

## 3. 布局规范

| 项               | 规范                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 页面根容器       | `<div className="space-y-6">`（logs/intent-logs 等 `space-y-4` 统一为 `space-y-6`）                                     |
| routing-traces   | 去掉内层 `p-6`（`admin.tsx` layout 已有 `py-6 px-4`，避免双倍内边距）                                                   |
| 标题层级         | 全站 h1，禁用页面内 h2 作为主标题                                                                                       |
| 描述字号         | `text-sm text-muted-foreground mt-1`（统一，去掉 text-xs 变体）                                                         |
| admin.tsx 验证页 | spinner 改 `<Loader2 className="h-8 w-8 animate-spin text-primary">`，去掉 `bg-gray-50/border-purple-600/text-gray-600` |

## 4. 按钮规范

- 禁止用 `className` 覆盖 Button 背景色。语义红色按钮一律 `variant="destructive"`。
- `deploy-banner.tsx`：`className="bg-red-600 hover:bg-red-700"` → `variant="destructive"` 并删除覆盖类。

## 5. 原生 HTML 控件 vs shadcn 组件

页面级代码（`apps/web/app/routes/**/*.tsx`）**禁止使用原生 HTML 表单控件**，必须用 shadcn 对应组件：

| 原生 HTML（禁止）         | shadcn 替代（必须）                                                 |
| ------------------------- | ------------------------------------------------------------------- |
| `<button>`                | `<Button>`                                                          |
| `<input>`                 | `<Input>`                                                           |
| `<select>` / `<option>`   | `<Select>` / `<SelectTrigger>` / `<SelectContent>` / `<SelectItem>` |
| `<input type="checkbox">` | `<Checkbox>`                                                        |
| `<label>`（独立使用）     | `<Label>`                                                           |
| `<textarea>`              | `<Textarea>`                                                        |

> **教训**：routing-traces/index.tsx 曾用原生 `<input>`/`<select>`/`<input type=checkbox>`/`<button>` 做过滤器，而 logs 页用 shadcn Input/Select/Checkbox/Button —— 两个完全不同的 UI 语言。审计时必须检查此维度。

## 6. 多维度审计清单

页面"一致"的定义：通过以下 **全部 10 个维度**。只检查单一维度（如裸色）是不足的。

1. **令牌合规** — 无裸 Tailwind 调色板色
2. **组件复用** — 无原生 HTML 表单控件
3. **PageHeader** — 每个页面用共享 PageHeader
4. **StatCard** — 指标卡用共享 StatCard
5. **EmptyState** — 空状态用 EmptyState 或领域专用组件
6. **Loading 规范** — 无自制 spinner，统一 Loader2/Skeleton
7. **Button variant** — 无 className 覆盖背景色，语义红色用 destructive
8. **布局一致性** — 页面根 space-y-6，无双倍 padding
9. **描述字号** — text-sm text-muted-foreground mt-1
10. **工具函数去重** — formatDuration/formatTokens/CLIENT_REGISTRY 等不跨页面复制

## 7. 导航裸色令牌化

`AdminNav.tsx` / `nav-desktop-dropdowns.tsx` / `nav-mobile-section.tsx`：

- `text-gray-900` → `text-foreground`
- `text-gray-600 hover:text-gray-900` → `text-muted-foreground hover:text-foreground`
- `bg-gray-50` / `hover:bg-gray-100` / `bg-gray-200` → `bg-accent` / `hover:bg-accent`
- `text-white`（激活态）保留（配 `bg-primary`）

## 8. 实施顺序与切片

```
P0（inline 前置，所有迁移依赖）:
  1. app.css 语义色令牌
  2. PageHeader / StatCard / EmptyState 组件 + 导出
  3. typecheck 验证

P1（fan-out，按文件目录切片避免冲突）:
  4. 迁移标题/统计卡/空状态到共享组件
  5. 统一 loading 态
  6. 裸语义色 → 令牌

P2（收尾）:
  7. 容器间距/描述字号/routing-traces 双 padding
  8. 按钮 variant + nav 令牌化

验证:
  9. typecheck + lint + web build
```

切片按**文件目录边界**划分（非按改动类型），保证同一文件只在一个子代理内，避免并发编辑冲突。

## 9. 暂不处理（Roadmap Phase 4）

- **Dark mode**：令牌的 `.dark` 值**预先定义**（本规范 §1.1 已含），但 ThemeProvider / 切换按钮 / 全局启用**延期**，与 i18n 同期实现。
- **i18n**：当前中文硬编码，国际化延期。
- 两者已写入 `docs/superpowers/plans/2026-06-06-product-vision-and-roadmap.md` Phase 4。
