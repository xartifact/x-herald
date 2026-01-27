# x-llm-gateway 架构设计文档 v2.0

**项目**: x-llm-gateway
**日期**: 2026-01-25
**版本**: 2.0.0 (基于 llm-gateway 项目优化)
**作者**: Claude & Team

---

## 📋 项目定位

x-llm-gateway 是 llm-gateway 项目的现代化重构版本，采用更现代的技术栈，同时保留并增强核心功能。

### 与原项目的关系
- **继承**: 协议转换、Expert Router、健康监控等核心功能
- **创新**: 虚拟模型映射、实时可用性管理、现代化技术栈
- **优化**: 更轻量的运行时、更好的类型安全、更简洁的架构

---

## 🎯 核心价值主张

### 1. 统一接口 + 协议转换 ⭐⭐⭐
- 整合 20+ LLM 提供商
- OpenAI ↔ Anthropic ↔ Gemini 协议互转
- 工具调用格式转换
- 流式响应支持

### 2. 智能路由系统 ⭐⭐⭐
- **Expert Router**: 基于意图的专家路由
- **虚拟模型映射**: 一对多模型映射（新增）
- **多种路由策略**: 轮询、权重、最低延迟、优先级、智能

### 3. 高可用性保障 ⭐⭐
- 实时可用性管理层（新增）
- 断路器 + 自动故障转移
- 健康监控 + 可用率统计
- 负载均衡

### 4. 灵活的访问控制 ⭐
- 虚拟密钥管理
- 速率限制（RPM/RPD）
- Token 额度控制
- 模型访问权限

### 5. 可观测性 ⭐
- 请求日志记录
- 性能指标收集
- 实时监控仪表盘
- 成本追踪

---

## 🛠️ 技术栈选择

### 后端
- **Runtime**: Bun (更快的启动速度和执行性能)
- **框架**: Hono (轻量级，类型安全，边缘友好)
- **语言**: TypeScript
- **数据库**: PostgreSQL 16 (更好的 JSON 支持和扩展性)
- **ORM**: Drizzle ORM (类型安全，零运行时开销)
- **认证**: JWT

### 前端
- **框架**: React 19 (最新特性)
- **路由**: TanStack Start (全栈 React 框架)
- **UI**: shadcn/ui + TailwindCSS (现代化组件库)
- **状态管理**: TanStack Query (服务端状态) + Zustand (客户端状态)
- **构建**: Vite

### 架构
- **Monorepo**: Bun workspaces
- **代码组织**: Bulletproof-React 风格（功能切片）
- **部署**: Docker / Docker Compose

### 技术栈对比

| 维度 | llm-gateway | x-llm-gateway | 理由 |
|------|-------------|---------------|------|
| Runtime | Bun/Node.js | Bun | 更快的性能 |
| 后端框架 | Fastify | Hono | 更轻量，边缘友好 |
| 前端框架 | Vue 3 | React 19 | 生态更丰富 |
| 数据库 | MySQL | PostgreSQL | 更好的 JSON 支持 |
| ORM | 原生 SQL | Drizzle | 类型安全 |
| UI 库 | Naive UI | shadcn/ui | 更现代化 |

---

## 🏗️ 整体架构

### Monorepo 结构

