### 一、 核心领域模型与功能视图

我们将系统划分为四大核心模块，它们共同协作以实现“无感路由”与“智能分发”。

#### 1. 认证与访问控制
这是系统的门卫，负责“你是谁”和“你能做什么”。

*   **核心功能**：
    *   **虚拟 API Key 管理**：用户不再持有 OpenAI/Anthropic 的真实 Key，而是持有 Gateway 生成的 Key。
    *   **权限与配额**：基于 Key 绑定具体的模型访问权限（如：只能访问 GPT-4，不能访问 Claude-3）以及速率限制（RPM/TPM）。
*   **功能联系**：它是所有请求的必经入口。验证成功后，提取用户身份信息，传递给**路由模块**做决策，传递给**计费/日志模块**做记录。

#### 2. 资产管理
这是系统的“数据库”，记录了所有的上游能力和用户配置。

*   **核心功能**：
    *   **供应商管理**：配置 OpenAI、Anthropic 等供应商的 API Endpoint、认证凭证（真实 Key）、优先级、权重。
    *   **模型元数据**：定义模型名称、上下文窗口大小、支持的功能（如是否支持 Function Calling、Image Input）、定价策略。
    *   **模型映射**：建立“用户请求模型”到“上游实际模型”的映射关系。
*   **功能联系**：为**智能路由**提供决策依据（例如：A 供应商挂了，去查供应商表找 B 供应商）。

#### 3. 智能路由与流量编排
这是系统的“大脑”，也是你最核心的竞争力。

*   **核心功能**：
    *   **协议标准化**：将 OpenAI、Anthropic、Gemini 等不同格式的请求，统一转换为 Gateway 内部的标准格式。
    *   **协议适配**：将内部标准格式转换为目标供应商所需的特定格式。
    *   **健康检查与故障转移**：实时监控供应商状态。如果请求 OpenAI 失败，自动重试到 Azure OpenAI 或 Anthropic。
    *   **智能路由策略**：
        *   **基于成本**：谁便宜用谁。
        *   **基于性能**：谁快用谁。
        *   **基于负载**：哪个空闲用谁。
*   **功能联系**：接收**认证模块**放行的请求，查询**资产管理**获取目标，通过**协议转换**适配上游，最后将结果返回。

#### 4. 意图识别与专家路由
这是系统的“高级大脑”，实现你提到的“二次分发”。

*   **核心功能**：
    *   **轻量级意图分析**：在请求到达大模型前，先经过一个极小、极快的模型（如 GPT-3.5-turbo 或 Llama-3-8b）进行分类。
    *   **专家分发**：根据意图将请求路由到特定的“专家模型”。
        *   *例如：用户问“写个 Python 脚本” -> 路由到 CodeLlama；用户问“总结这篇文章” -> 路由到 Claude-3 (擅长长文本)。*
*   **功能联系**：这是一个“前置过滤器”。请求进来后，不直接走主路由，而是先分流。如果识别出需要特定处理，则修改路由的目标模型。

---

### 二、 关键技术原理与实现逻辑

这里重点解析你提到的难点：**协议兼容、工具调用透传、意图路由**。

#### 1. 协议兼容与转义
**原理**：适配器模式。
虽然用户使用的是 Anthropic 协议请求，但目标模型是 OpenAI，Gateway 需要在中间做“翻译”。

*   **请求阶段**：
    1.  用户发送 Anthropic 格式的 JSON (`messages`, `max_tokens` 等)。
    2.  Hono 中间件解析 Payload。
    3.  **归一化器**：将 Anthropic 的字段映射到内部标准格式（例如：Anthropic 的 `system` 参数可能需要拼接到 OpenAI 的 `messages` 数组开头）。
    4.  **反序列化器**：将内部标准格式转换为 OpenAI 格式（例如：处理 `tools` 定义的差异）。
*   **响应阶段**：
    1.  接收 OpenAI 的响应（流式或非流式）。
    2.  **再序列化**：将 OpenAI 的 `chunk` 格式转换回 Anthropic 兼容的 `chunk` 格式，保持 SSE (Server-Sent Events) 流的连续性，不让客户端感知断开。

#### 2. 工具调用透穿
**原理**：元数据保持与结构映射。
LLM 的 Tool Calling（Function Calling）在不同厂商间参数结构差异巨大（OpenAI 用 `tools` 和 `tool_call_id`，Anthropic 用 `tools` 和 `tool_use_id`）。

