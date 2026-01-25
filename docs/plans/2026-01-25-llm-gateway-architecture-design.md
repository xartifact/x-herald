# LLM Gateway 架构设计文档

**项目**: x-llm-gateway
**日期**: 2026-01-25
**版本**: 1.0.0
**作者**: Claude & Team

## 📋 项目概述

x-llm-gateway 是一个基于 bun.sh 构建的 LLM Gateway 项目，用于管理不同 LLM 供应商的模型接入和服务可用性提升。

### 核心目标
- **多供应商管理**: 统一接入 OpenAI、Anthropic、Google 等多个 LLM 供应商
- **高可用性**: 负载均衡、故障转移、健康检查、断路器机制
- **灵活路由**: 虚拟模型映射、可配置路由策略
- **性能优化**: 内存缓存、批量持久化、高性能代理

### 技术栈
- **Runtime**: Bun
- **Backend**: Hono
- **Frontend**: TanStack Start + React 19
- **Database**: PostgreSQL + Drizzle ORM
- **UI**: shadcn/ui + TailwindCSS
- **架构风格**: Bulletproof-React (功能切片)

---

## 🏗️ 整体架构

### Monorepo 结构
```
x-llm-gateway/
├── apps/
│   ├── backend/          # Hono API Server
│   └── web/              # TanStack Start + React
├── packages/
│   ├── shared/           # 共享类型定义、工具函数
│   ├── database/         # Drizzle ORM schema、migrations
│   └── config/           # 配置文件类型和加载逻辑
├── config/
│   └── gateway.config.ts # 系统级配置文件
└── docs/                 # 文档和设计
```

### 前端架构 (Bulletproof-React)
```
apps/web/app/
├── routes/              # TanStack Start 路由
├── features/            # 功能模块(providers, models, keys, dashboard)
├── components/          # 共享组件
├── lib/                 # 工具函数、hooks
└── services/            # API 客户端
```

### 后端架构 (Bulletproof 风格)
```
apps/backend/src/
├── features/            # 功能模块
│   ├── proxy/          # LLM 请求代理
│   ├── providers/      # 供应商管理
│   ├── models/         # 模型管理
│   ├── virtual-keys/   # 虚拟密钥管理
│   └── health/         # 健康检查
├── lib/                # 核心库
│   ├── availability/   # 可用性管理 + 断路器
│   ├── routing/        # 路由策略
│   ├── logger.ts       # 日志系统
│   └── metrics.ts      # 内存指标收集
├── middleware/         # 中间件
└── config/             # 配置加载
```

---

## 💾 数据库设计

### providers (供应商表)
```typescript
{
  id: string (uuid, PK)
  type: enum ('external' | 'system')  // external: 真实供应商, system: 虚拟供应商
  name: string                        // openai, anthropic, google, 或 'virtual'
  base_url: string | null             // API endpoint, system 类型为 null
  api_key: string | null              // 加密存储, system 类型为 null
  enabled: boolean
  priority: number                    // 负载均衡优先级
  weight: number                      // 负载均衡权重
  max_requests_per_min: number | null
  timeout_ms: number | null
  created_at: timestamp
  updated_at: timestamp
}
```

### models (统一模型表)
```typescript
{
  id: string (uuid, PK)
  provider_id: string (FK -> providers)
  name: string (unique)               // 模型标识名
  display_name: string
  actual_model_name: string           // 供应商的原始模型名

  // 虚拟模型路由配置
  routing_config: jsonb | null        // { strategy, fallback_enabled, params }

  capabilities: jsonb | null          // { max_tokens, supports_vision, etc }
  enabled: boolean
  created_at: timestamp
  updated_at: timestamp
}
```

**routing_config 结构**:
```typescript
{
  strategy: 'round_robin' | 'weighted' | 'least_latency' | 'priority' | 'smart',
  fallback_enabled: boolean,
  params?: Record<string, any>  // 策略特定参数
}
```

