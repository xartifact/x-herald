# Provider 错误消息规范化 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `handleProviderError` 中新增错误消息规范化，将 Provider 返回的技术性原始错误转为可读描述，并添加 `code` 字段。

**Architecture:** 在现有 `error-handler.ts` 中新增一个纯函数 `normalizeProviderErrorMessage()`，通过正则 pattern-match 已知错误类型，仅改变响应给客户端的消息内容；DB 日志保留原始消息用于调试。

**Tech Stack:** TypeScript, Bun test (`bun:test`)

---

### Task 1: 写失败测试

**Files:**
- Create: `apps/web/src/features/gateway/services/__tests__/error-normalizer.test.ts`

**Step 1: 新建测试文件**

```typescript
import { describe, it, expect } from 'bun:test';
import { normalizeProviderErrorMessage } from '../error-handler';

describe('normalizeProviderErrorMessage', () => {
  describe('消息体超 Provider 限制', () => {
    it('应解析字节数并转换为 MB', () => {
      const raw = 'total message size 10852702 exceeds limit 2097152';
      const result = normalizeProviderErrorMessage(raw);
      expect(result.code).toBe('context_length_exceeded');
      expect(result.message).toContain('10.3 MB');
      expect(result.message).toContain('2.0 MB');
    });

    it('应处理不同大小的字节数', () => {
      const raw = 'total message size 5461790 exceeds limit 2097152';
      const result = normalizeProviderErrorMessage(raw);
      expect(result.code).toBe('context_length_exceeded');
      expect(result.message).toContain('5.2 MB');
    });
  });

  describe('Provider 服务连接失败', () => {
    it('应识别 Cannot connect to host 错误', () => {
      const raw = '聊天请求失败: Cannot connect to host 10.86.0.141:8131 ssl:default [Connect call failed]';
      const result = normalizeProviderErrorMessage(raw);
      expect(result.code).toBe('provider_service_unavailable');
      expect(result.message).toContain('unavailable');
    });
  });

  describe('请求体超网关限制', () => {
    it('应解析限制大小并转换为 MB', () => {
      const raw = 'Exceeded limit on max bytes to request body : 6291456';
      const result = normalizeProviderErrorMessage(raw);
      expect(result.code).toBe('request_too_large');
      expect(result.message).toContain('6.0 MB');
    });
  });

  describe('Tool call 格式错误', () => {
    it('应识别 tool_call 格式错误', () => {
      const raw = "an assistant message with 'tool_calls' must be followed by tool messages responding to each 'tool_call_id'. The following tool_call_ids did not have response messages: Skill:13";
      const result = normalizeProviderErrorMessage(raw);
      expect(result.code).toBe('invalid_tool_call_format');
      expect(result.message).toContain('tool_call');
    });
  });

  describe('未识别错误（兜底）', () => {
    it('应返回原始消息和通用 code', () => {
      const raw = 'Some unknown provider error message';
      const result = normalizeProviderErrorMessage(raw);
      expect(result.code).toBe('provider_error');
      expect(result.message).toBe(raw);
    });

    it('应处理空字符串', () => {
      const result = normalizeProviderErrorMessage('');
      expect(result.code).toBe('provider_error');
      expect(result.message).toBe('');
    });
  });
});
```

**Step 2: 运行测试确认失败**

```bash
cd /home/binzhan/Workspaces/GitHub/zbin/x-llm-gateway/apps/web
bun test src/features/gateway/services/__tests__/error-normalizer.test.ts
```

期望输出：`error: Export 'normalizeProviderErrorMessage' is not defined`（函数未导出）

---

### Task 2: 实现 normalizeProviderErrorMessage

**Files:**
- Modify: `apps/web/src/features/gateway/services/error-handler.ts`

**Step 1: 在文件顶部（第 1 行之前的 import 后）添加辅助函数**

在 `error-handler.ts` 第 11 行（`interface ErrorHandlerParams` 之前）插入以下代码：