*   **透传逻辑**：
    1.  Gateway 识别到请求中包含 `tools` 定义。
    2.  不解析工具的具体逻辑，只做**结构翻译**。
    3.  **关键点**：如果上游模型不支持工具调用，Gateway 必须在路由阶段**过滤掉**该模型，选择支持工具调用的模型，或者由 Gateway 自己模拟一个不支持错误的响应（但这不是最优解，最优解是路由时规避）。
    4.  **流式处理难点**：在流式响应中，Tool Call 的参数是分片传输的（`delta`）。Gateway 必须缓存这些分片，拼装成完整参数后再转发给客户端，或者直接透传字节流但需修改事件名称。

#### 3. 意图识别与二次分发
**原理**：责任链模式。

*   **流程**：
    1.  用户请求 -> Gateway。
    2.  **第一层检查**：是否开启了“专家模式”？
    3.  **是**：截取 Prompt，发送给“路由模型”（Router Model，极低成本模型）。Prompt 为：“这是一个用户请求：'{user_prompt}'，请从以下列表中选择最合适的模型：['gpt-4', 'claude-3-opus', 'code-specialist']。只返回模型名称。”
    4.  **路由模型**返回：`code-specialist`。
    5.  **重写请求**：Gateway 将原本请求的目标模型（用户指定的默认模型）覆盖为 `code-specialist`。
    6.  **后续流程**：进入标准的“协议转换” -> “供应商调用”。

---

### 三、 功能间的联系与数据流向

为了让你更直观地理解，我们描述一个典型的请求生命周期：

**场景**：用户持有 Gateway Key，使用 Anthropic SDK 发送请求，意图是“编写一个 SQL 查询”。系统配置了“专家路由”。

1.  **接收与认证**
    *   *Hono Server* 接收请求。
    *   *Auth Middleware* 校验 Key。通过后，提取 UserID 和 RateLimit。
    *   **联系点**：将 UserID 注入到请求上下文中。

2.  **意图分析**
    *   *Intent Middleware* 检测到该用户开启了“专家路由”。
    *   Gateway 调用内部轻量模型分析意图，判定为“Coding Task”。
    *   **联系点**：根据意图结果，查询 *Model Management*，决定将目标模型重写为 `gpt-4-turbo`（假设配置中它是最强的代码模型）。

3.  **协议标准化**
    *   用户发送的是 Anthropic 格式。
    *   *Normalizer* 将其转换为 Gateway 内部定义的 `StandardLLMRequest` 对象。
    *   **联系点**：在此处检查用户请求的参数（如 `temperature=0.7`），如果超出模型允许范围，在此修正。

4.  **智能路由与供应商选择**
    *   *Router* 查询 `gpt-4-turbo` 的可用供应商。
    *   *Health Check Service* 显示 OpenAI 官方 API 延迟过高，但 Azure OpenAI 状态良好。
    *   **联系点**：Router 选择 Azure OpenAI 作为目标。

5.  **协议适配与转发**
    *   *Adapter* 将 `StandardLLMRequest` 转换为 Azure OpenAI 特定的 ChatCompletion 格式。
    *   使用 `fetch` 向 Azure 发起请求。

6.  **响应流处理**
    *   接收 Azure 的 SSE 流。
    *   *Stream Transformer* 将 Azure 的事件格式逆向转换为 Anthropic 格式。
    *   **联系点**：实时流回给用户，同时将 Token 消耗统计发送给 *Logging/Quota Service*。

---

### 四、 基于技术栈的开发建议

既然你使用了 **Bulletproof React** 模式，你的代码结构应该非常清晰。针对 LLM-Gateway，我建议以下包/目录结构：

*   **`/apps/api` (Hono + Bun)**:
    *   **`/routes`**: 定义 API 端点（兼容 OpenAI path `/v1/chat/completions`）。
    *   **`/services`**: 核心业务逻辑。
        *   `auth.service.ts`: 验证 Key。
        *   `router.service.ts`: 核心路由算法。
        *   `intent.service.ts`: 调用轻量模型分析意图。
        *   `provider.service.ts`: 封装对不同 Provider 的调用。
    *   **`/lib/adapters`**: 协议转换器。
        *   `anthropic-to-openai.ts`
        *   `openai-to-standard.ts`
    *   **`/db`**: (Drizzle ORM) Schema 定义。

*   **`/apps/web` (Next.js + TanStack Query)**:
    *   **Dashboard**: 展示 Key 的调用量、成本（Gateway 可以解析响应头估算 Token）。
    *   **Provider Config**: 动态配置上游供应商。
    *   **Playground**: 类似于 OpenAI Playground，支持切换不同模型测试。

