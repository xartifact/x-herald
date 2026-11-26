# 客户端接入实录（逐条实测）

所有行都是在 2026-11-26 对 `https://x-herald.ts.xartifact.dev` 实跑通过的配置，含 debug 日志里实际命中的 URL。
**base URL 口径各不相同，照抄，不要类推。**

## 通用前提

```bash
export XH=https://x-herald.ts.xartifact.dev
export XK=xg_...        # 虚拟密钥，形如 xg_ + 64 hex
```

- 生成的密钥前缀是 `xg_`（`apps/gateway/src/features/keys/service.ts` → `xg_${randomBytes(32).hex}`）。`sk-` 前缀是历史写法，服务端只做字符串比对，前缀本身无意义，但不要假设是 `sk-`。
- Linux/mac 上的 `~/.config/x-herald/config.json`（0600）只存**管理员 JWT**，不是虚拟密钥。
- 端口：生产 `443`（域名）；docker 宿主 `5005 → 容器 3000`；`bun run dev` = `43173`。

## Claude Code

`~/.claude/settings.json`：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://x-herald.ts.xartifact.dev/api",
    "ANTHROPIC_API_KEY": "xg_...",
    "ANTHROPIC_MODEL": "Agent",
    "ANTHROPIC_SMALL_FAST_MODEL": "Explorer"
  }
}
```

- base URL 到 **`/api`** 为止：Anthropic SDK 自己拼 `/v1/messages` → `…/api/v1/messages`。写到 `/api/v1` 会打 `/api/v1/v1/messages`，落 SPA 返回 HTML。
- 模型名不必是 `claude-*`：网关接受任意接入模型名。写 `claude-sonnet-4-5` 也能跑（catchall 兜底），**但会静默路由到默认组的模型**（实测落到 `deepseek-flash`），所以显式写真实 id。
- 实测：带 Claude Code 的 `anthropic-beta: claude-code-…,interleaved-thinking-…` 与 `cache_control` 的流式请求 → 200，事件序列完整（`message_start` → `content_block_delta`(thinking/text) → `message_delta` → `message_stop`）。

## Codex CLI（0.172.0）

`~/.codex/config.toml`：

```toml
model_provider = "xherald"
model = "Agent"
model_reasoning_effort = "medium"
model_context_window = 1048576        # 消除 "Model metadata not found" 警告

[model_providers.xherald]
name = "x-herald"
base_url = "https://x-herald.ts.xartifact.dev/api/v1"
env_key = "X_HERALD_API_KEY"          # 指向环境变量名，不是密钥本身
wire_api = "responses"
```

```bash
export X_HERALD_API_KEY=xg_...
codex exec 'Reply with exactly: OK'
```

- `wire_api = "chat"` 在 0.172 **已移除**，只有 `"responses"`（二进制里带明确报错串）。网关 `/api/v1/responses` 原生支持。
- `env_key` 是变量名；想直接写密钥用 `experimental_bearer_token`（非必要不用）。
- 单次覆盖不落盘：`codex exec -c model_providers.xherald={...} -c model_provider=xherald -c model=Agent …`，实测可用。
- `model_context_window` 可省，只是压掉警告。

## Grok CLI（1.0.92）

`~/.grok/config.toml`，二选一。

OpenAI Chat 后端：

```toml
[model.herald-agent]
model = "Agent"
base_url = "https://x-herald.ts.xartifact.dev/api/v1"
name = "Herald Agent"
env_key = "X_HERALD_API_KEY"
api_backend = "chat_completions"
context_window = 1048576
max_completion_tokens = 8192
```

Anthropic Messages 后端：

```toml
[model.herald-claude]
model = "Agent"
base_url = "https://x-herald.ts.xartifact.dev/api/v1"
name = "Herald Messages"
env_key = "X_HERALD_API_KEY"
api_backend = "messages"
context_window = 1048576
max_completion_tokens = 8192
```

```bash
export X_HERALD_API_KEY=xg_...
grok -m herald-agent -p 'say OK'

- 两种 backend 的 `base_url` 都是 **`…/api/v1`**（Grok 自己拼 `/chat/completions` 与 `/messages`）。实测 debug 日志：`…/api/v1/chat/completions`、`…/api/v1/messages`。
- 写 `…/api` 会得到 `/api/messages`，被管理 API 的 JWT 中间件拦下 → 401 `Missing or invalid authorization header`；写 `…/api/v1/v1` 会落 SPA 返回 HTML。别照 Anthropic SDK 的口径推。
- `api_key = "xg_..."` 内联也可行；`env_key` 更安全。Grok 未登录时若模型既没 `api_key` 也没 `env_key` 会先报 `Not signed in`。

## OpenCode

`opencode.json`（项目根或 `~/.config/opencode/`）：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "x-herald": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "x-herald",
      "options": { "baseURL": "https://x-herald.ts.xartifact.dev/api/v1", "apiKey": "xg_..." },
      "models": { "Agent": { "name": "Agent" }, "Plan": { "name": "Plan" } }
    }
  }
}
```

base URL **`…/api/v1`**（SDK 拼 `/chat/completions`）。`x-herald configure` 生成的正是这份。

## pi / omp

`~/.pi/agent/models.json`：

```json
{
  "providers": {
    "x-herald": {
      "api": "openai-completions",
      "baseUrl": "https://x-herald.ts.xartifact.dev/api/v1",
      "apiKey": "xg_..."
    }
  }
}
```

`~/.omp/agent/models.yml`：

```yaml
providers:
  x-herald:
    baseUrl: https://x-herald.ts.xartifact.dev/api/v1
    apiKey: xg_...
    compat:
      supportsStore: false
      maxTokensField: max_tokens
      supportsReasoningEffort: true
```

两者都支持由 `packages/agent-extensions`（x-herald 扩展）从 `/api/v1/models` **动态发现**模型目录，无需硬编码 `models` 列表；omp 另有 24h SQLite 缓存与 `/x-herald refresh`。

## 裸 SDK

```ts
// OpenAI SDK
new OpenAI({ baseURL: 'https://x-herald.ts.xartifact.dev/api/v1', apiKey: 'xg_...' })

// Anthropic SDK —— 注意少一层 v1
new Anthropic({ baseURL: 'https://x-herald.ts.xartifact.dev/api', apiKey: 'xg_...' })
```

Python 同理：`OpenAI(base_url="…/api/v1")`、`Anthropic(base_url="…/api")`。

## 校验新客户端是否真的打到了网关

```bash
curl -s "$XH/api/health"                    # {"status":"healthy","database":"connected"}
curl -s "$XH/api/v1/models" -H "Authorization: Bearer $XK" | jq -r '.data[].id'
```

判定「打到了 SPA 而不是网关」：响应 `content-type: text/html` 且 200。网关所有 JSON 端点错误时也是 `application/json`。

漏到网关的证据在客户端侧：Grok `--debug-file`、omp `~/.omp/logs/`、Codex `RUST_LOG=debug`。
