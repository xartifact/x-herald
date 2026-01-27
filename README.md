# x-llm-gateway

> 现代化的 LLM Gateway 项目 - 融合创新与成熟实践

[![Status](https://img.shields.io/badge/status-design-blue)]()
[![Version](https://img.shields.io/badge/version-2.0.0-green)]()

---

## 📖 项目简介

x-llm-gateway 是基于 [llm-gateway](https://github.com/sxueck/llm-gateway) 的现代化重构版本，保留了所有核心功能的同时引入了创新特性，采用更现代的技术栈。

### 🎯 核心价值

- **统一接口 + 协议转换** - OpenAI ↔ Anthropic ↔ Gemini 互转
- **智能路由系统** - Expert Router + 虚拟模型映射
- **高可用性保障** - 实时可用性管理 + 断路器 + 自动故障转移
- **灵活的访问控制** - 虚拟密钥 + 速率限制 + Token 额度
- **完整的可观测性** - 请求日志 + 性能指标 + 实时监控

---

## ✨ 核心特性

### 从 llm-gateway 继承 ✅

| 特性 | 说明 |
|------|------|
| **协议转换** | OpenAI ↔ Anthropic ↔ Gemini 双向转换 |
| **Expert Router** | 三层决策架构（Heuristics + Semantic + LLM Judge） |
| **LiteLLM 预设** | 支持 20+ 提供商，自动导入配置 |
| **健康监控** | 定期探测 + 可用率统计 + P50/P95 延迟 |
| **Provider Adapter** | 统一不同 LLM 提供商的 API 接口 |

### 新增创新特性 🆕

| 特性 | 说明 |
|------|------|
| **虚拟模型映射** | 一个虚拟模型映射到多个物理模型 |
| **实时可用性管理** | 内存中维护实时可用性状态 |
| **完整断路器机制** | 状态机 + 自动恢复 + 半开状态 |
| **现代化技术栈** | Hono + React 19 + PostgreSQL + Drizzle ORM |

---

## 🛠️ 技术栈

### 后端
- **Runtime**: Bun
- **框架**: Hono (轻量级，边缘友好)
- **语言**: TypeScript
- **数据库**: PostgreSQL 16
- **ORM**: Drizzle ORM (类型安全)
- **认证**: JWT

### 前端
- **框架**: React 19
- **路由**: TanStack Start
- **UI**: shadcn/ui + TailwindCSS
- **状态管理**: TanStack Query + Zustand
- **构建**: Vite

### 架构
- **Monorepo**: Bun workspaces
- **代码组织**: Bulletproof-React 风格（功能切片）
- **部署**: Docker / Docker Compose

---

## 📁 项目结构

```
x-llm-gateway/
├── apps/
│   └── web/              # 全栈应用（TanStack Start + Hono）
│       ├── app/
│       │   ├── routes/   # 页面路由（React SSR）
│       │   └── server/   # API 路由（Hono）
│       └── package.json
├── packages/
│   ├── shared/           # 共享类型定义、工具函数
│   ├── database/         # Drizzle ORM schema、migrations
│   └── config/           # 配置文件类型和加载逻辑
├── docs/                 # 文档和设计
│   ├── plans/            # 架构设计文档
│   ├── migration-vinxi-to-vite.md        # Vinxi 迁移记录
│   └── unified-port-architecture.md      # 统一端口架构
└── README.md
```

---

## 📚 文档

### 架构设计
- [统一端口架构文档](docs/unified-port-architecture.md) - **最新架构**
- [Vinxi 迁移记录](docs/migration-vinxi-to-vite.md) - Vinxi → Vite 6 迁移
- [v2.0 架构设计文档](docs/plans/2026-01-25-x-llm-gateway-v2-architecture.md) - 完整设计
- [架构对比分析](docs/plans/architecture-comparison.md) - 对比三种设计方案

### 参考项目
- [llm-gateway 项目概览](~/Workspaces/GitHub/zbin/llm-gateway/docs/project-overview.md)

---

## 🚀 快速开始

### 前置要求

- Bun >= 1.0.0
- PostgreSQL >= 16
- Docker (可选)

### 本地开发

```bash
# 克隆项目
git clone https://github.com/xxx/x-llm-gateway.git
cd x-llm-gateway

# 安装依赖
bun install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件

# 启动数据库
docker-compose up -d postgres

# 运行数据库迁移
bun run db:migrate

# 启动开发服务器（统一端口 3000）
bun run dev

# 访问应用
# 前端页面：http://localhost:3000
# API 接口：http://localhost:3000/api
```

### 访问端点

| 类型 | URL | 说明 |
|------|-----|------|
| 🏠 首页 | http://localhost:3000/ | React SSR 页面 |
| 🧪 测试 | http://localhost:3000/test-api | API 测试页面 |
| 🔌 API | http://localhost:3000/api | API 根路由 |
| ❤️ 健康 | http://localhost:3000/api/health | 健康检查 |


### Docker 部署

```bash
# 构建镜像
docker-compose build

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f gateway
```

---

## 📅 开发路线图

> **开发模式**: 功能驱动的全栈同步开发 - 每个功能同时完成前后端，快速迭代

当前项目处于 **Phase 2 进行中**，采用 9 个 Phase 的全栈同步开发：

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

📖 详细开发路线图：[DEVELOPMENT-ROADMAP.md](docs/DEVELOPMENT-ROADMAP.md)

---

## 🤝 贡献

欢迎贡献！请遵循以下步骤：

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 提交 Pull Request

---

## 📄 许可证

MIT License

---

## 🙏 致谢

- [llm-gateway](https://github.com/xxx/llm-gateway) - 原始项目和灵感来源
- [LiteLLM](https://github.com/BerriAI/litellm) - LLM 代理参考
- [Bulletproof React](https://github.com/alan2207/bulletproof-react) - 架构模式参考

---

**项目状态**: 🚧 Phase 2 进行中（供应商管理）
**开发模式**: 功能驱动的全栈同步开发
**当前版本**: 2.0.0
**最后更新**: 2026-01-27
