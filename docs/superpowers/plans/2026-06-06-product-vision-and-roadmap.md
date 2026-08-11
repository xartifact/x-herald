# x-llm-gateway 产品愿景与研发计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 构建面向开发者的 LLM 透明代理网关，支持协议转换、智能路由、异常检测和 AI-native 扩展

**Architecture:** Base URL 直连 + MITM 拦截 + AI-native Agent 框架 + 自动异常检测

**Tech Stack:** Bun + Hono + TypeScript + Drizzle ORM + TanStack Router + PGlite/PostgreSQL

---

## 一、产品定位

### 一句话定位

> **LLM Traffic 的 Chrome DevTools + Surge 的流量可视化**
>
> 让开发者在使用任何 AI Agent 时，无需关心上下游兼容性问题，网关自动处理协议转换、流量路由、异常检测和故障恢复。

### 核心原则

| 原则                         | 定义                                                             |
| ---------------------------- | ---------------------------------------------------------------- |
| **第一原则：透明代理**       | 对客户端透明，不改变开发者使用习惯，不增加接入成本               |
| **第二原则：AI-native 扩展** | AI 帮用户扩展产品（写插件、适配 Provider），而非修改产品自身代码 |
| **第三原则：自进化**         | 网关自动检测异常、自动学习 Provider 行为、自动优化路由策略       |

### 目标用户

| 用户画像                                  | 需求                                     |
| ----------------------------------------- | ---------------------------------------- |
| **独立开发者** 使用 Cursor/Claude/Copilot | 多 Provider 故障转移、成本可见、模型切换 |

---

## 二、业务边界定义

### ✅ 在范围内

#### Phase 1: 核心代理（MVP）— ✅ 大部分完成

- Base URL 直连模式（客户端配置 base URL 指向网关）
- 协议转换（OpenAI ↔ Anthropic 双向 + Gemini）
- 虚拟模型路由（条件规则引擎）
- 模型组 + 实例优先级负载均衡
- 虚拟密钥（速率限制 + Token 额度）
- 自动重试 + 指数退避
- 熔断器 + 故障转移
- 请求日志 + 性能快照
- 管理 UI（TanStack Router SPA）
- 客户端一键配置（opencode/claude-code/pi/codex）

#### Phase 2: 智能分析 — ✅ 完成

- 成本追踪（按 Key/Model/Provider 统计 Token 单价和花费）
- 异常检测（自动识别慢请求、高错误率、异常 Token 用量）
- Provider 健康评分（基于成功率、延迟、TTFB 自动打分）
- 请求/响应内容查看器（类似 Chrome DevTools Network tab）
- 实时流量看板（SSE 推送）

#### Phase 3: AI-native 扩展 — ✅ 核心完成

- packages/ai-agent 框架（Agent + Tool + Skill 定义，零依赖）
- AI 错误诊断 + 自动修复
- AI 配置生成器（支持 requestInject/responseExtract）
- Provider 动态扩展能力（字段适配、参数映射）

### ❌ 不在范围内

| 不做                                        | 原因                                                         |
| ------------------------------------------- | ------------------------------------------------------------ |
| 系统级 TUN 拦截                             | 平台噩梦（Apple 签名 + App Store 审核），Base URL 直连已够用 |
| 100+ Provider 预置配置                      | 用动态扩展能力替代手工维护                                   |
| 语义缓存                                    | 复杂度高，收益不确定                                         |
| 内容审核/Guardrails                         | 需要 ML 模型，超出网关核心能力边界                           |
| WASM 自修改代码                             | 安全风险过高，TypeScript 插件系统已够用                      |
| 云托管版本                                  | 专注自托管，不分散精力                                       |
| 企业级功能（多租户、SSO、审计日志、高可用） | 不在当前目标用户需求范围内                                   |

---

## 三、核心功能定义

### 3.1 代理层（Proxy Layer）

#### 3.1.1 Base URL 直连模式

```
客户端（配置 base URL）──→ x-llm-gateway ──HTTP/HTTPS──→ Provider API
                              │
                              ├─ 协议检测（自动识别 OpenAI/Anthropic/Gemini）
                              ├─ 协议转换（按需）
                              ├─ 路由决策
                              ├─ 熔断检查
                              └─ 重试逻辑
```

