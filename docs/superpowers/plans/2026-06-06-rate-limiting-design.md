# 速率限制功能 — 产品设计与架构设计

> **For agentic workers:** 这是速率限制功能的完整设计文档，包含产品设计和架构设计。

**Goal:** 为虚拟密钥实现完整的速率限制强制执行，包括 RPM、RPD 和 Token 额度限制

**Architecture:** 内存滑动窗口计数器 + DB 持久化 + 中间件强制执行

**Tech Stack:** Bun + Hono + TypeScript + Drizzle ORM

---

## 一、产品设计

### 1.1 功能概述

速率限制功能允许管理员为每个虚拟密钥设置使用限额，防止滥用和意外的高额账单。

### 1.2 限制类型

| 限制类型 | 字段名 | 说明 | 示例 |
|----------|--------|------|------|
| **RPM** (Requests Per Minute) | `rate_limit_rpm` | 每分钟最大请求数 | 60 次/分钟 |
| **RPD** (Requests Per Day) | `rate_limit_rpd` | 每天最大请求数 | 1000 次/天 |
| **Token 额度** | `token_limit_daily` | 每天最大 Token 消耗量 | 100,000 tokens/天 |

### 1.3 用户场景

#### 场景 1：个人开发者控制成本
```
用户创建虚拟密钥 → 设置 RPM=10, RPD=100, Token=50000
→ 使用 Cursor 编码 → 达到限额后收到 429 错误
→ 管理 UI 显示当前使用量和剩余配额
```

#### 场景 2：团队共享密钥
```
管理员创建团队密钥 → 设置 RPM=100, RPD=10000, Token=1000000
→ 团队成员共享此密钥 → 所有请求共享限额
→ 达到限额后所有成员都收到 429
```

#### 场景 3：临时访问
```
管理员创建临时密钥 → 设置 24 小时过期 + Token 额度=10000
→ 分享给外部顾问 → 顾问使用后自动过期
```

### 1.4 错误响应

当请求被速率限制拒绝时，返回标准 429 响应：

```json
{
  "error": {
    "message": "Rate limit exceeded: 60/60 requests per minute",
    "type": "rate_limit_error",
    "code": "RATE_LIMIT_EXCEEDED",
    "limit": {
      "type": "rpm",
      "limit": 60,
      "remaining": 0,
      "reset_at": "2026-06-06T10:31:00Z"
    }
  }
}
```

**响应头：**
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1749216660
Retry-After: 45
```

### 1.5 管理 UI

#### 密钥创建/编辑表单
```
┌─────────────────────────────────────────────┐
│  速率限制                                    │
│                                             │
│  每分钟请求限制:  [____] 次/分钟  (可选)     │
│  每天请求限制:    [____] 次/天    (可选)     │
│  每天 Token 限额: [____] tokens  (可选)     │
│                                             │
│  💡 留空表示无限制                           │
└─────────────────────────────────────────────┘
```

#### 密钥详情页（使用量展示）
```
┌─────────────────────────────────────────────┐
│  密钥使用量                                  │
│                                             │
│  RPM:  ████████░░ 45/60 (75%)               │
│  RPD:  ███░░░░░░░ 320/1000 (32%)            │
│  Token: ██████░░░░ 65000/100000 (65%)       │
│                                             │
│  重置时间:                                  │
│  RPM: 25 秒后重置                           │
│  RPD: 明天 00:00 重置                       │
│  Token: 明天 00:00 重置                     │
└─────────────────────────────────────────────┘
```

### 1.6 API 响应头

所有 Gateway 响应都包含速率限制信息：

```
# 正常请求
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1749216660

# 接近限额（剩余 < 10%）
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 5
X-RateLimit-Reset: 1749216660
Warning: Rate limit approaching

