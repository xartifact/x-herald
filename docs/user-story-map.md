## 用户故事地图（LLM Gateway）

### 🎯 Activity 1: 探索与决策（Discover & Evaluate）
*目标：降低试用门槛，建立信任*

| User Tasks | Release 1 (Foundation)<br>*基础连通性* | Release 2 (Intelligence)<br>*智能优化* | Release 3 (Enterprise)<br>*规模治理* |
|------------|-------------------------------------|-------------------------------------|-----------------------------------|
| **1.1 了解产品价值** | • 查看支持的供应商矩阵（OpenAI/Anthropic/Gemini）<br>• 查看协议转换示例代码（OpenAI SDK → Claude）<br>• **个人**: GitHub OAuth 一键登录 | • 使用成本计算器（输入月调用量，对比直接调用 vs Gateway）<br>• 查看客户成功案例与性能基准 | • 下载 SOC2/合规白皮书<br>• 申请企业级 POC（含安全问卷） |
| **1.2 体验 Playground** | • 在 Web UI 直接测试不同模型（零代码）<br>• 查看实时协议转换对比（Before/After JSON） | • 体验 "Auto Router" 效果（同一 Prompt，不同模型输出对比）<br>• 查看潜在成本节省提示 | • 体验 Team Workspace 隔离<br>• 测试 SSO 集成流程 |

---

### 🔌 Activity 2: 接入与配置（Onboard & Configure）
*目标：5分钟完成从注册到首次调用*

| User Tasks | Release 1 (Foundation) | Release 2 (Growth) | Release 3 (Enterprise) |
|------------|------------------------|-------------------|----------------------|
| **2.1 管理访问凭证** | • 生成 Virtual API Key<br>• 设置 Key 的 Rate Limit (RPM/TPM)<br>• 设置 Key 的模型白名单（如只允许 GPT-3.5） | • 创建只读/读写权限分离的 Key<br>• 设置 Token 月度预算上限（硬限制/软告警） | • 通过 SCIM 自动同步团队成员<br>• 基于 RBAC 的 Key 分配（Engineer vs PM 权限差异）<br>• Key 的审批工作流 |
| **2.2 配置上游供应商** | • 添加 OpenAI/Anthropic 官方 API Key<br>• 配置基础 Endpoint URL<br>• 测试连通性（Health Check） | • 添加 Azure OpenAI（企业专用端点）<br>• 配置本地 Ollama/LM Studio 实例<br>• 设置供应商优先级与权重 | • 配置私有部署的 VPC Peering<br>• 设置数据驻留策略（EU 数据只走 Azure EU）<br>• 供应商凭证的自动轮换 |
| **2.3 迁移现有应用** | • **个人**: 修改 `base_url` 和 `api_key` 即可迁移（一行代码）<br>• 验证现有 OpenAI SDK 代码无需改动即可运行 | • 批量导入现有 API Keys（从 .env 文件）<br>• 兼容性检查工具（扫描代码中的特殊参数） | • Terraform Provider 基础设施即代码配置<br>• 与现有 API Management 网关集成（Kong/AWS API Gateway） |

---

### ⚡ Activity 3: 请求处理与路由（Request & Route）
*目标：无缝、智能、高可用的推理服务*

| User Tasks | Release 1 (Foundation) | Release 2 (Growth) | Release 3 (Enterprise) |
|------------|------------------------|-------------------|----------------------|
| **3.1 发送请求** | • 通过 OpenAI 标准格式调用任意模型<br>• 支持流式响应 (SSE)<br>• 支持非流式响应 | • 支持 Vision 模型（图像输入）<br>• 支持 Function Calling / Tool Use<br>• 支持 JSON Mode | • 支持 Fine-tuned 模型接入<br>• 支持长文本分段处理（超出上下文自动摘要） |
| **3.2 协议转换** | • 自动转换 OpenAI ↔ Anthropic 消息格式<br>• 处理 System Prompt 差异（拼接 vs 参数）<br>• 处理 Tool Calling  Schema 差异 | • 处理 Google Gemini 的特殊内容块格式<br>• 支持自定义转换规则（通过 JavaScript/DSL 配置）<br>• 保留原始响应头信息 | • 与内部私有模型协议适配（自定义 Schema）<br>• 遗留系统 SOAP/REST 转换支持 |
| **3.3 智能路由** | • **手动路由**: 显式指定目标模型（`model: claude-3-opus`）<br>• **故障转移**: OpenAI 失败自动重试到 Azure OpenAI<br>• **负载均衡**: 基于权重的简单轮询 | • **成本优化路由**: 简单查询自动降级到 GPT-3.5/Haiku<br>• **意图路由**: 通过轻量模型分析，Coding 任务 → CodeLlama，写作任务 → Claude<br>• **延迟优先路由**: 选择当前 RTT 最低的供应商 | • **影子模式**: 新模型对比测试（并行调用但不影响生产流量）<br>• **A/B 测试路由**: 50% 流量到新模型进行效果评估<br>• **合规路由**: 根据数据敏感度选择处理区域 |
| **3.4 安全与预处理** | • 基础 API Key 鉴权 | • Prompt 注入检测与拦截<br>• 敏感词过滤（Content Safety）<br>• 请求大小限制与超时控制 | • PII 数据自动脱敏（调用前替换邮箱/电话）<br>• 数据泄露防护（DLP）规则引擎<br>• 对抗样本检测 |

