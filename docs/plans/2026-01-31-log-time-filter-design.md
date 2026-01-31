# 日志查询时间过滤功能设计

## 概述

为请求日志页面添加时间过滤功能，支持快捷时间范围选择和手动刷新。

## 功能需求

### 核心特性
1. **快捷时间范围选择器**：预设时间范围（最近 1 小时、24 小时、7 天、30 天、全部时间）
2. **混合交互模式**：快捷范围立即生效 + 手动刷新按钮
3. **集成设计**：所有过滤器在同一行，保持 UI 简洁

### 布局
```
[🔍 搜索框...] [状态 ▼] [时间范围 ▼] [🔄 刷新]
```

### 交互行为
- 选择快捷时间范围 → 立即触发查询
- 修改其他过滤条件 → 立即生效（保持现有行为）
- 点击刷新按钮 → 重新查询当前过滤条件的数据
- 统计卡片根据时间范围实时更新

## 组件结构

### 修改的组件

#### 1. LogSearchFilter 组件 (`log-search-filter.tsx`)
**新增 Props：**
- `timeRange: string` - 当前时间范围
- `onTimeRangeChange: (value: string) => void` - 时间范围变化回调
- `onRefresh: () => void` - 刷新按钮回调
- `isRefreshing?: boolean` - 刷新状态

**新增 UI 元素：**
- 时间范围下拉选择器（Select 组件）
- 刷新按钮（Button with RefreshCw icon）

#### 2. useLogPage Hook (`useLogPage.ts`)
**新增状态：**
- `timeRange: string` - 默认 `'all'`

**新增函数：**
- `handleTimeRangeChange(value: string)` - 处理时间范围变化
- `handleRefresh()` - 手动刷新数据
- `getTimeRange(range: string)` - 时间范围映射

**修改调用：**
- `useLogs()` - 添加 `startDate`/`endDate` 参数
- `useLogStats()` - 添加 `startDate`/`endDate` 参数

#### 3. LogsPage 组件 (`page.tsx`)
**新增传递的 Props：**
- `timeRange`
- `isRefreshing`
- `handleTimeRangeChange`
- `handleRefresh`

## 时间范围映射

### 选项定义
```typescript
const timeRangeOptions = [
  { value: 'all', label: '全部时间' },
  { value: '1h', label: '最近 1 小时' },
  { value: '24h', label: '最近 24 小时' },
  { value: '7d', label: '最近 7 天' },
  { value: '30d', label: '最近 30 天' },
];
```

### 映射逻辑
```typescript
const getTimeRange = (range: string) => {
  const now = new Date();
  switch (range) {
    case '1h': return { startDate: new Date(now.getTime() - 3600000).toISOString() };
    case '24h': return { startDate: new Date(now.getTime() - 86400000).toISOString() };
    case '7d': return { startDate: new Date(now.getTime() - 604800000).toISOString() };
    case '30d': return { startDate: new Date(now.getTime() - 2592000000).toISOString() };
    case 'all': return {};
    default: return {};
  }
};
```

## UI 细节

### 刷新按钮
- **图标**：`RefreshCw` (lucide-react)
- **状态**：加载中时显示旋转动画
- **样式**：`variant="outline"`, `size="icon"`
- **位置**：时间范围选择器右侧

### 响应式布局
```tsx
<div className="flex items-center gap-4 flex-wrap">
  {/* 搜索框 - 在小屏幕上占满宽 */}
  <div className="relative flex-1 min-w-[200px] max-w-md">...</div>

  {/* 过滤器组 - 自动换行 */}
  <div className="flex items-center gap-2">
    <Select value={statusFilter}>...</Select>
    <Select value={timeRange}>...</Select>
    <Button size="icon" onClick={onRefresh}>
      <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
    </Button>
  </div>
</div>
```

## 数据流

### 时间范围变化流程
```
用户选择时间范围
    ↓
handleTimeRangeChange() 更新状态
    ↓
useLogs() 自动检测参数变化
    ↓
React Query 发起新请求：GET /api/logs?startDate=xxx&endDate=xxx
    ↓
后端返回过滤后的数据
    ↓
UI 更新（日志列表 + 统计卡片）
```

### 手动刷新流程
```
用户点击刷新按钮
    ↓
handleRefresh() 调用 queryClient.invalidateQueries()
    ↓
强制重新获取当前过滤条件的数据
    ↓
UI 更新（显示加载状态）
```

## 边缘情况处理

1. **时间范围切换时的分页**：重置到第 1 页，避免空白页
2. **无数据情况**：显示 "该时间范围内没有日志记录"
3. **刷新失败**：Toast 提示错误，保持旧数据
4. **快速切换**：React Query 自动处理请求竞态
5. **URL 同步**：暂不实现，可后续添加

## 实现清单

### 需要修改的文件
- ✅ `apps/web/src/app/admin/logs/components/log-search-filter.tsx`
- ✅ `apps/web/src/app/admin/logs/useLogPage.ts`
- ✅ `apps/web/src/app/admin/logs/page.tsx`

### 后端
- ❌ 无需修改（已支持 `startDate`/`endDate` 参数）

## 用户体验优化

1. 选择时间范围后，页面自动回到第 1 页
2. 刷新时显示加载状态（按钮图标旋转）
3. 统计卡片实时更新以反映过滤后的数据
4. 保持现有的搜索和状态过滤行为不变
5. 前端过滤逻辑移除（完全依赖后端）

## 技术栈

- React Query v5 - 数据获取和缓存
- shadcn/ui - Select 和 Button 组件
- lucide-react - RefreshCw 图标
- TypeScript - 类型安全