**实现要点：**

- 客户端将 API base URL 指向网关地址（如 `http://localhost:3000/api/v1`）
- Hono 框架作为 HTTP 反向代理接收请求
- 透明转发：不修改原始请求头（除必要的路由头）
- 客户端通过虚拟密钥（`Authorization: Bearer <key>`）认证

### 3.2 分析层（Analysis Layer）

#### 3.2.1 实时流量看板

```
┌─────────────────────────────────────────────────┐
│  请求列表                                        │
│  ┌──────┬────────┬────────┬──────┬──────┬──────┐ │
│  │ 时间 │ 客户端  │ 模型    │ 状态 │ 延迟 │ Token│ │
│  ├──────┼────────┼────────┼──────┼──────┼──────┤ │
│  │ ...  │ Cursor │ gpt-4  │ 200  │ 1.2s │ 1.5k │ │
│  └──────┴────────┴────────┴──────┴──────┴──────┘ │
│                                                 │
│  实时统计                                        │
│  ┌──────────┬──────────┬──────────┬──────────┐   │
│  │ 请求数/分 │ 成功率   │ 平均延迟  │ Token/分  │   │
│  │   127    │  98.4%   │  890ms   │  45.2k   │   │
│  └──────────┴──────────┴──────────┴──────────┘   │
└─────────────────────────────────────────────────┘
```

**数据流：**

```
请求 → logEventBus.emit('request:start')
     → WebSocket 推送到前端
     → 前端实时更新列表
```

#### 3.2.2 成本追踪

**数据模型：**

```typescript
interface CostRecord {
  keyId: string
  modelName: string
  providerName: string
  inputTokens: number
  outputTokens: number
  inputCost: number // = inputTokens * unitPrice / 1000
  outputCost: number // = outputTokens * unitPrice / 1000
  totalCost: number
  timestamp: Date
}
```

**Provider 单价配置：**

```typescript
interface ProviderPricing {
  providerId: string
  modelPricing: Record<
    string,
    {
      inputPer1k: number // 每 1000 input tokens 的美元价格
      outputPer1k: number // 每 1000 output tokens 的美元价格
    }
  >
}
```

#### 3.2.3 异常检测

**自动检测规则：**

| 异常类型        | 检测条件                   | 严重级别    |
| --------------- | -------------------------- | ----------- |
| 慢请求          | TTFB > 10s 或 总延迟 > 60s | ⚠️ Warning  |
| 高错误率        | 5 分钟内错误率 > 20%       | 🔴 Critical |
| 异常 Token 用量 | 单次请求 > 100k tokens     | ⚠️ Warning  |
| 成本异常        | 单次请求 > $5              | ⚠️ Warning  |
| 重试风暴        | 10 秒内重试 > 5 次         | 🔴 Critical |
| Provider 不可用 | 连续 3 次失败              | 🔴 Critical |

**AI 增强检测（Phase 3）：**

- 学习历史流量模式，识别偏离基线的请求
- 自动关联异常事件（如：Provider X 延迟升高 + Provider Y 错误率升高 = 网络问题）
- 生成异常报告（自然语言描述）

### 3.3 执行层（Execution Layer）

#### 3.3.1 路由规则引擎

**条件字段：**
| 字段 | 类型 | 操作符 |
|------|------|--------|
| `request.model` | string | eq, ne, in, starts_with, exists |
| `context.streaming` | boolean | eq |
| `context.apiKeyName` | string | eq, in |
| `context.hour` | number | eq, gt, lt, gte, lte |
| `context.clientType` | string | eq, in |
| `perf.anomalyLevel` | enum | eq |
| `perf.successRate` | number | gt, lt, gte, lte |

**动作：**
| 动作 | 说明 |
|------|------|
| `route_to_group` | 路由到模型组（按实例优先级选择） |
| `route_to_instance` | 路由到指定实例 |
| `reject` | 拒绝请求 |
| `fallback` | 使用请求模型名透传 |

#### 3.3.2 熔断器

```
closed ──失败达阈值──→ open ──超时──→ half_open
  ↑                                    │
  │              ┌─────────────────────┘
  │              │ 探测成功
  └──────────────┘
  │              │ 探测失败
  └── cooldown ──┘
```

