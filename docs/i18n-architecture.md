# 国际化（i18n）架构方案

> 基于时区问题讨论延伸出的全局架构方案。P0 决策：**中文为基线，英文为翻译**。
> 工作量按 AI Coding Agent 基准估算（不含翻译校对时间）。

## 背景

`x-herald` 将作为开源项目面向国际化用户。当前代码库存在两层问题：

1. **时区硬编码**：17 处 `toLocaleString('zh-CN')` 等调用无视用户实际时区；后端"今日熔断"按服务端时区计算；DB 使用 `timestamp without time zone` 无时区信息
2. **零 i18n 基础**：所有 UI 文案硬编码中文（约 200+ 处）；无 locale / timezone 偏好存储；无 `Accept-Language` 处理

两个问题在技术栈上互相耦合，应作为一个统一架构方案推进。

## 原则

1. **基线语言：中文**（P0 决策 B）。`zh-CN.json` 是源文件，`en.json` 是翻译。后续添加 `ja`/`fr` 等同样以中文为源
2. **零运行时 i18n 库**：使用原生 `Intl` API + 轻量自写 Provider（约 150 行）。不引入 `react-i18next` / `@formatjs/intl`
3. **类型安全**：所有 i18n key 由 TS 联合类型约束，编译期检测缺失
4. **共享代码归属**：`packages/shared` 而非 `packages/ui`，因为后端格式化日志/导出也要用
5. **DB schema 一旦发版难改**：时区字段必须在 v1.0.0 前定型为 `timestamptz`
6. **阶段独立**：每个 Phase 可单独交付，不阻塞后续
7. **不破坏现有功能**：每步可验证、可回滚

## 现状分析

### 时区相关

| 层级           | 问题                                                                                                  | 文件示例                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| DB             | `timestamp` 无时区，跨时区部署隐患                                                                    | `packages/db/src/schema/*.ts`（共 8+ 个表）                      |
| 后端"今日"计算 | `circuit-breaker/api.ts` 用服务端进程时区算 todayStart                                                | `apps/gateway/src/features/circuit-breaker/api.ts:15`            |
| 前端显示       | 11 处硬编码 `'zh-CN'` 强制 UTC+8                                                                      | `apps/web/app/routes/admin/intent-recognition/*` 等              |
| 时间筛选       | `cost-date-filter.tsx:21` 用 `toISOString().split('T')[0]` 取 UTC 日期，凌晨 0-8 点（中国时区）漏数据 | `packages/ui/src/features/costs/components/cost-date-filter.tsx` |

### i18n 相关

| 维度         | 现状                     |
| ------------ | ------------------------ |
| i18n 库      | 无                       |
| 用户偏好存储 | 无 users 表              |
| Locale 字段  | 无                       |
| 文案抽取     | 无；约 200+ 处中文硬编码 |
| 错误消息     | 后端返回中文硬编码字符串 |
| 翻译协作流程 | 无                       |

## 技术选型

| 维度              | 决策                       | 理由                                                                            |
| ----------------- | -------------------------- | ------------------------------------------------------------------------------- |
| **i18n 库**       | 不引入                     | 原生 `Intl` + 自写 Provider 足够；引入 `react-i18next` 是过度工程               |
| **文案格式**      | 标准 JSON                  | 兼容 Weblate / Crowdin 等翻译平台                                               |
| **类型安全**      | TS 联合类型 + 启动时校验   | 编译期检测 key 缺失                                                             |
| **复数/插值**     | 简单 `{name}` 占位符       | 不上 ICU MessageFormat                                                          |
| **时区**          | `Intl.DateTimeFormat` 原生 | 0 依赖                                                                          |
| **错误码**        | 英文常量枚举               | 后端发 `code`，前端按 locale 翻译                                               |
| **默认语言**      | 中文（zh-CN）              | P0 = B；浏览器 `navigator.language` 命中 zh-\* 自动选中文，其他 fallback 到中文 |
| **英文 fallback** | 中文                       | 英文文案缺失时 fallback 到中文（基线）                                          |

### 不引入 i18n 库的理由