# 已超限
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1749216660
Retry-After: 45
```

---

## 二、架构设计

### 2.1 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Request                          │
│  Cursor │ Claude Desktop │ Cline │ Custom App               │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   virtualKeyMiddleware                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ 1. 验证密钥  │  │ 2. 检查状态  │  │ 3. 速率限制检查     │ │
│  │ (DB + 缓存) │  │ (enabled/   │  │ (RPM/RPD/Token)    │ │
│  │             │  │  expired)   │  │                     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    Rate Limit Engine                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              In-Memory Sliding Window                │    │
│  │                                                     │    │
│  │  Map<keyId, {                                       │    │
│  │    rpm: SlidingWindowCounter,  // 60s 窗口          │    │
│  │    rpd: SlidingWindowCounter,  // 24h 窗口          │    │
│  │    token: DailyAccumulator,    // 24h 累加器        │    │
│  │  }>                                                 │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                          │                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              DB Persistence (可选)                   │    │
│  │  定期将计数器快照写入 DB，重启后恢复                   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 核心组件

#### 2.2.1 SlidingWindowCounter（滑动窗口计数器）

```typescript
interface SlidingWindowEntry {
  timestamp: number  // 请求时间戳 (ms)
  count: number      // 请求数量
}

class SlidingWindowCounter {
  private windowMs: number      // 窗口大小 (ms)
  private maxRequests: number   // 最大请求数
  private entries: SlidingWindowEntry[]
  
  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs
    this.maxRequests = maxRequests
    this.entries = []
  }
  
  // 记录一次请求
  record(): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now()
    const windowStart = now - this.windowMs
    
    // 清理过期条目
    this.entries = this.entries.filter(e => e.timestamp > windowStart)
    
    // 计算当前窗口内的总请求数
    const currentCount = this.entries.reduce((sum, e) => sum + e.count, 0)
    
    if (currentCount >= this.maxRequests) {
      // 超限：返回拒绝信息
      const oldestEntry = this.entries[0]
      const resetAt = oldestEntry ? oldestEntry.timestamp + this.windowMs : now + this.windowMs
      return { allowed: false, remaining: 0, resetAt }
    }
    
    // 允许：记录请求
    this.entries.push({ timestamp: now, count: 1 })
    return { allowed: true, remaining: this.maxRequests - currentCount - 1, resetAt: windowStart + this.windowMs }
  }
  
  // 获取当前状态（不记录请求）
  getStatus(): { current: number; limit: number; remaining: number; resetAt: number } {
    const now = Date.now()
    const windowStart = now - this.windowMs
    const currentCount = this.entries.filter(e => e.timestamp > windowStart).reduce((sum, e) => sum + e.count, 0)
    return {
      current: currentCount,
      limit: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - currentCount),
      resetAt: windowStart + this.windowMs,
    }
  }
}
```

#### 2.2.2 DailyAccumulator（日累计器）

```typescript
class DailyAccumulator {
  private maxTokens: number
  private currentTokens: number
  private resetAt: number  // 每天 00:00 的时间戳
  
  constructor(maxTokens: number) {
    this.maxTokens = maxTokens
    this.currentTokens = 0
    this.resetAt = this.getNextResetTime()
  }
  
  // 记录 token 消耗
  record(tokens: number): { allowed: boolean; remaining: number; resetAt: number } {
    this.checkAndReset()
    
    if (this.currentTokens + tokens > this.maxTokens) {
      return { allowed: false, remaining: Math.max(0, this.maxTokens - this.currentTokens), resetAt: this.resetAt }
    }
    
    this.currentTokens += tokens
    return { allowed: true, remaining: this.maxTokens - this.currentTokens, resetAt: this.resetAt }
  }
  
  // 检查是否需要重置
  private checkAndReset() {
    if (Date.now() >= this.resetAt) {
      this.currentTokens = 0
      this.resetAt = this.getNextResetTime()
    }
  }
  
  private getNextResetTime(): number {
    const now = new Date()
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    return tomorrow.getTime()
  }
}
```

#### 2.2.3 RateLimitEngine（速率限制引擎）

```typescript
interface RateLimitConfig {
  rpm?: number | null
  rpd?: number | null
  tokenLimitDaily?: number | null
}