```typescript
/**
 * 将字节数转为带一位小数的 MB 字符串
 */
function bytesToMB(bytes: number): string {
  return (Math.round(bytes / 1024 / 1024 * 10) / 10).toFixed(1);
}

/**
 * 规范化 Provider 错误消息
 * 将技术性原始错误转为用户可读描述，并返回结构化 code
 */
export function normalizeProviderErrorMessage(rawMessage: string): {
  message: string;
  code: string;
} {
  // 1. 消息体超 Provider 限制
  // 例：total message size 10852702 exceeds limit 2097152
  const sizeMatch = rawMessage.match(/total message size (\d+) exceeds limit (\d+)/i);
  if (sizeMatch) {
    const actualMB = bytesToMB(parseInt(sizeMatch[1], 10));
    const limitMB = bytesToMB(parseInt(sizeMatch[2], 10));
    return {
      code: 'context_length_exceeded',
      message: `Message content too large (~${actualMB} MB). Model limit is ${limitMB} MB. Please reduce conversation history.`,
    };
  }

  // 2. Provider 服务连接失败
  // 例：Cannot connect to host 10.86.0.141:8131 ssl:default [Connect call failed]
  if (/Cannot connect to host|Connect call failed/i.test(rawMessage)) {
    return {
      code: 'provider_service_unavailable',
      message: 'Provider service is temporarily unavailable. Please try again later.',
    };
  }

  // 3. 请求体超网关大小限制
  // 例：Exceeded limit on max bytes to request body : 6291456
  const bodyLimitMatch = rawMessage.match(/Exceeded limit on max bytes to request body\s*:\s*(\d+)/i);
  if (bodyLimitMatch) {
    const limitMB = bytesToMB(parseInt(bodyLimitMatch[1], 10));
    return {
      code: 'request_too_large',
      message: `Request body too large (~${limitMB} MB). Please reduce request size.`,
    };
  }

  // 4. Tool call 格式错误
  // 例：an assistant message with 'tool_calls' must be followed by tool messages...
  if (/an assistant message with 'tool_calls' must be followed by tool messages/i.test(rawMessage)) {
    // 提取 tool_call_ids 列表（冒号后的内容）
    const idsMatch = rawMessage.match(/tool_call_ids did not have response messages:\s*(.+)$/i);
    const idsPart = idsMatch ? ` Missing IDs: ${idsMatch[1].trim()}.` : '';
    return {
      code: 'invalid_tool_call_format',
      message: `Invalid message format: tool_call responses are missing.${idsPart}`,
    };
  }

  // 5. 兜底：未识别错误，保留原始消息
  return {
    code: 'provider_error',
    message: rawMessage,
  };
}
```

**Step 2: 运行测试确认通过**

```bash
cd /home/binzhan/Workspaces/GitHub/zbin/x-llm-gateway/apps/web
bun test src/features/gateway/services/__tests__/error-normalizer.test.ts
```

期望输出：所有测试 PASS

**Step 3: Commit**

```bash
cd /home/binzhan/Workspaces/GitHub/zbin/x-llm-gateway
git add apps/web/src/features/gateway/services/error-handler.ts
git add apps/web/src/features/gateway/services/__tests__/error-normalizer.test.ts
git commit -m "feat: 新增 Provider 错误消息规范化函数"
```

---

### Task 3: 在 handleProviderError 中使用规范化函数

**Files:**
- Modify: `apps/web/src/features/gateway/services/error-handler.ts`（第 235-245 行）

**Step 1: 定位 handleProviderError 中构建响应的代码段**

找到 `error-handler.ts` 第 193 行：
```typescript
const errorData = await parseProviderError(response);
```

和第 224 行（errorMessage 的赋值）：
```typescript
errorMessage: errorData.error?.message || 'Provider request failed',
```

以及第 235-244 行（return 语句）：
```typescript
  return c.json(
    {
      error: {
        type: 'provider_error',
        message: errorData.error?.message || 'Provider request failed',
        provider: provider.name,
      },
    },
    response.status as 400 | 401 | 403 | 429 | 500,
  );
```