- 项目约 200 条文案，复数规则中英文都用不上
- `Intl` 原生 API 已覆盖日期/数字/货币/相对时间
- 自写 Provider < 200 行，完全可控
- 引入第三方库 = 维护负担 + 生态锁定，**对开源项目不利**

## 架构设计

### 目录结构（目标态）

```
packages/
├── shared/src/
│   ├── lib/
│   │   ├── datetime.ts          # 前后端共用
│   │   ├── locale.ts            # locale 元数据、fallback 链
│   │   └── format.ts            # 数字、货币、文件大小
│   ├── types/
│   │   └── i18n.ts              # 类型安全文案 key
│   ├── constants/
│   │   └── locales.ts           # SUPPORTED_LOCALES 列表
│   └── i18n/
│       ├── zh-CN.json           # 基线（中文源文件）
│       ├── en.json              # 翻译
│       └── index.ts             # loadLocale + 类型校验

apps/web/src/
├── i18n/
│   ├── provider.tsx             # I18nProvider 注入 locale/tz
│   └── use-translation.ts       # t() hook（类型安全）
└── components/
    └── locale-switcher.tsx      # 语言+时区切换 UI

apps/gateway/src/middleware/
└── locale.ts                    # Hono middleware 解析 Accept-Language

scripts/
└── extract-i18n.ts              # 半自动文案抽取工具
```

### locale 列表（初始）

```ts
// packages/shared/src/constants/locales.ts
export const SUPPORTED_LOCALES = ['zh-CN', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'zh-CN'
export const FALLBACK_LOCALE: Locale = 'zh-CN' // 基线语言
```

### 错误码命名规范

```ts
// packages/shared/src/constants/error-codes.ts
export const ERROR_CODES = {
  // 格式：{FEATURE}_{REASON}
  PROVIDER_HAS_KEYS: 'PROVIDER_HAS_KEYS',
  KEY_EXPIRED: 'KEY_EXPIRED',
  CIRCUIT_BREAKER_OPEN: 'CIRCUIT_BREAKER_OPEN',
  // ...
} as const
```

后端响应：

```ts
return c.json(
  {
    code: 'PROVIDER_HAS_KEYS',
    params: { keyCount: 3 },
  },
  409,
)
```

前端翻译：

```ts
// apps/web/src/i18n/en.json
{
  "errors.PROVIDER_HAS_KEYS": "Cannot delete provider: {keyCount} active keys"
}

// apps/web/src/i18n/zh-CN.json
{
  "errors.PROVIDER_HAS_KEYS": "无法删除提供商：存在 {keyCount} 个活跃密钥"
}
```

---

## Phase 1 — 时区基础设施（2-3 天）

> 不依赖 i18n，可立即启动。后续阶段可以并行。

### 1.1 DB schema 迁移：`timestamp` → `timestamptz`

- **问题**：所有 `timestamp` 列无时区信息，跨时区部署隐患
- **改动**：
  - 新建迁移文件 `packages/db/migrations/0009_*.sql`
  - 所有 `timestamp` 改为 `timestamp with time zone`（Drizzle: `timestamp('...', { withTimezone: true })`）
  - 存量数据按 UTC 解释（PG `AT TIME ZONE 'UTC'`）
  - 同步更新 Drizzle schema 定义
- **风险**：历史数据被错误解释时区 → 需先备份 + 写数据修正脚本
- **验证**：
  - `bun run db:migrate` 成功
  - `bun run typecheck` 通过
  - 老数据查询结果与之前一致

### 1.2 时区共享工具 `packages/shared/src/lib/datetime.ts`

- **问题**：前后端各重复实现时间格式化
- **改动**：
  - 新建 `packages/shared/src/lib/datetime.ts`（前后端共用）
  - 导出：`formatDateTime`、`formatDate`、`formatTime`、`formatRelative`、`getUserTimezone`、`toUTCISO`
  - 全部基于 `Intl.DateTimeFormat`，无第三方依赖
- **验证**：
  - 单元测试覆盖各 locale / tz 组合
  - `bun test packages/shared/src/lib/datetime.test.ts` 通过

