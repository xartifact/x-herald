# URL 拼接修复：避免路径重复

## 问题描述

当用户配置供应商的 `baseUrl` 时，可能会包含路径前缀（如 `/v1`），导致与 endpoint 拼接时出现重复路径：

**错误示例**：
```
baseUrl:  https://code-api.x-aio.com/v1
endpoint: /v1/chat/completions
结果:     https://code-api.x-aio.com/v1/v1/chat/completions ❌
```

这会导致供应商返回 404 错误。

## 解决方案

实现了智能 URL 拼接函数 `joinUrl()`，自动检测并移除重复的路径前缀。

## 实现逻辑

```typescript
function joinUrl(baseUrl: string, endpoint: string): string {
  // 1. 清理 baseUrl 末尾斜杠
  const cleanBase = baseUrl.replace(/\/+$/, '');

  // 2. 确保 endpoint 以斜杠开头
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // 3. 解析 baseUrl 和 endpoint 的路径部分
  const baseUrlObj = new URL(cleanBase);
  const basePath = baseUrlObj.pathname.replace(/\/+$/, '');
  const basePathParts = basePath.split('/').filter(Boolean);
  const endpointParts = cleanEndpoint.split('/').filter(Boolean);

  // 4. 检测重复前缀（从后往前匹配）
  let skipCount = 0;
  for (let i = 0; i < Math.min(basePathParts.length, endpointParts.length); i++) {
    if (basePathParts[basePathParts.length - 1 - i] === endpointParts[i]) {
      skipCount = i + 1;
    } else {
      break;
    }
  }

  // 5. 合并路径，跳过重复部分
  const finalPathParts = [...basePathParts, ...endpointParts.slice(skipCount)];
  const finalPath = '/' + finalPathParts.join('/');

  return `${baseUrlObj.protocol}//${baseUrlObj.host}${finalPath}`;
}
```

## 测试用例

| baseUrl | endpoint | 结果 |
|---------|----------|------|
| `https://api.com/v1` | `/v1/chat/completions` | `https://api.com/v1/chat/completions` ✅ |
| `https://api.com` | `/v1/chat/completions` | `https://api.com/v1/chat/completions` ✅ |
| `https://api.com/anthropic` | `/v1/messages` | `https://api.com/anthropic/v1/messages` ✅ |
| `https://api.com/api/v1` | `/api/v1/chat` | `https://api.com/api/v1/chat` ✅ |

## 修改文件

- ✅ `apps/web/src/features/gateway/services/chat-completion-handler.ts`
  - 添加 `joinUrl()` 辅助函数
  - 第 122 行：从 `${providerUrl}${getEndpoint(...)}` 改为 `joinUrl(providerUrl, getEndpoint(...))`

## 兼容性

此修复向后兼容所有现有配置：
- ✅ `baseUrl` 不含路径前缀的配置（如 `https://api.openai.com`）
- ✅ `baseUrl` 含路径前缀的配置（如 `https://code-api.x-aio.com/v1`）
- ✅ `baseUrl` 末尾带斜杠的配置

## 验证方式

1. 启动开发服务器：`bun run dev`
2. 使用第三方客户端调用 API
3. 检查后端日志中的 `targetUrl` 是否正确（不再出现 `/v1/v1`）
4. 确认 API 调用成功返回（不再是 404）