**Step 2: 修改 handleProviderError 函数**

在 `const errorData = await parseProviderError(response);` 之后，`const latencyMs` 之前，添加：

```typescript
  const rawErrorMessage = errorData.error?.message || 'Provider request failed';
  const normalized = normalizeProviderErrorMessage(rawErrorMessage);
```

然后修改 `logRequest` 调用中的 `errorMessage`：
```typescript
    // 将这行：
    errorMessage: errorData.error?.message || 'Provider request failed',
    // 改为（DB 保留原始消息用于调试）：
    errorMessage: rawErrorMessage,
```

最后修改 return 语句：
```typescript
  return c.json(
    {
      error: {
        type: 'provider_error',
        code: normalized.code,
        message: normalized.message,
        provider: provider.name,
      },
    },
    response.status as 400 | 401 | 403 | 429 | 500,
  );
```

**Step 3: 类型检查**

```bash
cd /home/binzhan/Workspaces/GitHub/zbin/x-llm-gateway
bun run typecheck
```

期望输出：无错误

**Step 4: 再次运行所有测试**

```bash
cd /home/binzhan/Workspaces/GitHub/zbin/x-llm-gateway/apps/web
bun test src/features/gateway/services/__tests__/
```

期望输出：所有测试 PASS

**Step 5: Commit**

```bash
cd /home/binzhan/Workspaces/GitHub/zbin/x-llm-gateway
git add apps/web/src/features/gateway/services/error-handler.ts
git commit -m "feat: handleProviderError 使用规范化错误消息响应客户端"
```

---

### Task 4: 验证效果

**Step 1: 用数据库中的真实错误消息做回归验证**

在测试文件末尾补充以下真实数据测试（来自日志）：

```typescript
describe('真实错误消息回归测试', () => {
  const realErrors = [
    {
      raw: 'total message size 10852702 exceeds limit 2097152',
      expectedCode: 'context_length_exceeded',
    },
    {
      raw: 'total message size 8135482 exceeds limit 2097152',
      expectedCode: 'context_length_exceeded',
    },
    {
      raw: '{"code":500,"message":"聊天请求失败: Cannot connect to host 10.86.0.141:8131 ssl:default [Connect call failed (\'10.86.0.141\', 8131)]","data":{}}',
      expectedCode: 'provider_service_unavailable',
    },
    {
      raw: 'Exceeded limit on max bytes to request body : 6291456',
      expectedCode: 'request_too_large',
    },
    {
      raw: "an assistant message with 'tool_calls' must be followed by tool messages responding to each 'tool_call_id'. The following tool_call_ids did not have response messages: Skill:13",
      expectedCode: 'invalid_tool_call_format',
    },
    {
      raw: 'Provider request failed',
      expectedCode: 'provider_error',
    },
  ];

  for (const { raw, expectedCode } of realErrors) {
    it(`应正确处理: "${raw.slice(0, 50)}..."`, () => {
      const result = normalizeProviderErrorMessage(raw);
      expect(result.code).toBe(expectedCode);
      expect(result.message.length).toBeGreaterThan(0);
    });
  }
});
```

**Step 2: 运行全量测试**

```bash
cd /home/binzhan/Workspaces/GitHub/zbin/x-llm-gateway/apps/web
bun test src/features/gateway/services/__tests__/error-normalizer.test.ts
```

期望：所有测试 PASS，包括真实数据回归

**Step 3: Commit**

```bash
cd /home/binzhan/Workspaces/GitHub/zbin/x-llm-gateway
git add apps/web/src/features/gateway/services/__tests__/error-normalizer.test.ts
git commit -m "test: 添加真实错误数据回归测试"
```

---

### 完成标准

- [ ] `normalizeProviderErrorMessage` 已导出，所有单元测试通过
- [ ] `handleProviderError` 响应中包含 `code` 字段
- [ ] DB `error_message` 字段仍存储 Provider 原始消息
- [ ] `bun run typecheck` 无类型错误
- [ ] 所有回归测试（基于真实日志）通过
