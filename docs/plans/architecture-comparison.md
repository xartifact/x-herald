# x-llm-gateway 架构设计对比分析

**日期**: 2026-01-25
**作者**: Claude & Team

---

## 📊 总览

本文档对比了两个版本的 x-llm-gateway 架构设计，并基于现有 llm-gateway 项目的优秀实践进行了优化。

---

## 🔄 版本对比

### v1.0 - 初始设计

**定位**: 从零开始设计一个 LLM Gateway

**核心特性**:
- 多供应商管理
- 虚拟模型映射
- 断路器机制
- 可用性管理层
- 5 种路由策略

**技术栈**:
- Bun + Hono + React 19 + PostgreSQL + Drizzle ORM

**优势**:
- ✅ 虚拟模型映射（创新点）
- ✅ 实时可用性管理
- ✅ 完整的断路器状态机
- ✅ 现代化技术栈

**不足**:
- ❌ 缺少协议转换（核心竞争力）
- ❌ 缺少 Expert Router（杀手级功能）
- ❌ 缺少 LiteLLM 预设集成
- ❌ 缺少 Prompt 管理

---

### v2.0 - 融合设计（推荐）

**定位**: llm-gateway 的现代化重构版本

**核心特性**:
- ✅ 协议转换（继承）
- ✅ Expert Router（继承）
- ✅ LiteLLM 预设（继承）
- ✅ 虚拟模型映射（新增）
- ✅ 实时可用性管理（新增）
- ✅ 断路器机制（增强）

**技术栈**:
- Bun + Hono + React 19 + PostgreSQL + Drizzle ORM

**优势**:
- ✅ 保留 llm-gateway 的所有核心功能
- ✅ 引入虚拟模型映射（更灵活）
- ✅ 引入实时可用性管理（更高效）
- ✅ 更现代的技术栈（更好的开发体验）
- ✅ 更好的类型安全（Drizzle ORM）
- ✅ 更简洁的架构（Bulletproof 风格）

**改进点**:
- 🔧 MySQL → PostgreSQL（更好的 JSON 支持）
- 🔧 Fastify → Hono（更轻量）
- 🔧 Vue 3 → React 19（生态更丰富）
- 🔧 原生 SQL → Drizzle ORM（类型安全）

---

## 🎯 核心功能对比

| 功能 | llm-gateway | v1.0 | v2.0 | 说明 |
|------|-------------|------|------|------|
| **协议转换** | ✅ | ❌ | ✅ | OpenAI ↔ Anthropic ↔ Gemini |
| **Expert Router** | ✅ | ❌ | ✅ | 三层决策架构 |
| **虚拟模型映射** | ❌ | ✅ | ✅ | 一对多模型映射 |
| **断路器机制** | 部分 | ✅ | ✅ | 完整状态机 |
| **可用性管理** | 定期检查 | 实时 | 实时 | 内存状态管理 |
| **LiteLLM 预设** | ✅ | ❌ | ✅ | 20+ 提供商 |
| **Prompt 管理** | ✅ | ❌ | 可选 | 动态修改 |
| **健康监控** | ✅ | ✅ | ✅ | 公开 API |
| **虚拟密钥** | ✅ | ✅ | ✅ | JWT 认证 |

---

## 🏗️ 架构对比

### 数据库设计

#### llm-gateway (MySQL)
```sql
providers (id, name, api_key, base_url)
models (id, provider_id, name, protocol_conversion)
virtual_keys (id, key_value, rate_limit_rpm)
api_requests (id, virtual_key_id, model_id, ...)
health_targets (id, type, target_id, ...)
health_runs (id, target_id, status, latency_ms, ...)
expert_routing_config (id, enabled, routing_mode, config)
```

#### v1.0 (PostgreSQL)
```sql
providers (id, type, name, api_key, priority, weight)
models (id, provider_id, name, routing_config)
model_routes (id, virtual_model_id, physical_model_id, weight)
virtual_keys (id, key, allowed_models, rate_limit)
request_logs (id, virtual_key_id, model_name, status)
```