### 1.3 替换 17 处硬编码 `'zh-CN'`

- **问题**：强制 UTC+8 显示，非中国用户看到的时间永远不对
- **改动**：
  - 全项目 `rg "toLocale(?:String|DateString|TimeString)\('zh-CN'"` 列出 17 处
  - 替换为不传 locale 参数的版本（使用浏览器默认）
  - 时间显示统一通过 `formatDateTime(iso)` 走 `packages/shared`
- **验证**：
  - 浏览器切到 `en-US` 时区，时间按浏览器本地时区显示
  - 所有现有页面无视觉错位

### 1.4 时区聚合：后端接收 `?tz=` 参数

- **问题**：`circuit-breaker/api.ts:15` "今日熔断"按服务端时区算
- **改动**：
  - 所有聚合 endpoint 接受 `?tz=Asia/Shanghai`（IANA 时区名）
  - 默认值 `UTC`（后端无歧义）
  - SQL 改用 `date_trunc('day', created_at AT TIME ZONE $1)` 按用户时区分桶
- **影响文件**：
  - `apps/gateway/src/features/circuit-breaker/api.ts`
  - `apps/gateway/src/features/metrics/api.ts`
  - `apps/gateway/src/features/costs/api.ts`
- **验证**：
  - 单元测试：传入 `tz=Asia/Shanghai` 时，跨 UTC 0 点的"今日"边界正确
  - 集成测试：浏览器 `Asia/Shanghai` 与 `America/New_York` 看到不同的"今日"统计

---

## Phase 2 — i18n 基础设施（3-5 天）

### 2.1 locale 元数据

- **改动**：
  - `packages/shared/src/constants/locales.ts` 定义 `SUPPORTED_LOCALES`
  - `packages/shared/src/lib/locale.ts` 提供 `parseAcceptLanguage()`、`negotiateLocale()`、`getLocaleDisplayName()`
- **验证**：
  - `parseAcceptLanguage('zh-CN,zh;q=0.9,en;q=0.8')` 返回 `'zh-CN'`
  - `negotiateLocale(['zh-CN', 'en'])` 命中浏览器语言

### 2.2 文案类型定义

- **改动**：
  - `packages/shared/src/types/i18n.ts` 定义 `type I18nKey = 'common.save' | 'common.cancel' | ...`
  - 启动时校验 JSON 文件包含所有 key
- **验证**：
  - `t('commom.save')`（拼写错误）编译报错
  - JSON 文件缺失 key 时启动报错

### 2.3 文案源文件

- **改动**：
  - `packages/shared/src/i18n/zh-CN.json`（基线，结构 + 部分内容）
  - `packages/shared/src/i18n/en.json`（空骨架，标记待翻译）
- **初始结构**：
  ```json
  {
    "common": {
      "save": "保存",
      "cancel": "取消",
      "loading": "加载中…",
      "error": "错误"
    },
    "nav": {
      "dashboard": "仪表盘",
      "providers": "服务提供商",
      "keys": "虚拟密钥",
      "logs": "请求日志",
      "settings": "设置"
    },
    "errors": {
      "PROVIDER_HAS_KEYS": "无法删除提供商：存在 {keyCount} 个活跃密钥",
      "KEY_EXPIRED": "密钥已过期"
    }
  }
  ```
- **验证**：
  - JSON 文件通过 `JSON.parse`
  - 所有 key 在 zh-CN 中存在（en 缺失不报错）

### 2.4 React Provider + `t()` hook

- **改动**：
  - `apps/web/src/i18n/provider.tsx` — `<I18nProvider locale messages t>` 注入 context
  - `apps/web/src/i18n/use-translation.ts` — `useTranslation()` 返回 `{ t, locale }`
  - 缺失 key 时 console.warn + 返回 fallback locale 的值
- **验证**：
  - 在 admin layout 包裹 `<I18nProvider>`，所有子组件可用 `t()`
  - 单测：`t('common.save', { locale: 'zh-CN' }) === '保存'`

### 2.5 Locale Switcher UI