interface RateLimitResult {
  allowed: boolean
  reason?: string
  rpm?: { limit: number; remaining: number; resetAt: number }
  rpd?: { limit: number; remaining: number; resetAt: number }
  token?: { limit: number; remaining: number; resetAt: number }
}

class RateLimitEngine {
  private counters: Map<string, {
    rpm: SlidingWindowCounter | null
    rpd: SlidingWindowCounter | null
    token: DailyAccumulator | null
  }>
  
  constructor() {
    this.counters = new Map()
    // 每 5 分钟清理过期计数器
    setInterval(() => this.cleanup(), 5 * 60 * 1000)
  }
  
  // 检查速率限制
  check(keyId: string, config: RateLimitConfig, tokens?: number): RateLimitResult {
    const keyCounters = this.getOrCreateCounters(keyId, config)
    
    // 检查 RPM
    if (keyCounters.rpm) {
      const rpmResult = keyCounters.rpm.record()
      if (!rpmResult.allowed) {
        return { allowed: false, reason: 'RPM limit exceeded', rpm: rpmResult }
      }
    }
    
    // 检查 RPD
    if (keyCounters.rpd) {
      const rpdResult = keyCounters.rpd.record()
      if (!rpdResult.allowed) {
        return { allowed: false, reason: 'RPD limit exceeded', rpd: rpdResult }
      }
    }
    
    // 检查 Token 额度
    if (keyCounters.token && tokens) {
      const tokenResult = keyCounters.token.record(tokens)
      if (!tokenResult.allowed) {
        return { allowed: false, reason: 'Token limit exceeded', token: tokenResult }
      }
    }
    
    // 返回状态信息
    return {
      allowed: true,
      rpm: keyCounters.rpm?.getStatus(),
      rpd: keyCounters.rpd?.getStatus(),
      token: keyCounters.token ? { limit: keyCounters.token['maxTokens'], remaining: keyCounters.token['maxTokens'] - keyCounters.token['currentTokens'], resetAt: keyCounters.token['resetAt'] } : undefined,
    }
  }
  
  // 获取当前状态（不记录请求）
  getStatus(keyId: string, config: RateLimitConfig): RateLimitResult {
    const keyCounters = this.getOrCreateCounters(keyId, config)
    return {
      allowed: true,
      rpm: keyCounters.rpm?.getStatus(),
      rpd: keyCounters.rpd?.getStatus(),
      token: keyCounters.token ? { limit: keyCounters.token['maxTokens'], remaining: keyCounters.token['maxTokens'] - keyCounters.token['currentTokens'], resetAt: keyCounters.token['resetAt'] } : undefined,
    }
  }
  
  private getOrCreateCounters(keyId: string, config: RateLimitConfig) {
    let counters = this.counters.get(keyId)
    if (!counters) {
      counters = {
        rpm: config.rpm ? new SlidingWindowCounter(60 * 1000, config.rpm) : null,
        rpd: config.rpd ? new SlidingWindowCounter(24 * 60 * 60 * 1000, config.rpd) : null,
        token: config.tokenLimitDaily ? new DailyAccumulator(Number(config.tokenLimitDaily)) : null,
      }
      this.counters.set(keyId, counters)
    }
    return counters
  }
  
  private cleanup() {
    // 清理 1 小时无活动的计数器
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    for (const [keyId, counters] of this.counters) {
      const hasActivity = 
        (counters.rpm && counters.rpm['entries'].length > 0) ||
        (counters.rpd && counters.rpd['entries'].length > 0)
      if (!hasActivity) {
        this.counters.delete(keyId)
      }
    }
  }
}
```

### 2.3 中间件集成

#### 2.3.1 修改 virtual-key.ts

```typescript
// 在 virtual-key.ts 中添加速率限制检查

import { rateLimitEngine } from '../services/rate-limit-engine'