### model_routes (路由映射表)
```typescript
{
  id: string (uuid, PK)
  virtual_model_id: string (FK -> models where provider.type='system')
  physical_model_id: string (FK -> models where provider.type='external')
  weight: number                      // 用于 weighted 策略
  priority: number                    // 用于 priority 策略
  enabled: boolean
  created_at: timestamp
}
```

### virtual_keys (虚拟密钥表)
```typescript
{
  id: string (uuid, PK)
  key: string (unique, indexed)       // sk-xxx
  name: string
  allowed_models: string[]            // 可访问的模型 name 列表
  rate_limit: number                  // 每分钟请求数
  enabled: boolean
  expires_at: timestamp | null
  created_at: timestamp
  updated_at: timestamp
}
```

### request_logs (请求日志表)
```typescript
{
  id: string (uuid, PK)
  virtual_key_id: string (FK)
  model_name: string
  provider_id: string (FK)
  status: enum ('success' | 'failure')
  latency_ms: number
  input_tokens: number
  output_tokens: number
  error_message: string | null
  created_at: timestamp
}
```

---

## 🔄 可用性管理层 + 断路器

### 核心设计理念
- **不仅仅是缓存**: 这是一个智能的可用性管理层，负责维护模型和供应商的实时可用性状态
- **断路器集成**: 每个 provider 都有独立的断路器，防止持续向失败的供应商发送请求
- **实时过滤**: 请求处理时只从"可用"的模型和供应商中选择
- **自动恢复**: 断路器支持半开状态，自动尝试恢复失败的供应商

### AvailabilityManager 实现
```typescript
// apps/backend/src/lib/availability/availability-manager.ts
class AvailabilityManager {
  private models: Map<string, Model> = new Map();
  private providers: Map<string, Provider> = new Map();
  private routes: Map<string, ModelRoute[]> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  async initialize() {
    // 启动时加载所有配置
    await this.loadFromDatabase();

    // 为每个 provider 初始化断路器
    for (const provider of this.providers.values()) {
      this.circuitBreakers.set(
        provider.id,
        new CircuitBreaker({
          failureThreshold: 3,      // 连续失败 3 次打开断路器
          timeout: 60000,           // 60 秒后尝试半开状态
          resetTimeout: 30000       // 成功后 30 秒重置计数
        })
      );
    }
  }

  // 获取可用的模型(只返回有可用 provider 的模型)
  getAvailableModel(name: string): Model | null {
    const model = this.models.get(name);
    if (!model || !model.enabled) return null;

    // 物理模型：检查 provider 和断路器状态
    if (model.provider.type === 'external') {
      const breaker = this.circuitBreakers.get(model.provider_id);
      return breaker?.isAvailable() ? model : null;
    }

    // 虚拟模型：至少有一个可用路由
    const availableRoutes = this.getAvailableRoutes(model.id);
    return availableRoutes.length > 0 ? model : null;
  }

  // 获取可用的路由(只返回断路器未打开的)
  getAvailableRoutes(virtualModelId: string): ModelRoute[] {
    const routes = this.routes.get(virtualModelId) || [];

    return routes.filter(route => {
      if (!route.enabled) return false;

      const physicalModel = this.models.get(route.physical_model_id);
      if (!physicalModel?.enabled) return false;

      const provider = this.providers.get(physicalModel.provider_id);
      if (!provider?.enabled) return false;

      const breaker = this.circuitBreakers.get(provider.id);
      return breaker?.isAvailable() ?? false;
    });
  }

  // 记录请求结果,更新断路器状态
  recordResult(providerId: string, success: boolean, latency: number) {
    const breaker = this.circuitBreakers.get(providerId);
    if (!breaker) return;

    if (success) {
      breaker.recordSuccess(latency);
    } else {
      breaker.recordFailure();
    }
  }

  // CRUD 操作同步更新内存
  async updateModel(id: string, updates: Partial<Model>) {
    const model = await db.models.update(id, updates);
    this.models.set(model.name, model);
  }

  async updateProvider(id: string, updates: Partial<Provider>) {
    const provider = await db.providers.update(id, updates);
    this.providers.set(provider.id, provider);
  }
}

export const availabilityManager = new AvailabilityManager();
```