```
x-llm-gateway/
├── apps/
│   ├── backend/              # Hono API Server
│   │   ├── src/
│   │   │   ├── features/     # 功能模块
│   │   │   │   ├── proxy/    # LLM 请求代理
│   │   │   │   ├── providers/# 供应商管理
│   │   │   │   ├── models/   # 模型管理
│   │   │   │   ├── virtual-keys/ # 虚拟密钥
│   │   │   │   ├── health/   # 健康监控
│   │   │   │   └── expert-router/ # 智能路由(继承)
│   │   │   ├── lib/          # 核心库
│   │   │   │   ├── availability/ # 可用性管理 + 断路器
│   │   │   │   ├── routing/  # 路由策略
│   │   │   │   ├── protocol-converter/ # 协议转换(继承)
│   │   │   │   ├── provider-adapter/   # 提供商适配器(继承)
│   │   │   │   ├── logger.ts # 日志系统
│   │   │   │   └── metrics.ts# 内存指标收集
│   │   │   ├── middleware/   # 中间件
│   │   │   │   ├── auth.ts   # JWT 认证
│   │   │   │   ├── rate-limit.ts # 速率限制
│   │   │   │   └── error.ts  # 错误处理
│   │   │   ├── config/       # 配置加载
│   │   │   └── index.ts      # 入口文件
│   │   └── package.json
│   └── web/                  # TanStack Start + React
│       ├── app/
│       │   ├── routes/       # 路由定义
│       │   ├── features/     # 功能模块
│       │   │   ├── providers/# 供应商管理
│       │   │   ├── models/   # 模型管理
│       │   │   ├── virtual-keys/ # 虚拟密钥
│       │   │   ├── dashboard/# 监控仪表盘
│       │   │   └── health/   # 健康监控
│       │   ├── components/   # 共享组件
│       │   ├── lib/          # 工具函数、hooks
│       │   └── services/     # API 客户端
│       └── package.json
├── packages/
│   ├── shared/               # 共享类型定义、工具函数
│   │   ├── src/
│   │   │   ├── types/        # TypeScript 类型
│   │   │   ├── constants/    # 常量定义
│   │   │   └── utils/        # 工具函数
│   │   └── package.json
│   ├── database/             # Drizzle ORM schema、migrations
│   │   ├── src/
│   │   │   ├── schema/       # 数据库 schema
│   │   │   ├── migrations/   # 迁移文件
│   │   │   └── client.ts     # 数据库客户端
│   │   └── package.json
│   └── config/               # 配置文件类型和加载逻辑
│       ├── src/
│       │   ├── schema.ts     # 配置类型定义
│       │   └── loader.ts     # 配置加载器
│       └── package.json
├── config/
│   └── gateway.config.ts     # 系统级配置文件
├── docs/                     # 文档和设计
│   ├── plans/                # 架构设计文档
│   ├── protocols/            # 协议转换文档
│   └── guides/               # 开发指南
├── .gitignore
├── package.json              # 根 package.json
├── bun.lockb
└── tsconfig.json
```

---

## 💎 核心功能设计

### 1. 协议转换系统（继承自 llm-gateway）⭐⭐⭐

**功能**:
- OpenAI ↔ Anthropic ↔ Gemini 双向转换
- 请求/响应格式转换
- 工具调用格式转换 (Function Calling / Tool Use)
- 流式响应支持 (SSE)
- Token 统计转换

**实现路径**: `apps/backend/src/lib/protocol-converter/`

**核心类**:
```typescript
class ProtocolConverter {
  static convertOpenAIToAnthropic(request: OpenAIChatRequest): AnthropicRequest
  static convertAnthropicToOpenAI(response: AnthropicResponse): OpenAIChatResponse
  static convertOpenAIStreamChunkToAnthropic(chunk: any): any
  static convertAnthropicStreamChunkToOpenAI(chunk: any): any
}
```

**使用场景**:
- 使用 OpenAI 格式调用 Claude 模型
- 使用 Anthropic 格式调用 GPT 模型
- 跨协议工具调用

### 2. Expert Router（智能路由）（继承自 llm-gateway）⭐⭐⭐

**功能**:
- 基于意图的专家分类
- 三层决策架构
- 本地 embedding 模型支持
- Slash 命令支持

**三层决策架构**:
1. **L2: Heuristics (规则修正)** - Slash 命令、工具调用信号
2. **L1: Semantic Router (语义路由)** - 本地 embedding + 相似度匹配
3. **L3: LLM Judge (兜底)** - 调用分类模型

**实现路径**: `apps/backend/src/features/expert-router/`