**配置参数：**

```typescript
interface CircuitBreakerConfig {
  failureThreshold: number // 触发熔断的失败次数（默认 3）
  openDurationMs: number // 熔断持续时间（默认 60s）
  maxBackoffMs: number // 最大退避时间（默认 30s）
  maxTripsBeforeCooldown: number // 触发冷却的次数（默认 5）
  cooldownDurationMs: number // 冷却期时长（默认 300s）
}
```

#### 3.3.3 协议转换

**Transformer Chain：**

```
Request → Ingress（协议检测）→ Normalize（标准模型）→ Route → Adapt（目标协议）→ Forward
Response → ResponseIngress → ResponseAdapt → ResponseEgress → Client
```

**已支持协议：**
| 协议 | Ingress | Egress | Stream | 状态 |
|------|---------|--------|--------|------|
| OpenAI | ✅ | ✅ | ✅ | 生产级 |
| Anthropic | ✅ | ✅ | ✅ | 生产级 |
| Gemini | ✅ | ✅ | ✅ | 生产级 |

### 3.4 管理层（Management Layer）

#### 3.4.1 管理 UI 页面

| 页面            | 功能                                       | 优先级 |
| --------------- | ------------------------------------------ | ------ |
| Dashboard       | 实时统计、请求数、成功率、延迟、Token 用量 | P0     |
| Providers       | Provider CRUD、API Key 管理、健康状态      | P0     |
| Model Groups    | 模型组 + 实例 CRUD、优先级配置             | P0     |
| Model Routes    | 虚拟模型 + 路由规则（可视化编辑器）        | P0     |
| Keys            | 虚拟密钥管理、速率限制、Token 额度         | P0     |
| Logs            | 请求日志查询、详情查看、导出               | P0     |
| Settings        | 配置导入/导出、系统设置                    | P0     |
| Circuit Breaker | 熔断器状态监控、手动触发/重置              | P1     |
| Access Models   | 访问模型白名单/黑名单                      | P1     |
| Metrics         | 性能指标、Provider 质量评分                | P1     |
| Client Models   | 客户端模型使用统计                         | P1     |
| Provider Stats  | Provider 级别统计面板                      | P1     |

#### 3.4.2 一键配置

**Cursor 配置：**

```bash
# 自动配置 Cursor 使用 x-llm-gateway
npx x-llm-gateway configure cursor

# 生成的配置：
# ~/.cursor/settings.json 中添加：
# "openai.apiBase": "http://localhost:3000/api/v1"
```

**Claude Desktop 配置：**

```bash
npx x-llm-gateway configure claude-desktop

# 生成的配置：
# ~/Library/Application Support/Claude/claude_desktop_config.json
# "ANTHROPIC_BASE_URL": "http://localhost:3000"
```

### 3.5 生态层（Ecosystem Layer）— Phase 3+

#### 3.5.1 插件系统

```typescript
interface Plugin {
  name: string
  version: string

  // 生命周期钩子
  onInit?(ctx: PluginContext): Promise<void>
  onRequest?(request: GatewayRequest): Promise<GatewayRequest>
  onResponse?(response: GatewayResponse): Promise<GatewayResponse>
  onError?(error: GatewayError): Promise<GatewayError>
  onShutdown?(): Promise<void>
}

interface PluginContext {
  config: GatewayConfig
  db: Database
  logger: Logger
  registerRoute: (path: string, handler: Handler) => void
  registerTransformer: (name: string, transformer: Transformer) => void
}
```

#### 3.5.2 AI 辅助 Provider 适配

```
用户："帮我添加 Moonshot/Kimi 作为 Provider"
  → AI 分析 Kimi API 文档
  → 生成 Transformer 代码（ingress/egress/stream）
  → 自动测试（mock provider）
  → 用户确认后注册到 TransformerRegistry
```

---

## 四、架构设计

