# 日志详情界面重新设计

## 设计理念：技术监控仪表盘美学

受 Datadog、New Relic、Grafana 等 APM 工具启发，打造专业的技术监控界面。

### 设计原则
- **工业感**：精密仪器般的精确度
- **数据密度**：高信息密度但易读
- **视觉层次**：清晰的信息优先级

---

## 核心改进

### 1. 状态指示器 & 头部信息

```
┌─────────────────────────────────────────────────────┐
│ ✓ SUCCESS 200    POST                              │
│ gpt-4-turbo                                        │
│ 2026-01-31 14:23:45.123                            │
└─────────────────────────────────────────────────────┘
```

**特性：**
- 大号状态标签（绿色/红色）带图标
- HTTP 方法 Badge
- 等宽字体显示模型名
- 精确到毫秒的时间戳

---

### 2. 关键指标卡片网格

```
┌──────────┬──────────┬──────────┬──────────┐
│ 🕐 延迟  │ ⚡Token  │ 🖥️供应商│ 🔑密钥   │
│ 234ms    │ 1.2K     │ OpenAI   │ sk-xxx   │
│ (绿色)   │ ↑500 ↓700│ 流式传输 │          │
└──────────┴──────────┴──────────┴──────────┘
```

**特性：**
- 4 个核心指标卡片
- 图标 + 大写标签
- 颜色编码（延迟：绿/琥珀/红）
- Token 输入/输出分解
- Hover 效果 + 底部装饰线

**MetricCard 组件：**
- `variant`: default | success | error | warning
- 自动边框颜色和背景色
- 响应式网格布局（2列 → 4列）

---

### 3. 可折叠元数据区域

```
▶ 请求元数据
  ┌─────────────────────────────────────┐
  │ 请求路径:  /v1/chat/completions  [复制]│
  │ 客户端IP:  192.168.1.100         [复制]│
  │ 请求ID:   log_abc123...         [复制]│
  └─────────────────────────────────────┘

▼ 错误详情 (自动展开)
  ┌─────────────────────────────────────┐
  │ ⚠️ Rate limit exceeded             │
  │ 类型: RateLimitError                │
  └─────────────────────────────────────┘
```

**特性：**
- `CollapsibleSection` 组件
- 请求元数据默认折叠
- 错误详情自动展开（重要）
- 每个字段独立复制按钮
- 复制状态独立追踪

---

### 4. 请求/响应并排布局

```
┌──────────────────┬──────────────────┐
│ ↗ 请求 (Request) │ ↘ 响应 (Response)│
├──────────────────┼──────────────────┤
│ [Headers] [Body] │ [Headers] [Body] │
│                  │                  │
│ {蓝色微渐变背景}  │ {绿色微渐变背景}  │
│ Monaco Editor    │ Monaco Editor    │
│ JSON 高亮        │ JSON 高亮        │
└──────────────────┴──────────────────┘
```

**特性：**
- 方向图标（↗ ↘）
- 微妙的渐变背景（`from-blue-500/5` / `from-green-500/5`）
- 统一的 Tab 样式（`bg-muted/50`）
- 无数据时显示虚线边框占位符

---

## 视觉设计细节

### 颜色系统

**状态颜色：**
- 成功：`green-500`（柔和）
- 失败：`red-500`（警示）
- 警告：`amber-500`（注意）

**延迟颜色编码：**
- `< 1s`: 绿色
- `1-3s`: 琥珀色
- `> 3s`: 红色

**背景层次：**
- 主背景：`bg-background/95 backdrop-blur-xl`
- 卡片背景：`bg-card/30`
- 面板背景：`bg-muted/30`
- 渐变装饰：`from-transparent via-primary/30 to-transparent`

### 排版

**字体使用：**
- 数据值：`font-mono`（等宽字体）
- 标签：`uppercase tracking-wider`（大写加宽间距）
- 状态：`font-bold`（加粗强调）

**间距层次：**
- 卡片内边距：`p-3`
- 区域间距：`gap-3`
- 折叠区域：`px-4 py-3`

### 交互反馈

**Hover 效果：**
- 卡片：`hover:border-primary/50`
- 按钮：`hover:bg-accent/50`
- 过渡：`transition-all`

**复制按钮：**
- 独立状态追踪（`copiedField` state）
- 2秒自动恢复
- 图标切换（Copy ↔ Check）

---

## 代码组织

### 组件结构

```typescript
LogDetailSheet/
├── MetricCard         // 指标卡片组件
├── CollapsibleSection // 可折叠区域组件
├── CopyButton         // 复制按钮（内联）
└── Main Layout        // 主布局
    ├── Header         // 状态 + 模型 + 时间
    ├── Metrics Grid   // 4 个指标卡片
    ├── Metadata       // 可折叠元数据
    └── Request/Response
        ├── Request Panel
        │   ├── Headers Tab
        │   └── Body Tab
        └── Response Panel
            ├── Headers Tab
            └── Body Tab
```

### Props 设计

```typescript
interface LogDetailSheetProps {
  log?: Log | null
  open: boolean
  onOpenChange: (open: boolean) => void
  formatDuration: (ms: number) => string
  formatTokens: (tokens: number) => string
}
```

---

## 使用示例

```tsx
<LogDetailSheet
  log={selectedLog}
  open={detailDialogOpen}
  onOpenChange={setDetailDialogOpen}
  formatDuration={formatDuration}
  formatTokens={formatTokens}
/>
```

---

## 设计对比

### 之前（Old Design）
- ❌ 信息扁平堆砌
- ❌ 缺乏视觉层次
- ❌ 所有元数据都展开
- ❌ 简单的状态 Badge
- ❌ 无颜色编码

### 现在（New Design）
- ✅ 清晰的信息层次
- ✅ 关键指标突出显示
- ✅ 可折叠次要信息
- ✅ 大号状态指示器
- ✅ 智能颜色编码
- ✅ 专业的监控美学
- ✅ 独立复制功能
- ✅ 渐变和模糊效果

---

## 技术栈

- **React 19**
- **shadcn/ui** (Sheet, Badge, Tabs, ScrollArea, Button)
- **Tailwind CSS v4**
- **lucide-react** (图标)
- **Monaco Editor** (JSON 高亮)

---

## 未来改进方向

1. **性能可视化**：
   - 延迟时间线图
   - Token 使用趋势

2. **对比功能**：
   - 多个日志并排对比
   - Diff 视图

3. **智能高亮**：
   - 异常数据自动标红
   - 关键字段高亮

4. **导出功能**：
   - 导出为 JSON
   - 生成分享链接

5. **快捷操作**：
   - 重放请求
   - 复制为 cURL

---

## 总结

新设计将日志详情从"信息展示"升级为"专业监控仪表盘"，通过精心设计的视觉层次、颜色编码和交互细节，让用户能够快速定位问题、理解数据。

**核心价值：**
- 更快的问题诊断
- 更清晰的数据呈现
- 更专业的视觉体验
