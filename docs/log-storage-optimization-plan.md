# 请求日志存储优化方案

> 基于 2026-08-21 生产库实测数据制定。约束：**保留全部请求全文**、**不引入对象存储（MinIO）**、不破坏现有「请求详情 / 消息分析」功能。所有优化在当前技术栈内完成。

## 现状（实测）

生产库 `x_llm_gateway` 总大小 **7.1 GB**，两个日志表占 98%：

| 表                 | 物理                    | 行数   | 逻辑内容                                       |
| ------------------ | ----------------------- | ------ | ---------------------------------------------- |
| `request_logs`     | 3.6 GB（TOAST ~3.5 GB） | 46,841 | body 6.6 GB + resp 1.7 GB + meta 0.5 GB        |
| `request_attempts` | 3.4 GB（TOAST ~3.3 GB） | 46,841 | transformed body 6.7 GB + provider resp 1.7 GB |
| 其余 18 表         | < 0.2 GB                | —      | —                                              |

逻辑总量约 **17 GB**（JSONB 经 PGLZ 压缩到 ~7 GB，压缩比 ~2.5x）。物理空间主因不是压缩率，而是**写入了不该写的重复全文**。

## 约束与依赖（必须满足）

1. **保留全部请求全文** —— 训练语料可随时导出
2. **不使用 MinIO / 外部对象存储** —— 全部优化在 PG 内
3. **消息分析功能依赖 `request_logs.request_body.messages`**（`log-analyzer.ts` 直接读取）—— 该列必须留在 DB 且不可截断
4. UI 详情页展示 `transformedRequestBody` / `providerResponseBody`（`log-types.ts` 已可空处理）

## 冗余地图（病因）

同一份内容当前存了 4-5 份：

| 内容                      | 存储位置                                                | 是否必要                           |
| ------------------------- | ------------------------------------------------------- | ---------------------------------- |
| 客户端请求全文            | `request_logs.request_body`                             | ✅ 必要（消息分析 + 训练）         |
| 客户端请求全文（近似）    | `request_attempts.transformed_request_body`             | ⚠️ 同协议透传时重复                |
| 最后一条 user 消息全文    | `metadata.routing.routeChain[].intentTrace.userMessage` | ❌ 纯冗余（每链 step 各一份）      |
| 响应全文                  | `request_logs.response_body`                            | ✅ 保留                            |
| 响应全文（Provider 视角） | `request_attempts.provider_response_body`               | ⚠️ 与上面近似重复（详情 tab 展示） |

实测单条 monster 行：user 消息 1.69 MB，仅 `intentTrace.userMessage` 就复制了 3.4 MB（2 个链 step × 1.69 MB）。

## 方案（按 影响面 × 成本 排序）

### Phase 1：intentTrace.userMessage 截断（纯代码，~1h）

- **问题**：`intent-handler.ts` 把分类器输入（最后一条 user 消息全文）写入每个链 step 的 `intentTrace.userMessage`，与 `request_body.messages` 完全重复
- **改动**：`intent-handler.ts` 中 `userMessage` 截断到 2 KB（仅路由追踪展示用）；同时截断 `userMessageRaw` 到同样上限
- **结果**：metadata 写入量下降 90%+（3.3 MB/行 → 几 KB/行）；消息分析不受影响（仍读 `request_body`）
- **验证**：`bun test` 相关用例（routing-trace-recorder / intent-router 已有覆盖）+ 代理意图路由冒烟

### Phase 2：同协议透传不写 transformedRequestBody（纯代码，~2h）

- **问题**：`transformedRequestBody` 从 10+ 处写入（chat-completion / anthropic / responses / embedding / error-handler / non-streaming / log-stream 等）。OpenAI→OpenAI 透传时它与 `request_body` 内容近似，占 attempts 6.7 GB 的大头
- **改动**：仅当 `incomingProtocol !== targetProtocol`（真实跨协议转换）时写入 transformed body；同协议透传写入 `null`。UI 详情页透传场景展示「透传」（现有 nullable 类型已兼容）
- **结果**：attempts 新增量大幅下降；跨协议全文保留（满足训练）
- **验证**：代理透传测试 + 跨协议转换测试（`proxy.test.ts` / `proxy-cross-provider-failover.test.ts` 已有链路）

### Phase 3：训练语料按需导出（独立脚本，~2h）

- **问题**：语料层若落库会造成日志层 ↔ 语料层冗余（日志已是唯一原文源）
- **改动**：独立导出脚本（`scripts/export-corpus.ts`）：
  1. `request_logs` 按 `conversation_id` 聚合多轮 → 完整对话
  2. 仅取 `status=success` 且有完整响应的请求
  3. 复用 `stripNoiseBlocks` 剥离 system-reminder / tool 噪声
  4. 脱敏（虚拟密钥名、IP、user_agent 不入语料）
  5. 去重（retry / 重放样本，按内容指纹）
  6. 输出 JSONL（每行一条对话样本，带 `source_log_id` 可溯源）
- **结果**：语料在导出时生成，DB 不存派生副本；日志层保留全量原文，训练需求变化可重新导出
- **验证**：对生产数据试导出，统计样本量 / 对话轮数分布 / token 分布

### Phase 4（可选，长期）：request_logs 按月分区（schema 迁移，~4h）

- **问题**：历史清理需 `DELETE`（慢、产生死元组），保留期策略不优雅
- **改动**：`request_logs` 按 `created_at` RANGE 分区（每月），历史区可 `DROP PARTITION` 直接回收；`request_attempts` 按 `request_log_id` 首月前缀跟随分区
- **结果**：存储总量不变（全文保留），但保留期管理 O(1)；查询走分区裁剪
- **验证**：迁移后在分区边界写入/查询测试 + 生产迁移演练

## 工作量汇总（AI Coding Agent 基准）

| 阶段            | 内容                        | 预估                    |
| --------------- | --------------------------- | ----------------------- |
| Phase 1         | intentTrace 截断            | ~1h                     |
| Phase 2         | 同协议不写 transformed body | ~2h                     |
| Phase 3         | 语料导出脚本                | ~2h                     |
| Phase 4（可选） | 按月分区                    | ~4h                     |
| **合计**        |                             | **~5h（不含 Phase 4）** |

## 结论

- 先做 **Phase 1 + 2**：纯代码、无 schema 变更、止住新增膨胀（当前写入量 90%+ 是重复）
- **Phase 3** 随训练需求启用，语料不入库，消除日志 ↔ 语料冗余
- **Phase 4** 仅在数据规模增长到需要优雅清理时再做（当前 46k 行规模不需要）
- 存量 17 GB 逻辑数据已写入，若要回收物理空间需额外数据清理任务（截断既有巨行 / 归档），不影响本方案

## 不做的事

- ❌ 不截断 `request_body` / `response_body`（保全文约束）
- ❌ 不引入 MinIO / 对象存储
- ❌ 不把语料落库（导出时生成）
- ❌ 不删 `conversation_id` 等关联字段（消息分析 / 语料聚合依赖）
