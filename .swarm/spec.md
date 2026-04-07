# Model Request Rank System

## Feature Description

用户需要记录来自客户端的所有请求模型名称，并根据这些请求生成一个排名（Rank）系统。这些被请求过的模型列表及其排名数据将在模型路由逻辑中使用，以优化模型选择和分配策略。

**WHY**:

- 了解客户端实际使用的模型分布，优化资源分配
- 基于真实使用数据进行智能路由决策
- 为容量规划和成本优化提供数据支持

## User Scenarios

### Scenario 1: 记录客户端模型请求

**Given** 客户端发送请求到网关，请求体中包含模型名称（如 "gpt-4-turbo"）
**When** 请求经过日志记录服务
**Then** 系统记录该模型名称，并更新其请求计数和时间戳

### Scenario 2: 生成模型请求排名

**Given** 系统已记录大量客户端模型请求
**When** 查询模型排名列表
**Then** 返回按请求次数排序的模型列表，包含排名、模型名称、请求次数、首次/最后请求时间等统计信息

### Scenario 3: 在模型路由中使用排名数据

**Given** 模型路由器需要选择最佳的模型实例
**When** 使用智能路由策略（如 smart 或 weighted）
**Then** 路由器可以访问模型排名数据，优先选择热门模型或平衡冷门模型的负载

## Functional Requirements

### FR-001: 增强客户端模型记录

系统必须增强现有的 `client-model-recorder` 功能，支持：

- 记录原始客户端请求的模型名称（已存在）
- 记录虚拟模型映射后的实际模型名称
- 记录请求来源（virtual key、client identifier）
- 记录请求成功/失败状态

### FR-002: 模型请求统计聚合

系统必须提供模型请求统计聚合功能：

- 按时间窗口聚合（小时、天、周、月）
- 支持按状态筛选（all、success、failure）
- 支持按来源筛选（virtual key、client）
- 计算排名得分（基于请求次数、成功率、时间衰减等因子）

### FR-003: Rank 生成和存储

系统必须生成并存储模型请求排名：

- 实时更新或定期批处理生成 Rank
- 支持多种排名算法（简单计数、时间衰减、加权）
- Rank 数据包含：排名、模型名称、得分、请求数、成功率、时间戳
- 支持历史 Rank 数据存储（用于趋势分析）

### FR-004: Rank API 接口

系统必须提供 REST API 接口访问 Rank 数据：

- `GET /api/logs/model-ranks` - 获取当前排名列表
- `GET /api/logs/model-ranks/:modelName` - 获取特定模型的排名详情
- `GET /api/logs/model-ranks/statistics` - 获取排名统计数据
- 支持分页、排序、筛选参数

### FR-005: 路由器集成

模型路由器必须能够访问和使用 Rank 数据：

- ModelGroupRouter 可以根据 Rank 调整权重
- Smart 策略考虑模型热度进行路由决策
- 支持 Rank 数据缓存以提高性能
- 提供 fallback 机制（Rank 数据不可用时）

### FR-006: 前端管理界面

系统必须提供前端界面展示 Rank 数据：

- 排名列表页面（表格展示）
- 趋势图表（历史 Rank 变化）
- 单个模型详情页
- 筛选和搜索功能

## Success Criteria

### SC-001: 数据记录准确性

当客户端发送 1000 次请求到不同模型时，系统必须准确记录每个模型的请求次数，误差不超过 1%。

### SC-002: 排名生成性能

当系统记录了 10,000 个不同模型时，排名生成查询响应时间应小于 500ms（P95）。

### SC-003: 路由器集成正确性

当使用 Rank 数据进行智能路由时，热门模型的选择概率应与其排名正相关，相关性系数 > 0.8。

### SC-004: API 可用性

Rank API 端点必须在 99.9% 的��间内可用，响应时间 < 200ms（P95）。

### SC-005: 前端可用性

前端界面加载时间应 < 2s，支持至少 100 并发用户访问。

## Key Entities

- **ModelRequestLog**: 单次模型请求记录（已存在于 request_logs）
- **ClientRequestedModel**: 客户端请求的模型统计（已存在，需增强）
- **ModelRank**: 模型排名数据（新增）
- **RankConfiguration**: 排名算法配置（新增）
- **ModelRoutingDecision**: 路由决策记录（可选，用于分析）

## Edge Cases and Failure Modes

### EC-001: 模型名称不一致

- **问题**: 客户端可能使用不同的模型名称别名（如 "gpt-4" vs "gpt-4-turbo"）
- **解决方案**: 系统应同时记录原始名称和标准化名称，并在排名时进行合并

### EC-002: 高并发写入冲突

- **问题**: 大量并发请求可能导致数据库写入冲突
- **解决方案**: 使用 PostgreSQL upsert 或异步批处理写入

### EC-003: Rank 数据过期

- **问题**: 旧的 Rank 数据可能不再反映当前使用模式
- **解决方案**: 实现时间衰减算法，定期清理过期数据

### EC-004: 路由器依赖 Rank 失败

- **问题**: Rank 服务不可用时，路由器无法正常工作
- **解决方案**: 实现降级策略，使用默认权重或缓存数据

### EC-005: 隐私和合规性

- **问题**: 某些场景下需要匿名化处理请求来源
- **解决方案**: 提供配置选项，支持不记录敏感来源信息

## Technical Constraints

- 必须兼容现有的日志系统架构（features/logs/）
- 必须兼容现有的模型路由系统（features/gateway/services/）
- 使用 PostgreSQL + Drizzle ORM 进行数据存储
- 使用 React Query 进行前端数据获取
- 遵循 Bulletproof React 代码组织结构
- 单个文件不超过 300 行代码

## Dependencies

- 现有的 `client-model-recorder.ts` 功能
- 现有的 `log-service.ts` 集成点
- 现有的 `ModelGroupRouter` 和 `VirtualModelRouter`
- 数据库迁移系统（Drizzle）
- 前端组件库（shadcn/ui）

## Design Decisions

1. **排名算法**: 时间衰减算法（最近请求权重更高）
   - 使用指数衰减函数，半衰期为 7 天
   - 计算公式：score = requestCount _ e^(-λ _ daysSinceLastRequest)
   - 既反映历史热度，又突出近期趋势

2. **Rank 更新频率**: 定时批处理（每小时）
   - 使用定时任务（cron job 或 Bun 定时器）
   - 减少数据库写入负载
   - Rank 数据可容忍 1 小时延迟

3. **前端界面**: 简单表格列表
   - 展示模型排名、请求数、得分、首次/最后请求时间
   - 支持排序、搜索、分页
   - 不包含图表和复杂仪表板