- **改动**：
  - `apps/web/src/components/locale-switcher.tsx` — 下拉选择语言 + 时区
  - 选择持久化到 `localStorage`（key: `i18n.locale`, `i18n.timezone`）
  - 挂载到 admin layout 顶部
- **验证**：
  - 切换语言后页面文案立即更新
  - 刷新页面后选择持久化
  - 时区切换后时间显示立即更新

---

## Phase 3 — 文案全量抽取（1-2 周）

> 真正的苦活。建议分批推进，先核心导航 + 列表页，再详情页 + 表单。

### 3.1 自动抽取脚本

- **改动**：
  - `scripts/extract-i18n.ts` — 扫描所有 `apps/web/**/*.tsx` 中的中文文案
  - 使用启发式：JSX 文本节点、属性值、模板字符串中的中文
  - 输出 stub JSON 文件 + 报告哪些位置需要手动确认
- **验证**：
  - 抽取覆盖率 ≥ 90%（剩余 10% 是动态文案或注释）

### 3.2 手动抽取剩余文案

- **改动**：
  - 处理自动脚本无法识别的：动态拼接、条件渲染、第三方组件 props
  - 为每个 key 选择合适命名空间：`common.*` / `feature.{name}.*` / `errors.*`
- **验证**：
  - 全项目 `rg "[一-龥]"` 仅在 i18n JSON 文件、注释、测试 fixtures 中

### 3.3 替换组件硬编码

- **改动**：
  - 所有 `.tsx` 文件中的中文文案改为 `t('feature.xxx.label')`
  - 文案 key 集中管理（按 feature 命名空间）
- **验证**：
  - `bun run typecheck` 通过
  - 切换语言后所有页面文案变化

### 3.4 翻译英文版本

- **改动**：
  - `en.json` 按中文基线逐条翻译
  - 推荐先用 Claude / DeepL 机翻，再人工 review
- **验证**：
  - 切换到英文后所有页面无 fallback 提示
  - 关键术语一致（model instance、virtual key 等）

### 3.5 README 双语化

- **改动**：
  - `README.md` — 英文（开源项目门面）
  - `README.zh-CN.md` — 中文（同步链接）
  - 顶部加入语言切换链接
- **验证**：
  - GitHub 主页默认显示 README.md（英文）
  - 中文用户通过链接访问 README.zh-CN.md

### 3.6 CI 翻译完整性检查

- **改动**：
  - `.github/workflows/i18n-check.yml`
  - 检查项：所有 key 在 zh-CN 存在；en 缺失不阻塞但产生 warning
- **验证**：
  - PR 中新增未翻译文案时，CI 提示但不阻塞合并
  - 关键错误码全语言覆盖时无 warning

---

## Phase 4 — 错误体系国际化（3-5 天）

### 4.1 错误码字典

- **改动**：
  - `packages/shared/src/constants/error-codes.ts` 定义所有错误码
  - `packages/shared/src/i18n/{zh-CN,en}.json` 中 `errors.*` 段
- **验证**：
  - `rg "c.json\(\s*\{\s*error" apps/gateway/src` 列出所有待迁移点

### 4.2 后端改造

- **改动**：
  - 所有 `c.json({ error: '中文消息' }, 4xx)` 改为 `c.json({ code, params }, 4xx)`
  - 全局错误中间件统一处理
  - 向后兼容：保留 `error` 字段（中文），客户端逐步迁移
- **影响文件**：所有 `apps/gateway/src/features/**/api.ts`
- **验证**：
  - 所有 endpoint 返回 `{ code, params }` 结构
  - 旧客户端（仍读 `error` 字段）继续工作

### 4.3 前端错误拦截器

- **改动**：
  - `apps/web/src/lib/api-error.ts` — `ApiError` 类 + `translateError(error, locale)` 函数
  - 所有 TanStack Query 的 `onError` 走统一翻译
  - Toast 显示按当前 locale 翻译的错误消息
- **验证**：
  - 触发 PROVIDER_HAS_KEYS 错误，中文显示"无法删除提供商…"，英文显示"Cannot delete provider…"
  - 网络错误统一为当前 locale 文案