### CircuitBreaker 实现
```typescript
// apps/backend/src/lib/availability/circuit-breaker.ts
enum CircuitState {
  CLOSED = 'closed',      // 正常状态
  OPEN = 'open',          // 断路器打开,拒绝请求
  HALF_OPEN = 'half_open' // 半开状态,尝试恢复
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private successCount: number = 0;
  private recentLatencies: number[] = [];

  constructor(private config: {
    failureThreshold: number;
    timeout: number;
    resetTimeout: number;
  }) {}

  isAvailable(): boolean {
    this.updateState();
    return this.state !== CircuitState.OPEN;
  }

  recordSuccess(latency: number) {
    this.recentLatencies.push(latency);
    if (this.recentLatencies.length > 100) {
      this.recentLatencies.shift();
    }

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= 3) {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else if (this.state === CircuitState.CLOSED) {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
    }
  }

  private updateState() {
    if (this.state === CircuitState.OPEN) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.timeout) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      }
    }
  }

  getAverageLatency(): number {
    if (this.recentLatencies.length === 0) return 0;
    return this.recentLatencies.reduce((a, b) => a + b, 0) / this.recentLatencies.length;
  }

  getState(): CircuitState {
    return this.state;
  }
}
```

---

## 🎯 路由策略系统

### 策略接口
```typescript
// apps/backend/src/lib/routing/base.ts
interface RoutingStrategy {
  select(routes: ModelRoute[]): ModelRoute | null;
}
```

### 内置策略

**1. Round Robin (轮询)**
```typescript
class RoundRobinStrategy implements RoutingStrategy {
  private counters: Map<string, number> = new Map();

  select(routes: ModelRoute[]): ModelRoute | null {
    if (routes.length === 0) return null;

    const key = routes.map(r => r.id).join(',');
    const counter = this.counters.get(key) || 0;
    const selected = routes[counter % routes.length];

    this.counters.set(key, counter + 1);
    return selected;
  }
}
```

**2. Weighted (权重)**
```typescript
class WeightedStrategy implements RoutingStrategy {
  select(routes: ModelRoute[]): ModelRoute | null {
    if (routes.length === 0) return null;

    const totalWeight = routes.reduce((sum, r) => sum + r.weight, 0);
    let random = Math.random() * totalWeight;

    for (const route of routes) {
      random -= route.weight;
      if (random <= 0) return route;
    }

    return routes[0];
  }
}
```

**3. Least Latency (最低延迟)**
```typescript
class LeastLatencyStrategy implements RoutingStrategy {
  select(routes: ModelRoute[]): ModelRoute | null {
    if (routes.length === 0) return null;

    return routes.reduce((best, current) => {
      const bestLatency = availabilityManager.getProviderLatency(best.provider_id);
      const currentLatency = availabilityManager.getProviderLatency(current.provider_id);
      return currentLatency < bestLatency ? current : best;
    });
  }
}
```

**4. Priority (优先级)**
```typescript
class PriorityStrategy implements RoutingStrategy {
  select(routes: ModelRoute[]): ModelRoute | null {
    if (routes.length === 0) return null;

    // 按 priority 排序,选择第一个可用的
    const sorted = [...routes].sort((a, b) => a.priority - b.priority);
    return sorted[0];
  }
}
```

**5. Smart (智能路由 - 扩展点)**
```typescript
class SmartStrategy implements RoutingStrategy {
  select(routes: ModelRoute[]): ModelRoute | null {
    // 未来可以接入 ML 模型或更复杂的决策逻辑
    // 例如：基于历史成功率、成本、延迟等多维度决策
    return new LeastLatencyStrategy().select(routes);
  }
}
```

---

## 🔌 代理请求流程