*   **数据层**:
    *   `api_keys`: 存储哈希后的 Key 和权限配置 JSON。
    *   `providers`: 存供应商 URL、权重、健康状态。
    *   `audit_logs`: 存储请求日志（用于计费和调试）。

---


我将为你设计**请求全生命周期（Request Lifecycle）**的详细处理逻辑。这不是纯技术文档，而是**产品级流程设计**——明确每个环节的业务价值、决策逻辑和用户体验。

---

## 一、 整体架构视图（分层处理模型）

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: 边缘层 (Edge Layer)                                │
│  • 接收请求 • SSL/TLS • 基础 WAF • 生成 Trace ID             │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│  Layer 2: 控制层 (Control Plane)                             │
│  • 认证/授权 • 配额检查 • 意图识别 • 路由决策                   │
│  【状态：无状态，可水平扩展】                                   │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│  Layer 3: 协议层 (Protocol Layer)                            │
│  • 请求标准化 • 协议适配 • 流式转换                           │
│  【核心：Adapter Pattern 实现】                               │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│  Layer 4: 上游层 (Upstream Layer)                            │
│  • 连接池管理 • 健康检查 • 故障转移 • 重试策略                 │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│  Layer 5: 观察层 (Observability Layer)                       │
│  • 异步计费 • 日志写入 • 缓存更新 • 指标上报                   │
│  【非阻塞，消息队列驱动】                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、 详细处理流程（时序逻辑）

### Phase 1: 入口处理（< 10ms）

**1.1 请求指纹生成**
```yaml
动作:
  - 生成 UUIDv7 作为 Request-ID（时间排序友好）
  - 解析 Headers:
      - Authorization: Bearer <virtual-key>
      - X-User-Id: <optional-custom-id>
      - X-Intent-Routing: <enabled|disabled>  # 是否开启意图路由
      - Accept: text/event-stream  # 判断是否流式请求
  - 注入上下文: 
      - start-time: timestamp
      - region: edge-node-location
```

**1.2 虚拟 Key 认证（Auth Middleware）**
```yaml
逻辑:
  1. 从 Header 提取 Key，Redis 查询（Key: vk:{hash}，TTL 5min）
  2. 若缓存未命中，查询数据库 (api_keys 表)
  3. 验证状态:
     - 是否被吊销 (revoked_at)?
     - 是否在有效期内?
  4. 加载权限配置 (JSON):
     {
       "allowed_models": ["gpt-4", "claude-3-opus"],
       "rate_limit": {"rpm": 100, "tpm": 10000},
       "budget_limit": 500.00,  # USD
       "features": ["stream", "function_calling"]
     }

失败响应:
  - 401: "Invalid API Key"  （立即拒绝，不记录）
  - 403: "Key suspended"     （写入审计日志）
```

---

### Phase 2: 前置决策（< 50ms）

**2.1 速率限制检查（Token Bucket Algorithm）**
```yaml
实现: Redis + Lua 原子脚本
Key: rate_limit:{virtual-key}:{minute}

逻辑:
  1. 检查 RPM（每分钟请求数）和 TPM（每分钟 Token 数）
     - 注意: 此时还不知道 Input Tokens，用预估 Header 或上次平均值
  2. 若超限:
     - 返回 429 Too Many Requests
     - Header: Retry-After: 60
     - 触发告警（如果连续超限）

边界情况:
  - 突发流量: 允许 10% 的桶容量 Burst
```

**2.2 预算检查（Budget Guard）**
```yaml
逻辑:
  1. 查询本月已消费金额 (PostgreSQL 或 Redis 计数器)
  2. 若当前请求预估成本 + 已消费 > 预算限制:
     - 软限制: 返回警告 Header X-Budget-Warning: 90%
     - 硬限制: 返回 403 "Budget exceeded"，建议用户升级计划
```

**2.3 意图识别（Intent Router）- 可选分支**
```yaml
触发条件: X-Intent-Routing: enabled 且模型为 "auto" 或未指定

处理流程:
  1. 提取 Prompt 前 500 字符（避免过长）
  2. 调用轻量分类模型（Router Model）:
     - 输入: {"text": "用户问题...", "categories": ["coding", "writing", "analysis"]}
     - 输出: "coding" (置信度 0.92)
  3. 查询映射表:
     "coding" -> "claude-3-sonnet"  # 代码能力强
     "writing" -> "gpt-4-turbo"     # 创意写作强
  4. 重写目标模型: 
     - 原始: "model": "auto"
     - 重写后: "model": "claude-3-sonnet"
     - 添加 Header: X-Router-Decision: claude-3-sonnet (reason: coding, confidence: 0.92)

性能优化:
  - 缓存常见 Prompt 的分类结果（Semantic Cache）
  - 超时控制: 若分类模型 > 100ms，跳过并使用默认模型
```

