# Client Disconnect 日志修复计划

> 基于 2026-10-12 生产环境分析（生产库 `x_llm_gateway` + 生产容器日志）制定。
> 背景：omp/pi agent 在解析到终末 SSE chunk（finish_reason/usage）后立即主动断开连接，
> 属客户端固有行为，非网关故障。9/28–10/10 高峰期 35–57% 请求以 client_disconnect 收尾，
> 97–100% 内容已完整送达。
> **状态（2026-10-12）**：Phase 1 + Phase 2 + Phase 3 已实现（TASK-921~927，US-334）。
> Phase 3 采用保守方案：完整后挂断保持 `cancelled` 口径（不动成功率/计费对账），
> 通过 `metadata.routing.disconnectKind`（complete_then_hangup / mid_stream_cancel）
> 与差异化 errorMessage + UI 徽标区分，供后续按需过滤降噪。
> 本计划处理遗留的分类不一致、数据缺失与写竞态。只覆盖网关侧可修项；
> 客户端侧治本方案（omp 等到 `[DONE]` 再关连接）不在本仓库范围。

## 原则

1. 按 误导性 × 触发频率 排序：先修会产生错误 500/失败率统计的，再修展示缺失
2. 所有修复在当前 handler 架构内完成，不重构
3. 每项独立可交付、可验证（bun:test 目标文件 + 生产抽样 SQL 对照）
4. 工作量按 AI Coding Agent 基准估算

---

## Phase 1：错误分类修复（~2h）

### 1.1 Responses API TTFB 阶段断开被记为 500 internal_error failure

- **问题**：`apps/gateway/src/gateway/handlers/openai/responses-handler.ts:373-397`，
  `executeWithRetry` 返回 `aborted === 'client_disconnect'` 时走 `handleGatewayError`
  fallback 分支（`error-handler.ts:231-255`）→ 写入 `status=failure, status_code=500,
error_type=internal_error`。客户端已断开，根本没收到这个 500；同时污染失败率。
  chat-completion / anthropic / embedding / jev 四个 handler 均已正确走
  `markStreamAborted(..., {forceCancelled: true})`，唯独 responses-handler 漏修（`b0c4d80` 未覆盖）。
- **连带缺陷**（同一路径）：
  - attempt 永远卡 `pending`（`handleGatewayError` 不传 attemptId、不收尾 attempt）
  - `stream_status='completed'` 与 `status='failure'` 矛盾（见 1.3）
  - `response_body` 为空但显示 500 错误详情，误导排查方向
- **实证**：request `f810718b-5199-4ff4-96e9-fa0294c303e1`（2026-10-12 02:31，
  `/api/v1/responses`，15s TTFB 阶段断开，attempt d7f59016 卡 pending，
  stream_status=completed，status_code=500）。近 30 天该模式 2 条。
- **改动**：responses-handler abort 分支镜像 `messages-handler.ts:237-255`：
  `client_disconnect` → `markStreamAborted(logId, attemptId, false, {forceCancelled: true})`
  - `logEventBus.emitLog({event:'aborted',...})`，返回 499 语义响应；
    仅 `timeout` 保留 handleGatewayError。
- **验证**：`cd apps/gateway && bun test src/gateway/handlers/openai/responses-handler.test.ts`；
  生产抽样：`SELECT count(*) FROM request_logs WHERE request_path='/api/v1/responses'
AND error_type='internal_error' AND error_message LIKE 'Client disconnected%'` 应归零（新记录）。

### 1.2 Responses cancel() 路径写竞态：cancelled 被覆盖回 failure/provider_error

- **问题**：`responses-handler.ts:587-596`（monitorTransformer.cancel）：
  `finalize('failure', 499)` 内部 `void logRequest({...})`（未 await，写
  failure/499/provider_error），紧接着 `void markStreamAborted(logId, attemptId, true)`
  （写 cancelled）。两次异步写无顺序保证，logRequest 后完成时 failure 覆盖 cancelled。
- **实证**：近 7 天 `/api/v1/responses` 有 66 条
  `status=failure, error_type=provider_error, status_code=499,
error_message='Client disconnected after receiving data'`（全部 stream_status=completed）。
- **改动**：cancel() 中不调用 `finalize`；直接 await `markStreamAborted(logId, attemptId,
collector 已收 chunk 与否, {forceCancelled 视数据而定})`，usage 由 markStreamAborted
  之前的 finalize 语义合并。参考 chat 路径 `streaming.ts:375-406` 的
  `isLogFinalized` 守卫模式。
- **验证**：`bun test src/gateway/handlers/openai/responses-handler.test.ts`；
  生产抽样上述 66 条模式不再新增。

### 1.3 logRequest 硬编码 streamStatus: 'completed'

- **问题**：`apps/gateway/src/gateway/services/log-service.ts:245/293`，
  任何 streaming 请求（含 failure/aborted）一律写 `stream_status='completed'`，
  与 `status='failure'`、`stream_status` 三值语义（completed/aborted/failed）矛盾。