### 完整流程图
```
客户端请求
  ↓
虚拟密钥验证 (middleware/auth.ts)
  ↓
速率限制检查 (middleware/rate-limit.ts)
  ↓
解析目标模型
  ↓
从 AvailabilityManager 获取可用模型
  ↓ (模型不可用)
返回 503 Service Unavailable
  ↓ (模型可用)
获取可用路由列表
  ↓
根据路由策略选择目标
  ↓
转发请求到上游 API
  ↓ (失败)
记录失败 → 更新断路器 → 故障转移
  ↓ (成功)
记录成功 → 更新断路器 → 记录指标
  ↓
返回响应给客户端
```

### 核心代理处理器
```typescript
// apps/backend/src/features/proxy/handlers.ts
async function handleProxyRequest(c: Context) {
  // 1. 虚拟密钥验证
  const virtualKey = await validateVirtualKey(c.req.header('Authorization'));

  // 2. 解析请求模型
  const requestBody = await c.req.json();
  const requestedModel = requestBody.model;

  // 3. 从可用性管理器获取可用模型
  const model = availabilityManager.getAvailableModel(requestedModel);
  if (!model) {
    return c.json({
      error: 'Model not available',
      message: 'All providers are currently unavailable'
    }, 503);
  }

  // 4. 获取可用路由
  const routes = availabilityManager.getAvailableRoutes(model.id);
  if (routes.length === 0) {
    return c.json({
      error: 'No available routes',
      message: 'All providers for this model are unavailable'
    }, 503);
  }

  // 5. 根据路由策略选择目标
  const strategy = getRoutingStrategy(model.routing_config.strategy);
  const selectedRoute = strategy.select(routes);

  if (!selectedRoute) {
    return c.json({ error: 'Route selection failed' }, 500);
  }

  // 6. 转发请求
  const startTime = Date.now();
  try {
    const response = await forwardRequest(selectedRoute, requestBody);
    const latency = Date.now() - startTime;

    // 记录成功
    availabilityManager.recordResult(selectedRoute.provider_id, true, latency);
    metrics.record({
      virtualKeyId: virtualKey.id,
      modelName: requestedModel,
      providerId: selectedRoute.provider_id,
      status: 'success',
      latency,
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0
    });

    return c.json(response);
  } catch (error) {
    const latency = Date.now() - startTime;

    // 记录失败
    availabilityManager.recordResult(selectedRoute.provider_id, false, latency);

    // 7. 故障转移
    if (model.routing_config.fallback_enabled && routes.length > 1) {
      const remainingRoutes = routes.filter(r => r.id !== selectedRoute.id);
      return await failover(remainingRoutes, requestBody, virtualKey, model);
    }

    throw error;
  }
}
```

---

## ⚙️ 配置系统

### 配置文件结构
```typescript
// config/gateway.config.ts
export default {
  server: {
    port: 3000,
    host: '0.0.0.0',
    cors: {
      enabled: true,
      origins: ['*']
    }
  },

  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'llm_gateway',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true'
  },

  admin: {
    password: process.env.ADMIN_PASSWORD
  },

  metrics: {
    memoryBufferSize: 10000,           // 内存保留最近 N 条请求
    flushIntervalMs: 5 * 60 * 1000,    // 5 分钟持久化一次
    retentionDays: 30                   // 数据库保留 30 天
  },

  health: {
    checkIntervalMs: 30 * 1000,        // 30 秒检查一次
    timeoutMs: 5000,                    // 健康检查超时
    failureThreshold: 3                 // 连续失败 3 次标记为 unhealthy
  },

  circuitBreaker: {
    failureThreshold: 3,                // 连续失败 3 次打开断路器
    timeout: 60000,                     // 60 秒后尝试半开状态
    resetTimeout: 30000                 // 成功后 30 秒重置计数
  }
}
```

### 环境变量
```bash
# .env.example
DB_HOST=localhost
DB_PORT=5432
DB_NAME=llm_gateway
DB_USER=postgres
DB_PASSWORD=your_password
DB_SSL=false

ADMIN_PASSWORD=your_admin_password

NODE_ENV=development
```

---

## 📊 监控与指标