---

## 风险与缓解

| 风险                            | 严重度 | 缓解措施                                                          |
| ------------------------------- | ------ | ----------------------------------------------------------------- |
| DB 时区迁移导致历史数据解释错误 | 高     | 迁移前备份；按 UTC 解释存量；写回滚脚本                           |
| 文案抽取遗漏                    | 中     | 自动脚本覆盖率报告；CI 检查                                       |
| 翻译质量低                      | 中     | 关键页面人工 review；建立术语表（model instance、virtual key 等） |
| 错误码重构破坏既有客户端        | 中     | 保留 `error` 字段过渡；新字段 `code` 优先                         |
| 引入 i18n 库后维护负担          | 已规避 | 不引入第三方库                                                    |
| 浏览器 locale 协商兼容性        | 低     | `parseAcceptLanguage` 处理 q-value；fallback 到默认               |

## 立即行动清单

```
□ P0 决策确认（已完成）：中文为基线
□ Phase 1.1: DB schema 迁移 → 备份 + 写迁移文件
□ Phase 1.2: 建 packages/shared/src/lib/datetime.ts
□ Phase 1.3: 替换 17 处硬编码 'zh-CN'
□ Phase 1.4: 后端聚合 endpoint 支持 ?tz= 参数
□ Phase 2.1-2.5: i18n 基础设施（locale 元数据 + Provider + Switcher）
□ Phase 3.1-3.6: 文案抽取 + 翻译 + README 双语化
□ Phase 4.1-4.3: 错误体系国际化
```

## 附录：相关文件清单

### 受影响的现有文件（按 Phase）

**Phase 1:**

- `packages/db/migrations/` 新增 1 个迁移文件
- `packages/db/src/schema/*.ts` 改 `withTimezone: true`（8+ 表）
- `packages/shared/src/lib/datetime.ts`（新建）
- `packages/shared/src/index.ts`（导出新工具）
- `apps/web/app/**/*.{ts,tsx}` 17 处替换
- `apps/gateway/src/features/circuit-breaker/api.ts`
- `apps/gateway/src/features/metrics/api.ts`
- `apps/gateway/src/features/costs/api.ts`
- `apps/gateway/src/features/logs/services/intent-log-service.ts`

**Phase 2:**

- `packages/shared/src/constants/locales.ts`（新建）
- `packages/shared/src/lib/locale.ts`（新建）
- `packages/shared/src/types/i18n.ts`（新建）
- `packages/shared/src/i18n/{zh-CN,en}.json`（新建）
- `apps/web/src/i18n/provider.tsx`（新建）
- `apps/web/src/i18n/use-translation.ts`（新建）
- `apps/web/src/components/locale-switcher.tsx`（新建）
- `apps/web/app/routes/admin/__root.tsx`（挂载 Provider）

**Phase 3:**

- `scripts/extract-i18n.ts`（新建）
- `apps/web/app/**/*.tsx`（约 200 处替换）
- `README.md` + `README.zh-CN.md`
- `.github/workflows/i18n-check.yml`（新建）

**Phase 4:**

- `packages/shared/src/constants/error-codes.ts`（新建）
- `apps/gateway/src/features/**/api.ts`（约 30+ 个 endpoint）
- `apps/web/src/lib/api-error.ts`（新建）

### 不引入的依赖

- ✗ `react-i18next` / `i18next`
- ✗ `@formatjs/intl`
- ✗ `dayjs` / `date-fns` / `moment` / `luxon`（用原生 `Intl`）
- ✗ `zod-i18n`（用项目已有 zod）

### 后续可考虑（不在本方案范围）

- 添加更多语言（日语 ja、法语 fr 等）：按 `en.json` 流程补充
- 接入 Weblate / Crowdin：JSON 格式已兼容
- 数字/货币本地化：用 `Intl.NumberFormat` 扩展 `format.ts`
- 时区缩写显示：在 `datetime.ts` 加 `formatTimezone()` 工具
- 服务端渲染 locale 协商（如果未来引入 SSR）：通过 Hono middleware 处理