- **改动**：logRequest 接受可选 `streamStatus` 参数，默认按 status 推导
  （success→completed，failure→failed）；abort 路径由 markStreamAborted 显式写 aborted。
- **验证**：`bun test src/gateway/services/log-stream-abort.test.ts`；
  生产抽样 failure 记录不再出现 stream_status=completed。

### 1.4 abort 收尾先 failure 后 cancelled 的状态闪现

- **问题**：`apps/gateway/src/gateway/services/response-handlers/streaming.ts:400-401`，
  chat 路径 abort 时先 `finalizeLog('failure')` 再 `markStreamAborted(...)` 覆盖为
  cancelled。两次落库之间实时订阅者（log-event-bus 消费方）会看到 failure。
- **改动**：abort 分支跳过 `finalizeLog('failure')`，直接走 markStreamAborted（保留
  `isLogFinalized` 竞态守卫）。
- **验证**：`bun test src/gateway/services/log-stream-abort.test.ts` 新增用例：
  abort 后 status 只出现一次且为 cancelled。

---

## Phase 2：实际模型展示修复（~2h）

### 2.1 Responses 路径不写 responseModelName（95% 缺失）

- **问题**：`responses-handler.ts:516-553` 的 `finalize` 调用 logRequest 时未传
  `responseModelName`，尽管 `StreamResponseCollector`（509-513 行注释自述）已采集
  provider 模型名。`log-query.ts:70` 从 `metadata.routing.responseModelName` 读取，
  UI（`packages/ui/src/features/logs/components/log-table-row.tsx:99-104`）依赖它显示
  「实际」模型。
- **实证**：近 7 天 `/api/v1/responses` 流式日志 1183/1248（95%）缺
  responseModelName；chat 路径仅 4.3%（正常为无上游响应的 abort 场景）。
  案例 f810718b：model_name=original_model_name='Architect'（接入模型），实际转发
  glm-5.3（model_instances b7458a64，仅存在于 attempt diff），列表与详情均不可见。
- **改动**：finalize 传 `responseModelName: collector.getProviderModel()`。
- **验证**：`bun test src/gateway/handlers/openai/responses-handler.test.ts`；
  生产上线后抽样 responses 新日志 responseModelName 缺失率应降至 chat 路径水平。

### 2.2 无上游响应时的实际模型回退

- **问题**：TTFB 阶段断开（如 f810718b）永远没有 provider 响应，responseModelName
  无从采集；但路由决策时 instance 的 `actual_model_name` 已知（attempt 的
  transformed_request_diff 已含 `/model` 替换），只是未落到 request_logs 可查询字段。
- **改动**：logRequest/logStartAsync 接受 `routedModelName`（instance actual_model_name），
  写入 `metadata.routing.routedModelName`；responseModelName 缺失时 UI 回退显示
  routedModelName。handleGatewayError fallback 分支同步补传（当前连 originalModelName、
  providerName 都不传，见 `error-handler.ts:232-253`）。
- **验证**：`bun test src/gateway/services/error-handler.test.ts`；
  UI 抽查 log-table-row 在两者任一存在时显示实际模型。

---

## Phase 3：降噪与语义细分（可选，~3h）

> 仅在前两阶段交付、生产数据验证后评估是否需要。

### 3.1 完整后挂断 ≠ 中途取消

- **现状**：两者都落 `hadPartialData=true` → cancelled。判定依据已在手上：
  `stream_content` 尾部是否含 finish_reason。97%+ 的 client_disconnect 是
  「完整后挂断」（内容含 finish_reason + usage），属 agent 固有行为。
- **方案**：markStreamAborted 增加终止信号判定（collector 是否已见 finish_reason /
  usage 终末事件），完整后挂断改记 success 语义或独立状态，日志页默认过滤。
- **取舍**：改记 success 会影响成功率口径与计费对账（output_tokens 已入账但状态变成功），
  需与运营口径确认后再定；独立状态（如 completed_client_abort）改动面最小但需
  shared/ui 同步加枚举。

### 3.2 客户端侧治本（跨仓库）

omp/pi agent（x-herald-agent-extensions / pi）收到终末事件后继续读完 `[DONE]` 再关连接，
每轮多几毫秒尾延迟，可将 97% 的伪断开事件消为 0。网关侧 Phase 1-2 已能保证这些事件
不污染统计，此项降为体验优化。

---

## 明确不做

- 不改 omp 客户端断开行为为网关侧阻塞等待（违背透明代理第一原则）
- 不清理历史脏数据（66 条 provider_error 漂移记录、95% 缺失 responseModelName 的历史行）；
  log-cleanup 按保留期自然淘汰，如需清洗另行评估
- 不新增告警规则（Phase 1 交付后 cancelled/failure 口径已正确，现有告警不再误报）
