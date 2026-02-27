# 请求中断问题分析报告

## 问题概述

用户报告 LLM Gateway 中存在请求意外中断的情况：

- 请求 ID `da684410-0dba-4791-adf3-0705963f726b` 一直处于 `pending` 状态
- 疑似连接已断开，但状态未正确更新
- 客户端重试后发起第二个请求 ID `8b510c77-2b78-41b1-adfa-744e82696fa2`

## 数据库调查结果

### 两个请求对比

| 字段                      | 第一个请求 (da684410...) | 第二个请求 (8b510c77...) |
| ------------------------- | ------------------------ | ------------------------ |
| status                    | `pending`                | `success`                |
| stream_status             | `pending`                | `completed`              |
| is_complete               | `false`                  | `true`                   |
| latency_ms                | `0`                      | `3882`                   |
| streaming                 | `false`                  | `true`                   |
| provider_response_headers | NULL                     | 有数据                   |
| provider_response_body    | NULL                     | 有数据                   |
| created_at                | 2026-02-27 01:30:04      | 2026-02-27 01:30:05      |
| 时间间隔                  | 已超过 660 秒            | 正常完成 (3.8s)          |

### 关键发现

1. **第一个请求没有收到任何 Provider 响应**
   - `provider_response_headers` = NULL
   - `provider_response_body` = NULL
   - 说明 `fetch` 请求从未成功返回

2. **streaming 字段不一致**
   - 请求体中 `stream: true`
   - 数据库中 `streaming = 'false'`
   - 这是因为路由层硬编码了 `isStreaming: false`

3. **请求已超过 11 分钟仍未完成**
   - 创建时间：01:30:04
   - 当前状态：pending，无任何错误信息

## 根本原因分析

### 原因 1: 路由层硬编码 isStreaming 参数

**位置**: `apps/web/src/features/gateway/api.ts`

```typescript
// 第 24 行
gatewayRoutes.post("/chat/completions", async (c) => {
  return handleChatCompletion(c, false); // 硬编码 false
});

// 第 30-31 行
gatewayRoutes.post("/messages", async (c) => {
  return handleChatCompletion(c, false); // 硬编码 false
});
```

**影响**:

- 日志记录时 `streaming` 字段总是 `false`
- 导致非流式请求的清理逻辑不匹配

### 原因 2: fetch 请求缺少超时控制

**位置**: `apps/web/src/features/gateway/services/chat-completion-handler.ts:305-309`

```typescript
const response = await fetch(targetUrl, {
  method: "POST",
  headers: providerRequestHeaders,
  body: requestBody,
  // ⚠️ 缺少 signal/timeout 配置
});
```

**影响**:

- 如果 Provider 响应缓慢或卡住，请求会无限期等待
- 没有任何机制可以中断长时间运行的请求

### 原因 3: 日志更新可能被跳过

**位置**: `apps/web/src/features/gateway/services/log-service.ts`

```typescript
// logRequestStart 失败时返回临时 ID
if (error) {
  return "temp-" + Date.now(); // 第 384-386 行
}

// logRequest 检查临时 ID
if (logId.startsWith("temp-")) return; // 第 400, 450 行
```

**影响**:

- 如果初始日志创建失败，后续更新都会被静默跳过
- 请求状态永远不会被更新

### 原因 4: 流式请求清理逻辑不覆盖非流式请求

**位置**: `apps/web/src/features/gateway/services/stream-cleanup.ts:27-31`

```typescript
.where(
  and(
    eq(requestLogs.isComplete, false),
    eq(requestLogs.streamStatus, 'streaming'),  // 只清理 streaming 状态
    lt(requestLogs.lastUpdatedAt, cutoffTime)
  )
)
```

**影响**:

- 清理任务只处理 `streamStatus = 'streaming'` 的记录
- 非流式请求（`streamStatus = 'pending'`）不会被清理

## 问题复现场景

```
时间线:
01:30:04.791 - 第一个请求创建 (logRequestStart)
01:30:04.815 - stream_started_at 设置
01:30:04.xxx - fetch 请求发送到 Provider
              ↓
          [Provider 响应缓慢或连接问题]
              ↓
          [请求卡住，无超时]
              ↓
01:30:05.826 - 客户端重试，第二个请求创建
01:30:08.678 - 第二个请求成功完成
              ↓
          [第一个请求仍卡在 pending]
```

## 解决方案

### 立即修复 (高优先级)

1. **添加 fetch 超时控制**

   ```typescript
   const controller = new AbortController();
   const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 分钟

   try {
     const response = await fetch(targetUrl, {
       method: "POST",
       headers: providerRequestHeaders,
       body: requestBody,
       signal: controller.signal,
     });
   } finally {
     clearTimeout(timeoutId);
   }
   ```

2. **修复路由层 isStreaming 参数**

   ```typescript
   // 从请求体中读取 stream 字段
   gatewayRoutes.post("/chat/completions", async (c) => {
     const body = await c.req.json().catch(() => ({}));
     const isStreaming = body.stream === true;
     return handleChatCompletion(c, isStreaming);
   });
   ```

3. **扩展清理任务覆盖范围**
   ```typescript
   .where(
     and(
       eq(requestLogs.isComplete, false),
       or(
         eq(requestLogs.streamStatus, 'streaming'),
         eq(requestLogs.streamStatus, 'pending')
       ),
       lt(requestLogs.lastUpdatedAt, cutoffTime)
     )
   )
   ```

### 增强改进 (中优先级)

1. **添加请求心跳检测**
   - 在流式传输期间定期检查客户端连接状态
   - 使用 `request.signal.aborted` 检测

2. **改进日志创建错误处理**
   - 初始日志创建失败时抛出错误，而非返回临时 ID
   - 或使用重试机制

3. **添加监控告警**
   - 监控 `pending` 状态超过阈值的请求数
   - 自动触发清理或告警

## 验证步骤

1. 检查 Cron 清理任务是否正常运行

   ```bash
   curl http://localhost:3000/api/cron/cleanup-streams
   ```

2. 手动清理当前卡住的请求

   ```sql
   UPDATE request_logs
   SET status = 'failure',
       stream_status = 'failed',
       is_complete = true,
       error_message = 'Request timeout - manually cleaned up',
       error_type = 'manual_cleanup',
       last_updated_at = NOW()
   WHERE id = 'da684410-0dba-4791-adf3-0705963f726b';
   ```

3. 监控后续请求是否正常完成

## 相关文件

- `apps/web/src/features/gateway/api.ts` - 路由定义
- `apps/web/src/features/gateway/services/chat-completion-handler.ts` - 请求处理
- `apps/web/src/features/gateway/services/response-handlers.ts` - 响应处理
- `apps/web/src/features/gateway/services/log-service.ts` - 日志服务
- `apps/web/src/features/gateway/services/stream-cleanup.ts` - 流清理
- `apps/web/src/features/gateway/services/error-handler.ts` - 错误处理
- `apps/web/src/features/logs/db.ts` - 数据库 Schema