export const virtualKeyMiddleware = async (c: Context, next: Next) => {
  // ... 现有的密钥验证逻辑 ...
  
  // 速率限制检查
  if (key.rateLimitRpm || key.rateLimitRpd || key.tokenLimitDaily) {
    const result = rateLimitEngine.check(key.id, {
      rpm: key.rateLimitRpm,
      rpd: key.rateLimitRpd,
      tokenLimitDaily: key.tokenLimitDaily,
    })
    
    if (!result.allowed) {
      return c.json({
        error: {
          message: `Rate limit exceeded: ${result.reason}`,
          type: 'rate_limit_error',
          code: 'RATE_LIMIT_EXCEEDED',
          limit: {
            type: result.reason?.includes('RPM') ? 'rpm' : result.reason?.includes('RPD') ? 'rpd' : 'token',
            limit: result.rpm?.limit || result.rpd?.limit || result.token?.limit,
            remaining: 0,
            resetAt: new Date(result.rpm?.resetAt || result.rpd?.resetAt || result.token?.resetAt || Date.now()).toISOString(),
          }
        }
      }, 429)
    }
    
    // 设置响应头
    c.header('X-RateLimit-Limit', String(result.rpm?.limit || result.rpd?.limit || ''))
    c.header('X-RateLimit-Remaining', String(result.rpm?.remaining || result.rpd?.remaining || ''))
    c.header('X-RateLimit-Reset', String(Math.floor((result.rpm?.resetAt || result.rpd?.resetAt || Date.now()) / 1000)))
  }
  
  await next()
}
```

#### 2.3.2 Token 消耗追踪

在请求完成后更新 token 消耗：

```typescript
// 在 response-handlers/streaming.ts 或 log-service.ts 中