#### v2.0 (PostgreSQL) - 推荐
```sql
-- 继承 llm-gateway 的所有表
providers (id, type, name, api_key, priority, weight)
models (id, provider_id, name, routing_config, protocol_conversion)
virtual_keys (id, key, allowed_models, rate_limit)
request_logs (id, virtual_key_id, model_name, status)
health_targets (id, type, target_id, ...)
health_runs (id, target_id, status, latency_ms, ...)
expert_routing_config (id, enabled, routing_mode, config)

-- 新增虚拟模型支持
model_routes (id, virtual_model_id, physical_model_id, weight, priority)
```

**关键差异**:
1. v2.0 保留了 llm-gateway 的所有表结构
2. v2.0 新增了 `model_routes` 表支持虚拟模型映射
3. v2.0 在 `providers` 表中增加了 `type` 字段区分物理/虚拟供应商
4. v2.0 在 `models` 表中同时支持 `routing_config` 和 `protocol_conversion`

---

## 📦 技术栈对比

| 维度 | llm-gateway | v1.0 | v2.0 | 说明 |
|------|-------------|------|------|------|
| **Runtime** | Bun/Node.js | Bun | Bun | 更快的性能 |
| **后端框架** | Fastify | Hono | Hono | 更轻量，边缘友好 |
| **前端框架** | Vue 3 | React 19 | React 19 | 生态更丰富 |
| **UI 库** | Naive UI | shadcn/ui | shadcn/ui | 更现代化 |
| **数据库** | MySQL 8 | PostgreSQL 16 | PostgreSQL 16 | 更好的 JSON 支持 |
| **ORM** | 原生 SQL | Drizzle | Drizzle | 类型安全 |
| **认证** | JWT | JWT | JWT | 一致 |
| **日志** | Pino | Pino | Pino | 一致 |

---

## 🎨 代码组织对比

### llm-gateway (分层架构)
```
packages/backend/src/
├── routes/           # 路由定义
│   ├── proxy/
│   ├── openai/
│   ├── anthropic/
│   └── gemini/
├── services/         # 业务服务
│   ├── expert-router/
│   ├── protocol-converter.ts
│   ├── provider-adapter.ts
│   └── health-checker.ts
├── db/               # 数据库层
│   ├── repositories/
│   └── migrations/
└── config/           # 配置
```

### v2.0 (Bulletproof 风格) - 推荐
```
apps/backend/src/
├── features/         # 功能模块（功能切片）
│   ├── proxy/
│   ├── providers/
│   ├── models/
│   ├── virtual-keys/
│   ├── health/
│   └── expert-router/
├── lib/              # 核心库（跨功能）
│   ├── availability/
│   ├── routing/
│   ├── protocol-converter/
│   ├── provider-adapter/
│   ├── logger.ts
│   └── metrics.ts
├── middleware/       # 中间件
└── config/           # 配置
```

**优势**:
- ✅ 功能切片更清晰（每个 feature 包含路由、服务、类型）
- ✅ 共享逻辑集中在 `lib/`
- ✅ 更容易测试和维护
- ✅ 更好的代码隔离

---

## 🚀 请求流程对比

### llm-gateway 流程
```
请求 → JWT 认证 → 虚拟密钥验证 → 速率限制
  ↓
Expert Router? (可选)
  ↓
Protocol Converter? (可选)
  ↓
Provider Adapter → 转发请求
  ↓
Protocol Converter 响应? (可选)
  ↓
日志记录 → 返回响应
```

### v2.0 流程（增强）
```
请求 → JWT 认证 → 虚拟密钥验证 → 速率限制
  ↓
Expert Router? (可选)
  ↓
AvailabilityManager 检查可用性 ← 断路器状态
  ↓ (不可用)
  返回 503
  ↓ (可用)
虚拟模型? → 路由策略选择
  ↓
Protocol Converter? (可选)
  ↓
Provider Adapter → 转发请求
  ↓ (失败)
  更新断路器 → 故障转移?
  ↓ (成功)
  更新断路器 → Protocol Converter 响应?
  ↓
日志记录 → 返回响应
```

**v2.0 新增环节**:
1. ✅ 实时可用性检查（通过 AvailabilityManager）
2. ✅ 断路器状态维护
3. ✅ 虚拟模型路由选择
4. ✅ 自动故障转移