### 4.1 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                         │
│  Cursor │ Claude Desktop │ Cline │ Open WebUI │ Custom App  │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP/HTTPS
┌──────────────────────────▼──────────────────────────────────┐
│                     Proxy Layer                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Base URL 直连模式（唯一接入方式）              │   │
│  └──────────────────────────┬───────────────────────────┘   │
│                             ▼                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Protocol Detection                     │    │
│  │  (detectProtocol: openai / anthropic / gemini)      │    │
│  └──────────────────────┬──────────────────────────────┘    │
└─────────────────────────┼───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Analysis Layer                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Cost Tracker│  │ Anomaly     │  │ Real-time Stream    │ │
│  │             │  │ Detection   │  │ (WebSocket/SSE)     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Execution Layer                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Route Rule  │  │ Model Group │  │ Circuit Breaker     │ │
│  │ Engine      │  │ Router      │  │ + Failover          │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                          │                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Transformer Chain                      │    │
│  │  OpenAI │ Anthropic │ Gemini │ (Plugin)             │    │
│  └──────────────────────┬──────────────────────────────┘    │
└─────────────────────────┼───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Provider Layer                            │
│  OpenAI API │ Anthropic API │ Gemini API │ Custom Provider  │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 数据模型

#### 核心表

```sql
-- Provider（上游服务商）
CREATE TABLE providers (
  id UUID PRIMARY KEY,
  name VARCHAR NOT NULL,
  base_url VARCHAR NOT NULL,
  protocol VARCHAR NOT NULL, -- 'openai' | 'anthropic' | 'gemini'
  api_key_encrypted VARCHAR,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Model Group（模型组）
CREATE TABLE model_groups (
  id UUID PRIMARY KEY,
  name VARCHAR NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Model Instance（模型实例）
CREATE TABLE model_instances (
  id UUID PRIMARY KEY,
  model_group_id UUID REFERENCES model_groups(id),
  provider_id UUID REFERENCES providers(id),
  model_name VARCHAR NOT NULL, -- 后端实际模型名
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  config JSONB, -- 实例级配置（参数变换、自定义头等）
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Virtual Key（虚拟密钥）
CREATE TABLE virtual_keys (
  id UUID PRIMARY KEY,
  name VARCHAR NOT NULL,
  key_hash VARCHAR NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  rate_limit_rpm INTEGER, -- 每分钟请求数限制
  token_quota INTEGER, -- Token 总额度
  token_used INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Route Rule（路由规则）
CREATE TABLE route_rules (
  id UUID PRIMARY KEY,
  name VARCHAR NOT NULL,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  conditions JSONB NOT NULL, -- 条件数组
  action JSONB NOT NULL, -- 动作配置
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Request Log（请求日志）
CREATE TABLE request_logs (
  id UUID PRIMARY KEY,
  request_group_id UUID NOT NULL,
  virtual_key_id UUID,
  model_name VARCHAR,
  provider_name VARCHAR,
  status VARCHAR, -- 'success' | 'failure' | 'pending'
  status_code INTEGER,
  response_time_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  streaming VARCHAR, -- 'true' | 'false'
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cost Record（成本记录）
CREATE TABLE cost_records (
  id UUID PRIMARY KEY,
  request_log_id UUID REFERENCES request_logs(id),
  key_id UUID,
  model_name VARCHAR,
  provider_name VARCHAR,
  input_tokens INTEGER,
  output_tokens INTEGER,
  input_cost DECIMAL(10,6),
  output_cost DECIMAL(10,6),
  total_cost DECIMAL(10,6),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Anomaly Event（异常事件）
CREATE TABLE anomaly_events (
  id UUID PRIMARY KEY,
  type VARCHAR NOT NULL, -- 'slow_request' | 'high_error_rate' | ...
  severity VARCHAR NOT NULL, -- 'warning' | 'critical'
  provider_name VARCHAR,
  model_name VARCHAR,
  description TEXT,
  details JSONB,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.3 API 设计

#### Gateway API（客户端调用）

```
POST /api/v1/chat/completions     # OpenAI Chat Completions
POST /api/v1/responses            # OpenAI Responses
POST /api/v1/messages             # Anthropic Messages
POST /api/v1/messages/count_tokens # Anthropic Token Count
GET  /api/v1/models               # 可用模型列表
```

#### Management API（管理 UI 调用）

```
# Provider
GET    /api/providers
POST   /api/providers
PUT    /api/providers/:id
DELETE /api/providers/:id