---

### Phase 3: 核心路由（< 20ms）

**3.1 供应商选择（Supplier Selection）**
```yaml
输入: 目标模型 (e.g., "gpt-4")

决策逻辑:
  1. 查询资产管理模块，获取候选供应商:
     - OpenAI: 权重 50%, 优先级 1, 当前延迟 800ms, 健康: UP
     - Azure OpenAI: 权重 30%, 优先级 2, 当前延迟 600ms, 健康: UP
     - 其他: 权重 20%, 优先级 3...

  2. 应用策略:
     - 如果用户指定 Provider: 强制使用（但检查健康状态）
     - 如果未指定:
       a. 排除健康检查失败的供应商（最近 3 次请求失败或延迟 > 5s）
       b. 根据策略选择:
          - "latency": 选当前 RTT 最低的
          - "cost": 选单价最低的
          - "weighted": 按权重随机（默认）

  3. 选择结果: Azure OpenAI (East US)

输出:
  - target_provider: azure-openai
  - target_url: https://xxx.openai.azure.com/openai/deployments/gpt-4/chat/completions
  - real_model_name: gpt-4-1106-preview  # 内部映射名
```

**3.2 请求标准化（Normalization）**
```yaml
动作:
  - 将各种输入格式（OpenAI/Anthropic/Gemini）转换为内部标准 Schema:
    {
      "messages": [...],
      "temperature": 0.7,
      "max_tokens": 4096,
      "tools": [...],      # 统一工具定义格式
      "stream": true,
      "original_format": "openai"
    }

验证:
  - 检查 max_tokens 是否超过模型上下文限制
  - 如果超过，截断或返回 400 Bad Request（根据配置）
```

---

### Phase 4: 上游交互（Variable Duration）

**4.1 协议适配（Adaptation）**
```yaml
转换器: OpenAI-to-Azure-OpenAI Adapter

关键转换:
  - Auth: Bearer Token -> api-key Header
  - Model: "gpt-4" -> "gpt-4-1106-preview" (部署名映射)
  - Tools: 标准格式 -> Azure 特定格式（如有差异）
  - 添加 Azure 特定参数: api-version=2024-02-01
```

**4.2 连接管理与执行**

**非流式请求（Blocking）**:
```yaml
执行:
  1. 从连接池获取 HTTP/2 连接（Keep-Alive）
  2. 发送请求，设置超时:
     - 连接超时: 5s
     - 读取超时: 300s（大模型生成可能很慢）
  3. 接收完整响应

故障转移:
  - 如果 5xx 错误或超时:
    - 标记该供应商实例为 "unhealthy"（断路器模式）
    - 重试下一个候选供应商（最多 2 次重试）
    - 若全部失败，返回 503 "All providers unavailable"
```

**流式请求（Streaming / SSE）**:
```yaml
关键挑战: 不能等完整响应，必须边收边转

处理流程:
  1. 建立与上游的 SSE 连接
  2. 立即向客户端返回 200 OK + Content-Type: text/event-stream
  3. 开启双向流泵（Pump）:
   
     while (upstreamChunk = await upstream.read()) {
       // 协议转换（Chunk 级别）
       standardizedChunk = adaptChunk(upstreamChunk, targetFormat="openai");
     
       // 客户端写入
       clientStream.write(standardizedChunk);
     
       // 异步统计（不阻塞流）
       analytics.collect(standardizedChunk.tokenCount);
     }

  4. 流结束处理:
     - 上游返回 [DONE] 或断连 -> 向客户端发送 [DONE]
     - 如果上游中途断开: 尝试无缝切换到备用供应商（复杂，需客户端配合重试）
```

**4.3 工具调用特殊处理（Tool Calling Passthrough）**
```yaml
场景: 请求包含 tools 定义，且上游支持

流式处理难点:
  - 工具参数是逐 Token 传输的（delta）
  - Gateway 可以选择:
    a) 透传模式: 直接转发字节流（最快，但不透明）
    b) 缓冲模式: 缓存完整参数后再转发（允许修改/验证）

推荐策略:
  - 默认透传模式保证低延迟
  - 如果开启 "Tool Validation"，则使用缓冲模式，验证参数 Schema 后再转发
```

