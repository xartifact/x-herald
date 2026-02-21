# Provider 错误消息规范化设计

## 背景

通过查询 `request_logs` 数据库，发现 221 条请求中有 36 条失败（失败率 16.3%）。
其中 22 条为消息体超限错误，Provider 返回的原始错误消息对客户端不友好：

```
total message size 10852702 exceeds limit 2097152
```

**目标**：在透传 Provider 错误行为不变的前提下，规范化错误消息，提升可读性并添加 `code` 字段方便客户端机器处理。

## 已识别的错误类型（基于真实日志）

| 错误类型 | 数量 | HTTP 状态码 |
|---------|------|------------|
| 消息体超 Provider 限制 | 22 | 400 |
| Provider 内部服务连接失败 | 5 | 500 |
| 请求体超网关限制 | 1 | 400 |
| Tool call 格式错误 | 1 | 400 |
| Provider 超时 (524) | 1 | 524 |
| 通用 Provider 错误 | 3 | 500 |

## 设计方案

### 改动范围

**仅修改** `apps/web/src/features/gateway/services/error-handler.ts`

### 新增函数

```typescript
function normalizeProviderErrorMessage(rawMessage: string): {
  message: string;
  code: string;
}
```

纯函数，无副作用，按优先级依次 pattern-match。

### 错误模式映射规则

#### 1. 消息体超 Provider 限制
- **Pattern**: `/total message size (\d+) exceeds limit (\d+)/i`
- **Code**: `context_length_exceeded`
- **Message**: `Message content too large (~{X} MB). Model limit is {Y} MB. Please reduce conversation history.`
- **实现**: 将 bytes 转换为 MB（保留 1 位小数）

#### 2. Provider 服务连接失败
- **Pattern**: `/Cannot connect to host|Connect call failed/i`
- **Code**: `provider_service_unavailable`
- **Message**: `Provider service is temporarily unavailable. Please try again later.`

#### 3. 请求体超网关限制
- **Pattern**: `/Exceeded limit on max bytes to request body\s*:\s*(\d+)/i`
- **Code**: `request_too_large`
- **Message**: `Request body too large (~{X} MB). Please reduce request size.`

#### 4. Tool call 格式错误
- **Pattern**: `/an assistant message with 'tool_calls' must be followed by tool messages/i`
- **Code**: `invalid_tool_call_format`
- **Message**: `Invalid message format: tool_call responses are missing. {original_detail}`

#### 5. 兜底（未识别错误）
- **Code**: `provider_error`
- **Message**: 保留原始消息

### 响应格式变化

**改动前：**
```json
{
  "error": {
    "type": "provider_error",
    "message": "total message size 10852702 exceeds limit 2097152",
    "provider": "X-AIO"
  }
}
```

**改动后：**
```json
{
  "error": {
    "type": "provider_error",
    "code": "context_length_exceeded",
    "message": "Message content too large (~10.3 MB). Model limit is 2.0 MB. Please reduce conversation history.",
    "provider": "X-AIO"
  }
}
```

### 日志策略

| 位置 | 内容 |
|------|------|
| DB `error_message` 字段 | 保留 Provider 原始消息（便于调试） |
| 客户端响应 `error.message` | 使用规范化后的消息 |
| 客户端响应 `error.code` | 新增结构化错误码 |

## 兼容性

- 响应 JSON 结构不变，仅新增 `code` 字段 + 优化 `message` 文本
- 不影响 HTTP 状态码（继续透传 Provider 的状态码）
- 不影响日志存储（DB 保留原始消息）