# Model Group
GET    /api/model-groups
POST   /api/model-groups
PUT    /api/model-groups/:id
DELETE /api/model-groups/:id

# Model Instance
GET    /api/model-groups/:groupId/instances
POST   /api/model-groups/:groupId/instances
PUT    /api/instances/:id
DELETE /api/instances/:id

# Virtual Key
GET    /api/keys
POST   /api/keys
PUT    /api/keys/:id
DELETE /api/keys/:id
POST   /api/keys/:id/reset

# Route Rule
GET    /api/model-routes
POST   /api/model-routes
PUT    /api/model-routes/:id
DELETE /api/model-routes/:id

# Logs
GET    /api/logs
GET    /api/logs/:id
DELETE /api/logs/cleanup

# Cost
GET    /api/costs/summary
GET    /api/costs/by-model
GET    /api/costs/by-provider
GET    /api/costs/by-key

# Anomaly
GET    /api/anomalies
POST   /api/anomalies/:id/resolve

# Circuit Breaker
GET    /api/circuit-breaker/status
POST   /api/circuit-breaker/trip/:instanceId
POST   /api/circuit-breaker/reset/:instanceId

# Settings
GET    /api/settings
PUT    /api/settings
POST   /api/config/export
POST   /api/config/import

# Health
GET    /health
GET    /health/ready
```

### 4.4 实时数据流

```
请求进入 → logEventBus.emit('request:start', data)
         → WebSocket 推送到前端
         → 前端实时更新列表

请求完成 → logEventBus.emit('request:complete', data)
         → WebSocket 推送更新
         → 成本计算 + 写入 cost_records
         → 异常检测（如果触发规则，写入 anomaly_events）

定时任务 → 每 5 分钟聚合 metrics
         → 每小时清理过期日志
         → 每天生成 Provider 健康评分
```

---

## 五、UI 交互设计

### 5.1 Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  x-llm-gateway                                    [Settings]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ 请求/分   │ │ 成功率    │ │ 平均延迟  │ │ 今日花费  │       │
│  │   127    │ │  98.4%   │ │  890ms   │ │  $12.50  │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  最近 1 小时请求趋势图                               │    │
│  │  ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁▂▃▄▅▆▇█▇▆▅                       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  实时请求流                                          │    │
│  │  ┌──────┬────────┬────────┬──────┬──────┬────────┐  │    │
│  │  │ 时间 │ 客户端  │ 模型    │ 状态 │ 延迟 │ Token  │  │    │
│  │  ├──────┼────────┼────────┼──────┼──────┼────────┤  │    │
│  │  │ 12:01│ Cursor │ gpt-4  │ 200  │ 1.2s │ 1.5k   │  │    │
│  │  │ 12:01│ Claude │ claude │ 200  │ 0.8s │ 2.1k   │  │    │
│  │  │ 12:00│ Cline  │ gpt-4  │ 500  │ 3.2s │ -      │  │    │
│  │  └──────┴────────┴────────┴──────┴──────┴────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 流量查看器（类似 Chrome DevTools）

```
┌─────────────────────────────────────────────────────────────┐
│  流量查看器                                    [Filter ▼]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────┐  ┌─────────────────────────────┐ │
│  │  请求列表              │  │  请求详情                    │ │
│  │                       │  │                             │ │
│  │  ● 12:01:23 gpt-4    │  │  Headers                    │ │
│  │    Cursor → OpenAI    │  │  POST /v1/chat/completions  │ │
│  │    200 | 1.2s | 1.5k │  │  Authorization: Bearer sk-..│ │
│  │                       │  │  Content-Type: application/ │ │
│  │  ● 12:01:20 claude   │  │                             │ │
│  │    Claude → Anthropic │  │  Body                       │ │
│  │    200 | 0.8s | 2.1k │  │  {                          │ │
│  │                       │  │    "model": "gpt-4",        │ │
│  │  ● 12:01:18 gpt-4    │  │    "messages": [...]        │ │
│  │    Cline → OpenAI     │  │  }                          │ │
│  │    500 | 3.2s | -     │  │                             │ │
│  │                       │  │  Response                   │ │
│  │                       │  │  {                          │ │
│  │                       │  │    "choices": [...]         │ │
│  │                       │  │  }                          │ │
│  │                       │  │                             │ │
│  │                       │  │  Timing                     │ │
│  │                       │  │  TTFB: 230ms               │ │
│  │                       │  │  Total: 1.2s                │ │
│  │                       │  │  Tokens: 1.5k               │ │
│  └───────────────────────┘  └─────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 一键配置页面