---

### Phase 5: 响应处理与后置（< 30ms）

**5.1 响应标准化（Reverse Adaptation）**
```yaml
目标: 无论上游是什么，返回用户期望的格式（与请求协议一致）

示例转换（Azure -> OpenAI）:
  - 移除 Azure 特定 Header
  - 将内容块格式统一为 OpenAI 的 choices/delta 结构
  - 保留 Usage 信息（input/output tokens）
```

**5.2 元数据注入（Transparency Headers）**
```yaml
在 HTTP Response Header 中注入:
  X-Request-ID: req_xxx
  X-Model-Used: claude-3-sonnet  # 实际调用的模型（可能因路由而异）
  X-Provider: azure-openai       # 实际供应商
  X-Cached: false                # 是否命中缓存
  X-Cost-USD: 0.0032             # 本次请求成本（实时计算）
  X-Router-Decision: latency     # 路由策略（如果启用了智能路由）
  X-Remaining-Quota: 9823        # 剩余 Token 配额（可选）
```

**5.3 异步后置处理（Non-Blocking）**
```yaml
通过消息队列（Redis Stream / Kafka）异步执行:

  1. 计费服务:
     - 解析 Usage (prompt_tokens, completion_tokens)
     - 按供应商定价计算实际成本
     - 累加用户账单（原子操作）

  2. 日志服务:
     - 写入 ClickHouse/TimescaleDB（时序数据库）
     - 字段: timestamp, virtual_key, model, latency, cost, status
     - 注意: 可配置是否记录 Prompt 内容（隐私模式只记录哈希）

  3. 缓存服务（可选）:
     - 如果请求非流式、无随机性（temperature=0）、且常见:
     - 缓存响应到 Redis（TTL 1h），Key: hash(prompt+model)

  4. 监控告警:
     - 如果 latency > P99 阈值，发送告警
     - 如果特定供应商错误率上升，触发熔断
```

---

## 三、 异常处理决策树

```
开始
  │
  ▼
认证失败? ──Yes──► 401 立即返回（无日志记录）
  │ No
  ▼
限流触发? ──Yes──► 429 + Retry-After（写入限流日志）
  │ No
  ▼
预算超限? ──Yes──► 403 Budget Exceeded（硬限制）或 200 + Warning（软限制）
  │ No
  ▼
意图识别超时? ──Yes──► 降级到默认模型（记录降级原因）
  │ No
  ▼
上游连接失败? ──Yes──► 尝试故障转移（最多2次）──► 全部失败? ──Yes──► 503 Service Unavailable
  │ No                          │ No
  ▼                             ▼
上游返回 5xx? ──Yes──► 是否可重试? ──Yes──► 故障转移
  │ No              │ No
  │                 ▼
  │               返回 502 Bad Gateway（携带上游错误详情）
  ▼
正常响应 ──► 协议转换 ──► 返回客户端
```

---

## 四、 关键设计决策（Product Decisions）

| 决策点 | 选择 | 理由 |
|--------|------|------|
| **流式中断处理** | 不自动重试，返回特定错误码 `X-Stream-Interrupted` | 流式重试会导致客户端收到重复内容，需客户端配合实现 Checkpoint 续传 |
| **配额检查时机** | 请求前检查（预检）+ 响应后扣减（实际） | 避免预检通过但实际 Token 超支，允许短期 Burst |
| **工具调用转换** | 默认透传，可选 Schema 校验 | 性能优先，安全敏感客户可开启严格模式 |
| **缓存策略** | 仅缓存 `temperature=0` 的请求 | 避免随机性输出被错误缓存 |
| **供应商健康检查** | 被动检测（实际请求失败）+ 主动探测（每 30s） | 减少无效探测成本，快速发现故障 |

---

## 五、 开发者体验（DX）优化点

**调试支持**：
- **Replay 功能**: 在 Dashboard 中输入 Request-ID，可查看完整请求链路（脱敏后）
- **Shadow Mode Header**: `X-Shadow-Compare: true` 会同时调用两个供应商并返回差异对比（仅用于测试）

**可观测性**：
- **OpenTelemetry 集成**: 生成标准 Trace，可导入 Jaeger/Zipkin
- **实时日志流**: 通过 WebSocket 推送日志到 Dashboard（类似 Cloudflare Live Logs）

这个流程确保了**每一毫秒都有产品价值**：从快速认证到低延迟路由，再到透明的成本追踪。下一步可以基于此设计具体的 API 接口契约（OpenAPI Spec）。