**核心类**:
```typescript
interface RouteDecision {
  category: string;
  confidence: number;
  source: 'l1_semantic' | 'l2_heuristic' | 'l3_llm';
  expertId?: string;
  toolPolicy?: ToolPolicy;
}

class ExpertRouter {
  route(signal: RoutingSignal, context: RoutingContext): Promise<ExpertRoutingResult>
  resolveExpert(category: string): Promise<Expert>
}
```

**支持的意图分类**:
- debug, explain, feature, plan, refactor, review, setup, test

### 3. 虚拟模型映射（新增）⭐⭐

**核心概念**:
- 一个虚拟模型可以映射到多个物理模型
- 支持多种路由策略（轮询、权重、最低延迟等）
- 自动故障转移
- 与 Expert Router 解耦，更灵活

**数据结构**:
```typescript
// 虚拟供应商
{
  id: "virtual-provider",
  type: "system",
  name: "virtual"
}

// 虚拟模型
{
  id: "vm-smart-chat",
  provider_id: "virtual-provider",
  name: "smart-chat",
  routing_config: {
    strategy: "weighted",
    fallback_enabled: true
  }
}

// 路由映射
{
  virtual_model_id: "vm-smart-chat",
  physical_model_id: "gpt-4",
  weight: 70
}
{
  virtual_model_id: "vm-smart-chat",
  physical_model_id: "claude-3-opus",
  weight: 30
}
```

**使用场景**:
- 负载均衡：将请求分散到多个供应商
- 成本优化：优先使用便宜的模型，失败后切换到更贵的
- 高可用：某个供应商宕机时自动切换

### 4. 可用性管理层 + 断路器（新增）⭐⭐

**核心设计**:
- 内存中维护所有模型和供应商的实时可用性状态
- 每个 provider 都有独立的断路器
- 请求处理时只从"可用"的模型和供应商中选择
- 自动故障恢复

**实现路径**: `apps/backend/src/lib/availability/`

**核心类**:
```typescript
class AvailabilityManager {
  getAvailableModel(name: string): Model | null
  getAvailableRoutes(virtualModelId: string): ModelRoute[]
  recordResult(providerId: string, success: boolean, latency: number): void
}

class CircuitBreaker {
  isAvailable(): boolean
  recordSuccess(latency: number): void
  recordFailure(): void
  getState(): CircuitState
}
```

**断路器状态机**:
```
CLOSED (正常)
  ↓ (连续失败 3 次)
OPEN (拒绝请求)
  ↓ (60 秒后)
HALF_OPEN (尝试恢复)
  ↓ (成功 3 次)
CLOSED
```

### 5. 健康监控系统（继承 + 增强）⭐

**继承自 llm-gateway**:
- 定期健康检查
- 可用率统计 (1h/24h)
- P50/P95 延迟指标
- 公开健康检查页面（无需登录）

**新增增强**:
- 与断路器集成
- 实时可用性状态
- 更细粒度的错误分类

**实现路径**: `apps/backend/src/features/health/`

### 6. Provider Adapter（提供商适配器）（继承自 llm-gateway）⭐

**功能**:
- 统一不同 LLM 提供商的 API 接口
- 流式响应处理
- 错误处理和重试
- 超时控制

**实现路径**: `apps/backend/src/lib/provider-adapter/`

**核心类**:
```typescript
interface ProviderAdapter {
  sendRequest(config: ProviderConfig, body: any): Promise<any>
  handleStreamResponse(response: Response, onChunk: (chunk: any) => void): Promise<void>
}

class BaseAdapter implements ProviderAdapter { ... }
class OpenAICompatibleAdapter extends BaseAdapter { ... }
class AnthropicAdapter extends BaseAdapter { ... }
class GoogleGeminiAdapter extends BaseAdapter { ... }
```

### 7. LiteLLM 预设集成（继承自 llm-gateway）⭐