```
┌─────────────────────────────────────────────────────────────┐
│  快速开始                                          [Skip →] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  第一步：安装本地 CA 证书                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  [下载证书]  [安装到系统钥匙串]  ✓ 已安装            │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  第二步：配置你的 AI 工具                                     │
│                                                             │
│  ┌─────────────────────┐ ┌─────────────────────┐           │
│  │  🖥️ Cursor          │ │  🤖 Claude Desktop  │           │
│  │  [一键配置]          │ │  [一键配置]          │           │
│  │  或手动设置:         │ │  或手动设置:         │           │
│  │  base URL:          │ │  环境变量:           │           │
│  │  localhost:3000     │ │  ANTHROPIC_BASE_URL  │           │
│  └─────────────────────┘ └─────────────────────┘           │
│                                                             │
│  ┌─────────────────────┐ ┌─────────────────────┐           │
│  │  📝 Cline           │ │  🌐 Open WebUI      │           │
│  │  [一键配置]          │ │  [一键配置]          │           │
│  └─────────────────────┘ └─────────────────────┘           │
│                                                             │
│  第三步：添加你的 Provider                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Provider: [OpenAI ▼]                               │    │
│  │  API Key:  [sk-••••••••••••••••••••••••]            │    │
│  │  Base URL: [https://api.openai.com/v1]              │    │
│  │                                       [Test] [Save] │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 六、研发计划

### Phase 0: 修复实时请求功能（前置任务）✅ 已完成

**状态：** ✅ 已完成（Commit: `3d35c43`）

**完成内容：**

- 修复 `use-live-logs.ts` 协议：从 WebSocket 改为 Fetch SSE reader
- 修复事件 payload 字段对齐
- 验证 SSE 端点正常工作
- 验证 LiveLogsPanel 正常显示
- 验证取消功能

---

### Phase 1: 核心代理 MVP（4-6 周）

**目标：** 让 opencode/claude-code/pi 用户 5 分钟内跑起来

| 周次 | 任务                        | 产出                                            | 状态                |
| ---- | --------------------------- | ----------------------------------------------- | ------------------- |
| W1   | Base URL 直连模式           | 客户端配置 base URL 指向网关                    | ✅ 已有             |
| W1   | 协议检测 + 透传             | 自动识别 OpenAI/Anthropic 请求                  | ✅ 已有             |
| W2   | 客户端一键配置脚本          | `xgate configure opencode/claude-code/pi/codex` | ✅ 已完成 `258f2da` |
| W3   | 协议转换完善                | OpenAI ↔ Anthropic 双向转换                     | ✅ 已有             |
| W3   | 虚拟模型路由                | 条件规则引擎                                    | ✅ 已有             |
| W4   | 虚拟密钥 + 速率限制         | Key 管理 + RPM/Token 限制                       | ✅ 已完成 `3d35c43` |
| W4   | 熔断器 + 故障转移           | 生产级可靠性                                    | ✅ 已有             |
| W5   | 请求日志 + 管理 UI          | Dashboard + Logs 页面                           | ✅ 已有             |
| W5   | Provider + Model Group 管理 | CRUD 页面                                       | ✅ 已有             |
| W6   | 集成测试 + Bug 修复         | 稳定版本                                        | ⬜ 待做             |
| W6   | Docker 部署 + 文档          | 一键部署                                        | ⬜ 待做             |

### Phase 2: 智能分析（3-4 周）

**目标：** 让用户看清流量、算清成本、发现异常

| 周次 | 任务               | 产出                                     | 状态                         |
| ---- | ------------------ | ---------------------------------------- | ---------------------------- |
| W7   | 成本追踪系统       | Token 单价配置 + 花费统计                | ✅ 已完成 `3f731bf`          |
| W7   | 成本统计 UI        | 按 Key/Model/Provider 统计               | ✅ 已完成 `2cc8b7f`          |
| W7   | 密钥用量统计持久化 | lastUsedAt + totalRequests + totalTokens | ✅ 已完成 `9133ff0`          |
| W8   | 实时流量推送       | SSE + 前端实时更新                       | ✅ 已完成（Phase 0）         |
| W8   | 请求/响应查看器    | Chrome DevTools 风格                     | ✅ 已有 22 个组件            |
| W9   | 异常检测引擎       | 自动识别慢请求、高错误率等               | ✅ 已完成 `dace811`          |
| W9   | 异常告警 UI        | 异常列表 + 详情 + 解决                   | ✅ 已完成 `dace811`          |
| W10  | Provider 健康评分  | 自动打分 + 趋势图                        | ✅ 已有 ProviderQualityTable |
| W10  | 性能指标 Dashboard | 延迟分布、吞吐量、错误率                 | ✅ 已完成 `1f6c85c`          |

### Phase 3: AI-native 扩展

**目标：** 让 AI 帮用户扩展产品

| 周次 | 任务                   | 产出                                 | 状态                |
| ---- | ---------------------- | ------------------------------------ | ------------------- |
| W11  | packages/ai-agent 框架 | Agent + Tool + Skill 定义（零依赖）  | ✅ 已完成 `81c4b99` |
| W11  | engine 适配            | LLMAdapter + Tool 执行器 + Agent API | ✅ 已完成 `ffb2820` |
| W11  | AI 错误诊断 + 自动修复 | 诊断 API + 模式学习 + 管理 UI        | ✅ 已完成 `283041d` |
| W12  | AI 配置生成器增强      | 支持 requestInject/responseExtract   | ✅ 已完成 `6a6a412` |

### Phase 4: 体验打磨（国际化与主题）

**目标：** 让管理界面支持多语言与深色主题，提升开发者使用体验

| 任务           | 产出                                                                                            | 状态      |
| -------------- | ----------------------------------------------------------------------------------------------- | --------- |
| i18n 基础设施  | 文案抽取 + 语言切换 + zh/en 双语包                                                              | 📋 计划中 |
| Dark mode 启用 | ThemeProvider(next-themes) + 切换按钮 + 全局令牌已预留（见 `docs/ui-consistency-spec.md` §1.1） | 📋 计划中 |
| UI 一致性重构  | 语义色令牌 + PageHeader/StatCard/EmptyState 共享组件 + 裸色清理                                 | 🔨 进行中 |

> **说明**：UI 一致性重构（2026-08-03 启动）已将 `--success/--warning/--info` 令牌及其 `.dark` 值预先定义，dark mode 启用时仅需接入 ThemeProvider 与切换 UI，无需重跑裸色替换。

---

## 七、技术风险与缓解

| 风险              | 影响             | 缓解措施           |
| ----------------- | ---------------- | ------------------ |
| Provider API 变更 | Transformer 失效 | AI 自动检测 + 适配 |

---

## 八、成功指标

### MVP（Phase 1 完成后）

| 指标                                      | 目标             | 状态 |
| ----------------------------------------- | ---------------- | ---- |
| opencode/claude-code/pi 用户 5 分钟跑起来 | 一键配置         | ✅   |
| 支持 OpenAI + Anthropic                   | 协议转换         | ✅   |
| 故障自动转移                              | 熔断器 + 重试    | ✅   |
| 管理 UI 可用                              | Dashboard + Logs | ✅   |

### Phase 2 完成后

| 指标       | 目标                       | 状态 |
| ---------- | -------------------------- | ---- |
| 成本可见   | 按 Key/Model/Provider 统计 | ✅   |
| 异常可发现 | 自动检测 + 告警            | ✅   |
| 流量可分析 | 实时看板 + 请求详情        | ✅   |

### Phase 3 完成后

| 指标              | 目标                          | 状态 |
| ----------------- | ----------------------------- | ---- |
| AI 辅助配置       | 生成 InstanceConfig           | ✅   |
| AI 错误诊断       | 自动分析错误 + 建议修复       | ✅   |
| Provider 动态扩展 | requestInject/responseExtract | ✅   |