---

### 📊 Activity 4: 观察与优化（Observe & Optimize）
*目标：可观测性驱动的成本与性能优化*

| User Tasks | Release 1 (Foundation) | Release 2 (Growth) | Release 3 (Enterprise) |
|------------|------------------------|-------------------|----------------------|
| **4.1 实时监控** | • 查看实时 Token 消耗（Input/Output）<br>• 查看当前请求延迟 (P50/P95)<br>• 查看错误率与状态码分布 | • 查看成本节省看板（"本月已为您节省 $X"）<br>• 查看模型使用分布热力图<br>• 查看路由决策日志（为何选择该模型） | • 多租户成本分摊视图（按 Team/Project）<br>• 自定义业务指标上报（与 Datadog/NewRelic 集成） |
| **4.2 调试与追踪** | • 查看最近 24h 请求/响应日志（限 100 条）<br>• 查看错误详情与堆栈 | • 全链路追踪（Trace ID 贯穿路由决策 → 协议转换 → 供应商调用）<br>• 查看缓存命中率与节省的 Token<br>• 日志过滤与高级搜索 | • 完整审计日志导出（CSV/JSON，保留 1 年）<br>• 与 SIEM 系统集成（Splunk/Sentinel）<br>• 合规报告自动生成（GDPR 数据使用报告） |
| **4.3 成本优化** | • 基础配额告警（邮件通知） | • **智能缓存**: 相同 Prompt 直接返回缓存结果（语义相似度匹配）<br>• **批量处理**: 自动合并短时间内的相似请求<br>• 预算预警（Slack/Webhook 通知） | • 预留实例（Reserved Capacity）购买建议<br>• 部门级预算自动冻结机制 |

---

### 🏢 Activity 5: 治理与协作（Govern & Scale）—— *企业专项*
*目标：从个人工具升级为组织级 AI 中枢*

| User Tasks | Release 1 | Release 2 | Release 3 (Enterprise Core) |
|------------|-----------|-----------|----------------------------|
| **5.1 组织管理** | — | — | • 创建多个 Workspace（生产/测试/沙箱）<br>• 配置 SAML/SSO（Okta/Azure AD）<br>• 用户组与权限矩阵管理 |
| **5.2 模型治理** | — | — | • 内部模型市场（上架自研模型）<br>• 模型版本控制与回滚<br>• 模型性能基准测试自动化 |
| **5.3 合规与审计** | — | — | • 数据零留存模式配置<br>• 地理围栏（Geo-fencing）策略<br>• 完整的审计追踪（Who/When/What Model/What Data） |

---

## 🚀 如何使用此地图进行版本规划

### Release 1: "万能适配器"（MVP - 月 1-2）
**目标**：让单个开发者能在 5 分钟内把 OpenAI 代码无缝切换到 Claude，且具备基础高可用。
**核心故事**：
- 2.1（Virtual Key 管理）
- 2.3（一行代码迁移）
- 3.2（协议转换）
- 3.3（故障转移）
- 4.1（基础监控）

### Release 2: "智能优化引擎"（Growth - 月 3-4）
**目标**：通过意图路由和缓存，证明客户使用 Gateway 比直接调用**更便宜且更快**。
**新增重点**：
- 1.2（成本计算器验证价值）
- 3.3（意图路由与成本优化路由）
- 3.4（Prompt 安全防护）
- 4.2（全链路追踪）
- 4.3（缓存与批量优化）

### Release 3: "企业 AI 中枢"（Enterprise - 月 5-6）
**目标**：成为中型企业的标准 AI 基础设施，满足采购、安全、合规所有要求。
**新增重点**：
- 2.1（RBAC 与审批流）
- 2.2（私有部署与数据驻留）
- 3.3（影子模式与 A/B 测试）
- 4.2（SIEM 集成与审计）
- 整个 Activity 5（治理与协作）

---

## 💡 关键依赖关系（Dependencies）

在开发时注意以下**必须按顺序实现**的故事：

1. **协议转换** (3.2 R1) **必须在** **故障转移** (3.3 R1) 之前完成 —— 你需要先能成功转换格式，才能切换到备用供应商。
2. **健康检查** (隐含在 3.3 R1) **必须在** **意图路由** (3.3 R2) 之前完成 —— 路由决策需要知道供应商是否可用。
3. **Virtual Key** (2.1 R1) **必须在** **成本分摊** (4.1 R3) 之前完成 —— 你需要先有多 Key 体系，才能按 Key 归属统计部门成本。