---

## 💡 设计决策说明

### 为什么选择 v2.0？

#### 1. 保留成熟功能
llm-gateway 已经在生产环境验证过的功能：
- ✅ 协议转换：OpenAI ↔ Anthropic ↔ Gemini
- ✅ Expert Router：三层决策架构
- ✅ LiteLLM 预设：20+ 提供商支持
- ✅ 健康监控：公开 API + 统计指标

这些都是经过实践检验的核心竞争力，不应该舍弃。

#### 2. 引入创新特性
v1.0 的创新点：
- ✅ 虚拟模型映射：更灵活的路由配置
- ✅ 实时可用性管理：比定期检查更高效
- ✅ 完整的断路器：状态机 + 自动恢复

这些特性可以显著提升系统的高可用性。

#### 3. 现代化技术栈
- ✅ PostgreSQL：更好的 JSON 支持，更强的扩展性
- ✅ Drizzle ORM：类型安全，零运行时开销
- ✅ Hono：更轻量，边缘友好
- ✅ React 19：最新特性，生态丰富
- ✅ shadcn/ui：现代化组件库

#### 4. 更好的代码组织
- ✅ Bulletproof 风格：功能切片更清晰
- ✅ Monorepo：共享代码更方便
- ✅ 类型安全：减少运行时错误

---

## 📈 实施建议

### 推荐路线：v2.0 架构

**理由**:
1. 保留了 llm-gateway 的所有核心功能（协议转换、Expert Router 等）
2. 引入了 v1.0 的创新特性（虚拟模型、实时可用性）
3. 使用更现代的技术栈
4. 更好的代码组织和可维护性

**实施步骤**:
1. 从 llm-gateway 移植核心功能
   - Protocol Converter
   - Expert Router
   - Provider Adapter
   - Health Checker
2. 实现 v1.0 的新特性
   - Virtual Model Mapping
   - Availability Manager
   - Circuit Breaker
3. 适配新技术栈
   - Hono 路由
   - Drizzle ORM
   - React 19 前端

---

## 🎯 下一步行动

### 立即开始

1. **创建项目骨架**
   ```bash
   cd .worktrees/feature/initial-setup
   bun init
   # 配置 Monorepo
   ```

2. **设置数据库**
   ```bash
   # 启动 PostgreSQL
   docker-compose up -d postgres
   # 创建 schema
   ```

3. **实现 Phase 1**
   - Monorepo 结构
   - PostgreSQL + Drizzle
   - 配置系统
   - 基础中间件

### 长期规划

按照 v2.0 的开发路线图，分 7 个 Phase 逐步实现：
1. Phase 1: 基础设施 (Week 1-2)
2. Phase 2: 核心实体 (Week 3-4)
3. Phase 3: 可用性管理 (Week 5-6)
4. Phase 4: 协议转换 (Week 7-8)
5. Phase 5: Expert Router (Week 9-10)
6. Phase 6: 前端界面 (Week 11-12)
7. Phase 7: 监控优化 (Week 13-14)

---

## 📝 总结

### 核心观点

1. **v1.0 的价值**
   - ✅ 虚拟模型映射是一个很好的创新
   - ✅ 实时可用性管理优于定期检查
   - ✅ 完整的断路器机制很有必要

2. **llm-gateway 的价值**
   - ✅ 协议转换是核心竞争力
   - ✅ Expert Router 是杀手级功能
   - ✅ LiteLLM 预设减少配置工作
   - ✅ 健康监控系统很完善

3. **v2.0 的价值**
   - ✅ 融合了两者的优点
   - ✅ 保留成熟功能 + 引入创新
   - ✅ 现代化技术栈
   - ✅ 更好的架构设计

### 最终建议

**采用 v2.0 架构设计**，因为它：
- 不会丢失 llm-gateway 的任何核心功能
- 引入了虚拟模型映射等创新特性
- 使用更现代、更好维护的技术栈
- 具有更清晰的代码组织

---

**文档状态**: ✅ 已完成
**推荐方案**: v2.0 架构
**下一步**: 开始 Phase 1 实施