### 内存指标系统
```typescript
// apps/backend/src/lib/metrics.ts
interface RequestMetric {
  id: string;
  virtualKeyId: string;
  modelName: string;
  providerId: string;
  status: 'success' | 'failure';
  latency: number;
  inputTokens: number;
  outputTokens: number;
  timestamp: number;
}

class MetricsCollector {
  private buffer: RequestMetric[] = [];
  private maxSize: number = 10000;
  private flushInterval: number = 5 * 60 * 1000;

  constructor() {
    // 定期持久化
    setInterval(() => this.flush(), this.flushInterval);
  }

  record(metric: Omit<RequestMetric, 'id' | 'timestamp'>) {
    this.buffer.push({
      ...metric,
      id: crypto.randomUUID(),
      timestamp: Date.now()
    });

    // 超过缓冲区大小时移除最旧的
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  async flush() {
    if (this.buffer.length === 0) return;

    const toFlush = [...this.buffer];
    this.buffer = [];

    try {
      await db.requestLogs.batchInsert(toFlush);
    } catch (error) {
      logger.error('Failed to flush metrics', { error });
      // 失败时放回缓冲区
      this.buffer.unshift(...toFlush);
    }
  }

  // 实时统计
  getRecentStats(minutes: number = 5) {
    const cutoff = Date.now() - minutes * 60 * 1000;
    const recent = this.buffer.filter(m => m.timestamp >= cutoff);

    return {
      total: recent.length,
      success: recent.filter(m => m.status === 'success').length,
      failure: recent.filter(m => m.status === 'failure').length,
      avgLatency: recent.reduce((sum, m) => sum + m.latency, 0) / recent.length || 0,
      totalTokens: recent.reduce((sum, m) => sum + m.inputTokens + m.outputTokens, 0)
    };
  }
}

export const metrics = new MetricsCollector();
```

---

## 🚀 部署方案

### Docker 部署
```dockerfile
# Dockerfile
FROM oven/bun:1 as base
WORKDIR /app

# 安装依赖
COPY package.json bun.lockb ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/web/package.json ./apps/web/
COPY packages/*/package.json ./packages/
RUN bun install --frozen-lockfile

# 构建
COPY . .
RUN bun run build

# 生产环境
FROM oven/bun:1-slim
WORKDIR /app
COPY --from=base /app/dist ./dist
COPY --from=base /app/node_modules ./node_modules

EXPOSE 3000
CMD ["bun", "run", "start"]
```

### Docker Compose
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: llm_gateway
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  gateway:
    build: .
    ports:
      - "3000:3000"
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: llm_gateway
      DB_USER: postgres
      DB_PASSWORD: ${DB_PASSWORD}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
    depends_on:
      - postgres

volumes:
  postgres_data:
```

---

## 📅 开发路线图

### Phase 1: 基础设施 (Week 1-2)
- [ ] Monorepo 项目结构搭建
- [ ] PostgreSQL + Drizzle ORM 配置
- [ ] 配置系统实现
- [ ] 基础中间件(日志、错误处理)

### Phase 2: 核心功能 (Week 3-4)
- [ ] 供应商管理 CRUD
- [ ] 物理模型管理
- [ ] 虚拟密钥系统
- [ ] 基础代理功能(单供应商透传)

### Phase 3: 高可用特性 (Week 5-6)
- [ ] 可用性管理层 + 断路器
- [ ] 虚拟模型 + 路由策略
- [ ] 负载均衡实现
- [ ] 故障转移机制
- [ ] 健康检查系统

### Phase 4: 监控与管理 (Week 7-8)
- [ ] 内存指标系统
- [ ] Dashboard 实时监控
- [ ] 管理界面完善
- [ ] 速率限制
- [ ] 请求日志查询

### Phase 5: 增强功能 (Future)
- [ ] 协议转换(OpenAI ↔ Anthropic)
- [ ] 智能路由策略
- [ ] 成本追踪
- [ ] 更多供应商支持

---

## 📚 参考资料

- [Bulletproof React](https://github.com/alan2207/bulletproof-react)
- [Hono Documentation](https://hono.dev/)
- [TanStack Start](https://tanstack.com/start)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)

---

**文档状态**: ✅ 已完成
**下一步**: 准备实施 Phase 1
