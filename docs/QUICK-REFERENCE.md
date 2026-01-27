# 快速参考

> 快速了解 x-llm-gateway 项目的核心内容

---

## 📖 文档导航

| 文档 | 用途 | 推荐阅读顺序 |
|------|------|-------------|
| [README.md](../README.md) | 项目简介、快速开始 | ⭐ 1 |
| [v2.0 架构设计](plans/2026-01-25-x-llm-gateway-v2-architecture.md) | **推荐方案**的完整设计 | ⭐⭐⭐ 2 |
| [架构对比分析](plans/architecture-comparison.md) | 三种方案的对比 | ⭐⭐ 3 |
| [工作总结](SUMMARY.md) | 设计过程和决策记录 | ⭐ 4 |
| [v1.0 初始设计](plans/2026-01-25-llm-gateway-architecture-design.md) | 早期设计，仅供参考 | 5 |

---

## 🎯 5 分钟了解项目

### 项目定位
x-llm-gateway 是 [llm-gateway](https://github.com/xxx/llm-gateway) 的现代化重构版本：
- **继承**: 协议转换、Expert Router、健康监控等核心功能
- **创新**: 虚拟模型映射、实时可用性管理、断路器机制
- **优化**: 现代技术栈（Hono + React 19 + PostgreSQL + Drizzle）

### 核心特性

**从 llm-gateway 继承 ✅**
1. 协议转换 - OpenAI ↔ Anthropic ↔ Gemini
2. Expert Router - 三层决策架构
3. LiteLLM 预设 - 20+ 提供商
4. 健康监控 - 可用率统计 + P50/P95
5. Provider Adapter - 统一 API 接口

**新增创新特性 🆕**
1. 虚拟模型映射 - 一对多模型映射
2. 实时可用性管理 - 内存状态管理
3. 完整断路器 - 状态机 + 自动恢复
4. 现代技术栈 - 更好的开发体验

### 技术栈

```
后端: Bun + Hono + TypeScript + PostgreSQL + Drizzle ORM
前端: React 19 + TanStack Start + shadcn/ui + TailwindCSS
架构: Monorepo (Bun workspaces) + Bulletproof 风格
```

---

## 🗂️ 项目结构

```
x-llm-gateway/
├── apps/
│   ├── backend/          # Hono API (功能切片风格)
│   │   ├── features/     # 业务功能
│   │   └── lib/          # 核心库
│   └── web/              # TanStack Start + React
│       └── features/     # 功能模块
├── packages/
│   ├── shared/           # 共享代码
│   ├── database/         # Drizzle schema
│   └── config/           # 配置管理
└── docs/                 # 文档
```

---

## 💾 核心数据结构

### 虚拟模型映射

```typescript
// 1. 创建虚拟供应商
{
  id: "virtual-provider",
  type: "system",  // 区分虚拟/物理
  name: "virtual"
}

// 2. 创建虚拟模型
{
  id: "vm-smart-chat",
  provider_id: "virtual-provider",
  name: "smart-chat",
  routing_config: {
    strategy: "weighted",     // 路由策略
    fallback_enabled: true    // 故障转移
  }
}

// 3. 配置路由映射
[
  { virtual_model_id: "vm-smart-chat", physical_model_id: "gpt-4", weight: 70 },
  { virtual_model_id: "vm-smart-chat", physical_model_id: "claude-3-opus", weight: 30 }
]
```

### 可用性管理

```typescript
class AvailabilityManager {
  // 检查模型是否可用（考虑断路器状态）
  getAvailableModel(name: string): Model | null

  // 获取虚拟模型的可用路由
  getAvailableRoutes(virtualModelId: string): ModelRoute[]

  // 记录请求结果，更新断路器
  recordResult(providerId: string, success: boolean, latency: number)
}
```

### 断路器状态机

```
CLOSED (正常)
  ↓ 连续失败 3 次
OPEN (拒绝请求)
  ↓ 60 秒后
HALF_OPEN (尝试恢复)
  ↓ 成功 3 次
CLOSED
```

---

## 🔄 请求处理流程

```
1. 客户端请求
   ↓
2. JWT 认证 → 虚拟密钥验证 → 速率限制
   ↓
3. Expert Router? (可选)
   ├─ L2: Heuristics (Slash 命令、工具调用)
   ├─ L1: Semantic Router (embedding 相似度)
   └─ L3: LLM Judge (分类模型)
   ↓
4. AvailabilityManager 检查可用性
   ├─ 查询断路器状态
   ├─ 过滤不可用的 provider
   └─ 返回可用模型
   ↓
5. 虚拟模型? → 路由策略选择
   ├─ Round Robin (轮询)
   ├─ Weighted (权重)
   ├─ Least Latency (最低延迟)
   ├─ Priority (优先级)
   └─ Smart (智能)
   ↓
6. Protocol Converter? (可选)
   ├─ OpenAI → Anthropic
   ├─ Anthropic → OpenAI
   └─ 工具调用格式转换
   ↓
7. Provider Adapter 转发请求
   ├─ OpenAICompatibleAdapter
   ├─ AnthropicAdapter
   └─ GoogleGeminiAdapter
   ↓
8. 成功? → 更新断路器 → 返回
   失败? → 更新断路器 → 故障转移?
```

---

## 📅 开发计划（7 个阶段）

| Phase | 时间 | 目标 | 关键交付 |
|-------|------|------|---------|
| 1 | Week 1-2 | 基础设施 | Monorepo + DB + 配置 |
| 2 | Week 3-4 | 核心实体 | 供应商/模型/密钥 CRUD |
| 3 | Week 5-6 | 可用性管理 | 断路器 + 虚拟模型 |
| 4 | Week 7-8 | 协议转换 | Protocol Converter |
| 5 | Week 9-10 | Expert Router | 三层决策 + embedding |
| 6 | Week 11-12 | 前端界面 | 管理后台 + 监控 |
| 7 | Week 13-14 | 监控优化 | 指标 + 成本追踪 |

---

## 🔑 关键设计决策

### 1. 为什么选择 v2.0？

- ✅ 保留 llm-gateway 的所有核心功能
- ✅ 引入虚拟模型映射等创新
- ✅ 更现代的技术栈
- ✅ 更好的代码组织

### 2. 为什么选择 PostgreSQL？

- ✅ 更好的 JSON/JSONB 支持
- ✅ 更强的扩展性
- ✅ 更适合复杂查询

### 3. 为什么选择 Drizzle ORM？

- ✅ 类型安全（减少运行时错误）
- ✅ 零运行时开销
- ✅ 更好的开发体验

### 4. 为什么选择 Hono？

- ✅ 更轻量（更小的包体积）
- ✅ 边缘友好（可部署到 Cloudflare Workers）
- ✅ 更简洁的 API

### 5. 为什么选择 React 19？

- ✅ 生态更丰富
- ✅ 最新特性（Server Components）
- ✅ 更好的 TypeScript 支持

---

## 🚀 快速开始

### 前置要求

```bash
bun >= 1.0.0
postgresql >= 16
docker (可选)
```

### 本地开发

```bash
# 1. 安装依赖
bun install

# 2. 配置环境
cp .env.example .env

# 3. 启动数据库
docker-compose up -d postgres

# 4. 运行迁移
bun run db:migrate

# 5. 启动服务
bun run dev:all
```

---

## 📚 扩展阅读

### 官方文档
- [Hono](https://hono.dev/)
- [TanStack Start](https://tanstack.com/start)
- [Drizzle ORM](https://orm.drizzle.team/)
- [shadcn/ui](https://ui.shadcn.com/)

### 参考项目
- [llm-gateway](https://github.com/xxx/llm-gateway)
- [LiteLLM](https://github.com/BerriAI/litellm)
- [Bulletproof React](https://github.com/alan2207/bulletproof-react)

### 架构模式
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Adapter Pattern](https://refactoring.guru/design-patterns/adapter)
- [Strategy Pattern](https://refactoring.guru/design-patterns/strategy)

---

## ❓ 常见问题

### Q: 与 llm-gateway 的关系？
A: 现代化重构版本，保留所有核心功能，引入新特性，使用新技术栈。

### Q: 为什么不直接用 llm-gateway？
A: llm-gateway 是成熟项目，但技术栈较旧。x-llm-gateway 在保留其优势的同时，引入了虚拟模型映射、实时可用性管理等创新特性。

### Q: 虚拟模型映射有什么用？
A: 更灵活的负载均衡和故障转移。例如，可以配置 70% 流量到 GPT-4，30% 到 Claude，某个模型宕机时自动切换。

### Q: 断路器是什么？
A: 自动故障保护机制。当某个提供商连续失败 3 次，自动打开断路器拒绝请求，60 秒后尝试恢复。

### Q: 如何从 Phase 1 开始实施？
A: 参考 [v2.0 架构设计文档](plans/2026-01-25-x-llm-gateway-v2-architecture.md) 的开发路线图部分。

---

**文档版本**: 1.0
**最后更新**: 2026-01-25
**推荐阅读**: [v2.0 架构设计文档](plans/2026-01-25-x-llm-gateway-v2-architecture.md)