**功能**:
- 自动从 LiteLLM 官方库获取模型配置
- 支持 20+ 提供商
- 减少手动配置工作

**支持的提供商**:
- OpenAI, Anthropic, Google (Gemini)
- DeepSeek, Moonshot, Zhipu AI
- Alibaba (通义千问), Baidu (文心一言)
- 以及其他兼容 OpenAI API 的提供商

---

## 💾 数据库设计

### 核心表结构

#### providers (供应商表)
```sql
CREATE TABLE providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(20) NOT NULL CHECK (type IN ('external', 'system')),
  name VARCHAR(255) NOT NULL,
  base_url VARCHAR(512),
  api_key TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0,
  weight INTEGER DEFAULT 100,
  max_requests_per_min INTEGER,
  timeout_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_providers_type ON providers(type);
CREATE INDEX idx_providers_enabled ON providers(enabled);
```

#### models (模型表)
```sql
CREATE TABLE models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL UNIQUE,
  display_name VARCHAR(255),
  actual_model_name VARCHAR(255),

  -- 虚拟模型路由配置
  routing_config JSONB,

  -- 协议转换配置（继承自 llm-gateway）
  protocol_conversion JSONB,

  capabilities JSONB,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_models_name ON models(name);
CREATE INDEX idx_models_provider ON models(provider_id);
CREATE INDEX idx_models_enabled ON models(enabled);
```

**routing_config 字段格式**:
```json
{
  "strategy": "weighted",
  "fallback_enabled": true,
  "params": {}
}
```

**protocol_conversion 字段格式**（继承）:
```json
{
  "enabled": true,
  "target_protocol": "anthropic",
  "preserve_original": false
}
```

#### model_routes (路由映射表)
```sql
CREATE TABLE model_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  virtual_model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  physical_model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  weight INTEGER DEFAULT 100,
  priority INTEGER DEFAULT 0,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT check_different_models CHECK (virtual_model_id != physical_model_id)
);

CREATE INDEX idx_model_routes_virtual ON model_routes(virtual_model_id);
CREATE INDEX idx_model_routes_physical ON model_routes(physical_model_id);
CREATE INDEX idx_model_routes_enabled ON model_routes(enabled);
```

#### virtual_keys (虚拟密钥表)
```sql
CREATE TABLE virtual_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  allowed_models TEXT[],
  rate_limit_rpm INTEGER,
  rate_limit_rpd INTEGER,
  token_limit_daily BIGINT,
  enabled BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_virtual_keys_key ON virtual_keys(key);
CREATE INDEX idx_virtual_keys_enabled ON virtual_keys(enabled);
```

#### request_logs (请求日志表)
```sql
CREATE TABLE request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  virtual_key_id UUID REFERENCES virtual_keys(id),
  model_name VARCHAR(255),
  provider_id UUID REFERENCES providers(id),
  status VARCHAR(20) CHECK (status IN ('success', 'failure')),
  latency_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  error_message TEXT,
  request_body JSONB,
  response_body JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_request_logs_virtual_key ON request_logs(virtual_key_id);
CREATE INDEX idx_request_logs_created_at ON request_logs(created_at);
CREATE INDEX idx_request_logs_status ON request_logs(status);
```

#### health_targets (健康检查目标表)
```sql
CREATE TABLE health_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) CHECK (type IN ('model', 'virtual_model')),
  target_id UUID NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  check_interval_seconds INTEGER DEFAULT 300,
  check_prompt VARCHAR(512) DEFAULT 'Say "OK"',
  check_config JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### health_runs (健康检查历史表)
```sql
CREATE TABLE health_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID NOT NULL REFERENCES health_targets(id) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) CHECK (status IN ('healthy', 'degraded', 'down')),
  latency_ms INTEGER,
  error_type VARCHAR(64),
  error_message TEXT
);