// 请求完成后更新 token 使用量
export function updateTokenUsage(keyId: string, inputTokens: number, outputTokens: number) {
  const totalTokens = inputTokens + outputTokens
  rateLimitEngine.check(keyId, {}, totalTokens) // 仅更新 token 计数器
}
```

### 2.4 DB 持久化（可选）

#### 2.4.1 快照表

```sql
CREATE TABLE rate_limit_snapshots (
  id UUID PRIMARY KEY,
  key_id UUID NOT NULL REFERENCES virtual_keys(id),
  window_type VARCHAR NOT NULL, -- 'rpm' | 'rpd' | 'token'
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 2.4.2 定期快照

```typescript
// 每 5 分钟将计数器快照写入 DB
setInterval(async () => {
  for (const [keyId, counters] of rateLimitEngine.counters) {
    if (counters.rpm) {
      await db.insert(rateLimitSnapshots).values({
        keyId,
        windowType: 'rpm',
        windowStart: new Date(Date.now() - 60 * 1000),
        windowEnd: new Date(),
        count: counters.rpm.getStatus().current,
      })
    }
    // ... 类似处理 rpd 和 token
  }
}, 5 * 60 * 1000)
```

#### 2.4.3 启动时恢复

```typescript
// 服务启动时从 DB 恢复计数器
export async function recoverRateLimitState(db: Database) {
  const recentSnapshots = await db
    .selectFrom('rate_limit_snapshots')
    .where('window_end', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
    .execute()
  
  // 根据快照恢复计数器状态
  for (const snapshot of recentSnapshots) {
    const counters = rateLimitEngine.getOrCreateCounters(snapshot.keyId, {})
    // ... 恢复逻辑
  }
}
```

### 2.5 API 扩展

#### 2.5.1 获取密钥使用量

```
GET /api/keys/:id/usage
```

**响应：**
```json
{
  "keyId": "xxx",
  "rpm": { "limit": 60, "current": 45, "remaining": 15, "resetAt": "2026-06-06T10:31:00Z" },
  "rpd": { "limit": 1000, "current": 320, "remaining": 680, "resetAt": "2026-06-07T00:00:00Z" },
  "token": { "limit": 100000, "current": 65000, "remaining": 35000, "resetAt": "2026-06-07T00:00:00Z" }
}
```

#### 2.5.2 重置密钥计数器

```
POST /api/keys/:id/reset-usage
```

**请求体：**
```json
{
  "window": "rpm" | "rpd" | "token" | "all"
}
```

---

## 三、实现计划

### Phase 1: 核心引擎（2-3 天）

| 任务 | 文件 | 产出 |
|------|------|------|
| 实现 SlidingWindowCounter | `packages/engine/src/gateway/services/rate-limit-engine.ts` | 滑动窗口计数器 |
| 实现 DailyAccumulator | 同上 | 日累计器 |
| 实现 RateLimitEngine | 同上 | 速率限制引擎 |
| 单元测试 | `packages/engine/src/gateway/services/rate-limit-engine.test.ts` | 测试覆盖 |

### Phase 2: 中间件集成（1-2 天）

| 任务 | 文件 | 产出 |
|------|------|------|
| 修改 virtual-key.ts | `packages/engine/src/middleware/virtual-key.ts` | 添加速率限制检查 |
| 添加响应头 | 同上 | X-RateLimit-* 头 |
| Token 消耗追踪 | `packages/engine/src/gateway/services/response-handlers/streaming.ts` | 完成后更新 token |

### Phase 3: API 扩展（1 天）

| 任务 | 文件 | 产出 |
|------|------|------|
| 添加使用量查询 API | `packages/engine/src/features/keys/api.ts` | GET /:id/usage |
| 添加计数器重置 API | 同上 | POST /:id/reset-usage |

### Phase 4: 管理 UI（1-2 天）

| 任务 | 文件 | 产出 |
|------|------|------|
| 密钥表单添加速率限制字段 | `apps/tanstack/app/routes/admin/keys/` | 表单更新 |
| 密钥详情页添加使用量展示 | 同上 | 使用量卡片 |
| 实时使用量刷新 | 同上 | 轮询或 SSE |

### Phase 5: DB 持久化（可选，1-2 天）

| 任务 | 文件 | 产出 |
|------|------|------|
| 创建快照表 | 迁移文件 | rate_limit_snapshots 表 |
| 定期快照 | `packages/engine/src/gateway/services/rate-limit-engine.ts` | 快照逻辑 |
| 启动恢复 | `packages/engine/src/createEngine.ts` | 恢复逻辑 |

---

## 四、性能考虑

### 4.1 内存使用

- 每个密钥约 1KB 内存（RPM + RPD + Token 三个计数器）
- 1000 个密钥 ≈ 1MB 内存
- 可接受范围

### 4.2 并发安全

- Bun 单线程，无并发问题
- 如果未来多进程，需要分布式计数器（Redis）

### 4.3 精度

- RPM：精确到秒级（滑动窗口）
- RPD：精确到分钟级（滑动窗口）
- Token：精确到请求级（累加器）

### 4.4 重启恢复

- Phase 1-4：重启后计数器归零（可接受）
- Phase 5：从 DB 恢复（精确恢复）

---

## 五、边界情况

### 5.1 时钟漂移

- 使用服务器时间，不依赖客户端时间
- 滑动窗口基于 `Date.now()`，时钟漂移影响可忽略

### 5.2 并发请求

- 同一密钥的并发请求会竞争同一个计数器
- Bun 单线程保证原子性

### 5.3 密钥更新

- 更新密钥的速率限制配置时，旧计数器保留
- 新配置在下一个窗口生效

### 5.4 密钥删除

- 删除密钥时清理对应计数器
- 避免内存泄漏

---

## 六、测试场景

### 6.1 RPM 限制

```
设置 RPM=5
发送 5 个请求 → 全部 200
发送第 6 个请求 → 429 RATE_LIMIT_EXCEEDED
等待 60 秒
发送请求 → 200
```

### 6.2 RPD 限制

```
设置 RPD=100
发送 100 个请求 → 全部 200
发送第 101 个请求 → 429 RATE_LIMIT_EXCEEDED
等待到明天 → 重置
```

### 6.3 Token 限制

```
设置 Token=1000
发送请求消耗 800 tokens → 200
发送请求消耗 300 tokens → 429 RATE_LIMIT_EXCEEDED
```

### 6.4 组合限制

```
设置 RPM=10, RPD=100, Token=10000
RPM 先达限 → 429 RPM
RPM 重置后继续 → RPD 达限 → 429 RPD
RPD 重置后继续 → Token 达限 → 429 Token
```