CREATE INDEX idx_health_runs_target ON health_runs(target_id);
CREATE INDEX idx_health_runs_checked_at ON health_runs(checked_at);
```

#### expert_routing_config (专家路由配置表)
```sql
CREATE TABLE expert_routing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled BOOLEAN DEFAULT FALSE,
  routing_mode VARCHAR(20) CHECK (routing_mode IN ('llm', 'semantic', 'hybrid')) DEFAULT 'hybrid',
  config JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**config 字段格式**:
```json
{
  "classifier_model": "gpt-4",
  "categories": ["debug", "explain", "feature", "plan", "refactor", "review", "setup", "test"],
  "routing": {
    "semantic": {
      "enabled": true,
      "model": "bge-small-zh-v1.5",
      "threshold": 0.7,
      "margin": 0.1,
      "routes": [
        {
          "category": "debug",
          "utterances": ["fix the bug", "debug this error", "troubleshoot"]
        }
      ]
    }
  },
  "experts": [
    {
      "category": "debug",
      "provider_id": "xxx",
      "model_id": "xxx",
      "tool_policy": {
        "mode": "standard"
      }
    }
  ]
}
```

---

## 🔄 请求处理流程

### 完整流程图

```
客户端请求
  ↓
[1] JWT 认证 (middleware/auth.ts)
  ↓
[2] 虚拟密钥验证
  ↓
[3] 速率限制检查 (middleware/rate-limit.ts)
  ↓
[4] 解析目标模型
  ↓
[5] Expert Router? (如果启用)
  ├─ L2: Heuristics
  ├─ L1: Semantic Router
  └─ L3: LLM Judge
  ↓
[6] 从 AvailabilityManager 获取可用模型
  ↓ (模型不可用)
  返回 503 Service Unavailable
  ↓ (模型可用)
[7] 判断模型类型
  ├─ 物理模型 → 直接转发
  └─ 虚拟模型 → 获取可用路由
  ↓
[8] 路由策略选择目标
  ↓
[9] 协议转换? (如果配置了 protocol_conversion)
  ↓
[10] Provider Adapter 转发请求
  ↓ (失败)
  记录失败 → 更新断路器 → 故障转移?
  ↓ (成功)
  记录成功 → 更新断路器
  ↓
[11] 协议转换响应? (如果配置了)
  ↓
[12] 记录请求日志
  ↓
返回响应给客户端
```

### 关键决策点

**1. Expert Router 启用判断**
```typescript
if (expertRoutingConfig.enabled) {
  const routingResult = await expertRouter.route(signal, context);
  targetModel = routingResult.expert.model;
} else {
  targetModel = requestBody.model;
}
```

**2. 虚拟模型 vs 物理模型**
```typescript
const model = availabilityManager.getAvailableModel(targetModel);
if (!model) return 503;

if (model.provider.type === 'system') {
  // 虚拟模型：需要路由选择
  const routes = availabilityManager.getAvailableRoutes(model.id);
  const selected = routingStrategy.select(routes);
  targetProvider = selected.provider;
} else {
  // 物理模型：直接使用
  targetProvider = model.provider;
}
```

**3. 协议转换判断**
```typescript
if (model.protocol_conversion?.enabled) {
  const targetProtocol = model.protocol_conversion.target_protocol;
  convertedRequest = ProtocolConverter.convert(request, targetProtocol);
}
```

---

## 📅 开发路线图

> **重要变更**: 本项目采用**功能驱动的全栈同步开发模式**。每个功能都会同时完成前端和后端，然后再进入下一个功能。
>
> 📖 **详细的开发路线图**: [DEVELOPMENT-ROADMAP.md](../DEVELOPMENT-ROADMAP.md)

### 开发阶段概览

| Phase | 功能模块 | 后端 | 前端 | 状态 |
|-------|---------|------|------|------|
| 1 | 项目基础设施 | ✅ | ✅ | 已完成 |
| 2 | 供应商管理（全栈） | ✅ | 🔄 | 进行中 |
| 3 | 模型管理（全栈） | ✅ | 📋 | 规划中 |
| 4 | 虚拟密钥管理（全栈） | 📋 | 📋 | 规划中 |
| 5 | LLM 代理基础（全栈） | 📋 | 📋 | 规划中 |
| 6 | 虚拟模型路由（全栈） | 📋 | 📋 | 规划中 |
| 7 | 协议转换（全栈） | 📋 | 📋 | 规划中 |
| 8 | Expert Router（全栈） | 📋 | 📋 | 规划中 |
| 9 | 监控可观测性（全栈） | 📋 | 📋 | 规划中 |

### 当前优先级

1. **Phase 2: 完善供应商管理前端** ⭐⭐⭐
   - 使用 shadcn/ui 重构界面
   - 实现完整的 CRUD 操作
   - 添加表单验证和错误处理

2. **Phase 3: 完成模型管理全栈** ⭐⭐⭐
   - 后端已完成，需要实现前端
   - LiteLLM 预设导入功能
   - 协议转换配置界面

### 为什么采用全栈同步开发？

| 传统模式 | 全栈同步模式 | 优势 |
|---------|------------|------|
| 先完成所有后端 API | 每个功能同时做前后端 | ✅ 更快看到成果 |
| 前后端分离开发 | 前后端紧密协作 | ✅ 减少返工 |
| 后期集成测试 | 边开发边测试 | ✅ 更早发现问题 |
| 延迟交付价值 | 快速交付价值 | ✅ 更好的反馈循环 |

---

## 🔄 与 llm-gateway 的差异

### 继承的功能 ✅

| 功能 | llm-gateway | x-llm-gateway | 说明 |
|------|-------------|---------------|------|
| 协议转换 | ✅ | ✅ | 保留完整实现 |
| Expert Router | ✅ | ✅ | 保留三层架构 |
| Provider Adapter | ✅ | ✅ | 保留适配器模式 |
| 健康监控 | ✅ | ✅ | 保留定期检查 |
| LiteLLM 预设 | ✅ | ✅ | 保留自动导入 |
| 虚拟密钥 | ✅ | ✅ | 保留密钥系统 |

### 新增的功能 🆕

| 功能 | llm-gateway | x-llm-gateway | 优势 |
|------|-------------|---------------|------|
| 虚拟模型映射 | ❌ | ✅ | 更灵活的路由 |
| 实时可用性管理 | ❌ | ✅ | 内存状态管理 |
| 断路器机制 | 部分 | ✅ | 完整的状态机 |
| 现代化技术栈 | ❌ | ✅ | Hono + React 19 |

### 优化的方面 🔧

| 方面 | llm-gateway | x-llm-gateway | 改进 |
|------|-------------|---------------|------|
| 数据库 | MySQL | PostgreSQL | 更好的 JSON 支持 |
| ORM | 原生 SQL | Drizzle | 类型安全 |
| 前端框架 | Vue 3 | React 19 | 生态更丰富 |
| 代码组织 | 分层架构 | Bulletproof 风格 | 功能切片更清晰 |

---

## 📚 参考资料

### 官方文档
- [Hono Documentation](https://hono.dev/)
- [TanStack Start](https://tanstack.com/start)
- [Drizzle ORM](https://orm.drizzle.team/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Bun Documentation](https://bun.sh/docs)

### 架构模式
- [Bulletproof React](https://github.com/alan2207/bulletproof-react)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Adapter Pattern](https://refactoring.guru/design-patterns/adapter)
- [Strategy Pattern](https://refactoring.guru/design-patterns/strategy)

### 参考项目
- [llm-gateway](~/Workspaces/GitHub/zbin/llm-gateway) - 原始项目
- [LiteLLM](https://github.com/BerriAI/litellm) - LLM 代理参考

---

**文档状态**: ✅ 已完成
**版本**: 2.0.0
**最后更新**: 2026-01-25
**下一步**: 开始 Phase 1 实施
