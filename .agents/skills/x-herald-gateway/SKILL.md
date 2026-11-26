---
name: x-herald-gateway
description: "调用与接入 x-herald LLM 网关（OpenAI / Anthropic / Responses / Gemini / JEV 多协议透明代理）：把 Claude Code、Codex、Grok、OpenCode、pi/omp 或任意 OpenAI/Anthropic SDK 指向网关，用虚拟密钥（xg_…）发 /api/v1 请求，读 /api/v1/models 模型目录，处理协议转换、thinking/reasoning_content、流式 SSE、工具调用与速率限制头。凡是要「配置某个 agent/客户端走我们自建网关」、手写 curl/SDK 请求体、排查 401/404/invalid URL/model not found、模型名对不上时使用。网关运维（供应商/路由规则/日志/成本/熔断）请用 x-herald-cli 技能。"
---

# x-herald 网关：调用与接入

x-herald 是**透明代理**：请求尽量按原协议透传，只有跨协议时才转换。
所以「客户端原本怎么调 OpenAI/Anthropic，就照旧调」，只改 base URL 与密钥。

## 0. 三个必须先知道的事实（踩过坑）

| 事实 | 后果 |
|---|---|
| 网关只挂 `/api/v1/*`。多写一层版本段（`/api/v1/v1/messages`）会被**入口自动折叠**回 `/api/v1/messages`；裸 `/v1/*` 与其它未匹配的 `/api` 路径现在返回 **JSON 404**，不再落 SPA 的 `200 text/html` |
| 认证头两种都认：`Authorization: Bearer xg_…` 与 `x-api-key: xg_…` | 密钥前缀是 `xg_`，不是 `sk-`；两种头对 OpenAI/Anthropic 端点都有效 |
| 未知模型名**不报错**，走 catchall 兜底到默认组 | 拼错模型名会静默路由到别的模型（如 `claude-sonnet-4-5` → `deepseek-flash`），务必用 `/api/v1/models` 里的 id |

## 1. 端点（生产实测）

默认入口：`https://x-herald.ts.xartifact.dev`。自建/本地：`http://<host>:<port>`（docker 5005 → 容器 3000；`bun run dev` 为 43173）。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 无需鉴权；`{"status":"healthy","database":"connected"}` |
| GET | `/metrics` | Prometheus，**无需鉴权** |
| GET | `/api/v1/models` | 模型目录。带 `anthropic-version` 或 `x-api-key` 返回 Anthropic 形状 |
| GET | `/api/v1/models/:id` | 单模型；不存在返回 `{"error":{"message":"model_not_found"}}` |
| POST | `/api/v1/chat/completions` | OpenAI Chat Completions（含 stream / tools / reasoning_effort） |
| POST | `/api/v1/responses` | OpenAI Responses API（含 stream，`store` 透传） |
| POST | `/api/v1/messages` | Anthropic Messages（含 stream / tools / system cache_control / `?beta=true`） |
| POST | `/api/v1/messages/count_tokens` | 透明代理到上游。baseUrl 自带 `/v1` 时曾拼出 `/v1/v1/…`，源码已修（`joinUrl`），**未修复的部署仍返回 404** |
| POST | `/api/v1/embeddings` | 需 `category=embedding` 的组；无可用实例时 503 |
| POST | `/api/v1/audio/transcriptions` · `/audio/speech` · `/tts` | 语音，需 `asr` / `tts` 组 |
| POST | `/api/v1/systemone` | JEV System One（类型化决策协议，非 chat 语义；chat 模型会 404） |
| GET | `/api/v1/actuator` | 网关自述与协议能力清单 |

管理 API 是另一套：`/api/providers`、`/api/model-groups`、`/api/access-models`… 需管理员 JWT（`POST /api/auth/login`），**不能用虚拟密钥**。

路径折叠只处理**连续重复的版本段**（`v1/v1`、`v2.1/v2.1`），不动资源段（`/api/keys/keys` 保持原样，因为第二段可能是名字）。`/v2/v1` 这类不同版本号也不猜——语义不明，交给 404。看到 JSON 404 就说明路径真的没匹配，别再猜「是不是网关坏了」。

## 2. 最小可用请求

```bash
export XH=https://x-herald.ts.xartifact.dev
export XK=xg_...            # 虚拟密钥

# OpenAI 协议
curl -s "$XH/api/v1/chat/completions" \
  -H "Authorization: Bearer $XK" -H 'content-type: application/json' \
  -d '{"model":"Agent","messages":[{"role":"user","content":"hi"}],"max_tokens":64}'

# Anthropic 协议
curl -s "$XH/api/v1/messages" \
  -H "x-api-key: $XK" -H 'anthropic-version: 2023-06-01' -H 'content-type: application/json' \
  -d '{"model":"Agent","max_tokens":64,"messages":[{"role":"user","content":"hi"}]}'

# 模型目录
curl -s "$XH/api/v1/models" -H "Authorization: Bearer $XK" | jq -r '.data[].id'
```

响应里思考过程走 **`reasoning_content`**（OpenAI 形状）或 **`thinking` block**（Anthropic 形状）。
`stream_options: {"include_usage": true}` 时最后一个 chunk 带 `usage`（含 `reasoning_tokens`），以 `data: [DONE]` 结束。

## 3. 接入各 agent 客户端

每家客户端的 base URL 口径不同（有的自己拼 `/v1`，有的不拼）。**照抄下表，不要自己推**。逐条实测记录见 [`clients.md`](./clients.md)。

| 客户端 | 配置位置 | base URL | 协议 |
|---|---|---|---|
| Claude Code | `~/.claude/settings.json` → `env.ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY` | `https://host/api`（它自己拼 `/v1/messages`） | messages |
| Codex CLI | `~/.codex/config.toml` → `[model_providers.x]` | `https://host/api/v1` | `wire_api = "responses"` |
| Grok CLI | `~/.grok/config.toml` → `[model.x]` | `https://host/api/v1` | `api_backend = "chat_completions"` 或 `"messages"` |
| OpenCode | `opencode.json` → `provider.x-herald` | `https://host/api/v1` | `@ai-sdk/openai-compatible` |
| pi / omp | `~/.pi/agent/models.json`、`~/.omp/agent/models.yml` | `https://host/api/v1` | `openai-completions` |
| 任意 OpenAI SDK | `baseURL` | `https://host/api/v1` | chat / responses |
| 任意 Anthropic SDK | `baseURL` | `https://host/api`（SDK 拼 `/v1/messages`） | messages |

一条命令生成这些配置：`x-herald configure`（交互式，写 OpenCode/Claude Code/pi/Codex 配置）。
注意 `x-herald configure` 的 Codex 分支只导环境变量，**Codex 0.172 已不支持 `wire_api="chat"`**，见 `clients.md` 的手写版。

## 4. 模型目录与能力

`/api/v1/models` 的每个条目带 `context_window`、`max_output_tokens`、`capabilities{vision,reasoning,streaming,function_calling,json_mode}`、`compat`、`reasoning.supported_efforts`。
客户端要用这些字段，别假设：

- `compat.max_tokens_field` 常见为 `max_completion_tokens` —— 老代码传 `max_tokens` 仍被接受（网关会映射），但上游若严格会 400。
- `reasoning.supported_efforts` 常见 `["low","medium","high","none"]`；网关对 `reasoning_effort` 是**透传**，`xhigh` / `max` 也照发，档位是否被支持由上游决定。
- 同一个 id 在 OpenAI 与 Anthropic 形状下都存在，`model` 字段按原样回显。

**不要**把模型目录硬编码进客户端：网关增删模型后旧列表立刻漂移。能从 `/api/v1/models` 动态发现的就动态发现（pi/omp 的 x-herald 扩展即为此设计）。

## 5. 常见错误 → 处置

| 现象 | 根因 | 处置 |
|---|---|---|
| 响应是 HTML（200 + `text/html`） | 部署早于「API 前缀排除 SPA 兜底」的版本 | 升级网关；此后同类错误会以 JSON 404 出现，直接看 `path` 字段 |
| JSON 404 且 `path` 与你预期不符 | base URL 口径写错（多写/少写 `/api`） | 照 §3 的表改：OpenAI/Codex/Grok/pi/omp 用 `…/api/v1`，Anthropic SDK/Claude Code 用 `…/api` |
| `Missing API key. Provide it via Authorization: Bearer <key> or x-api-key header` | 没带密钥 | 加 `Authorization: Bearer xg_…` |
| `{"error":"Invalid API key","code":"INVALID_KEY"}` | 密钥错/被删 | 换密钥；管理 API 的 JWT 不能用于 `/api/v1` |
| `KEY_DISABLED` / `KEY_EXPIRED` | 密钥停用/过期 | 管理端启用或换新 |
| `429` + `X-RateLimit-*` | 密钥级 RPM/RPD/Token 限流 | 退避重试，或调高该密钥限额 |
| `model_not_found`（**只出现在 `/models/:id`**） | 模型未接入 | 用 `/api/v1/models` 列的 id |
| 明明写了模型名却答非所问 | catchall 兜底生效 | 核对 id 大小写与全名 |
| `Invalid URL (POST /v1/v1/messages/count_tokens)` | 部署尚未包含 `joinUrl` 修复（旧版本） | 升级网关；临时用本地 tokenizer 估算 |
| `service_unavailable … No enabled instances in model group` | 该组无可用实例/供应商被禁 | 运维侧修（用 x-herald-cli） |
| `413` | 请求体超 `GATEWAY_MAX_REQUEST_BODY_MB`（默认 64） | 压缩图片/音频或调高上限 |

配额与可观测性：每个虚拟密钥可设 RPM / RPD / 日 Token 上限，超限返回 `429` 并带 `X-RateLimit-{RPM,RPD,Tokens}-{Limit,Remaining,Reset}`；所有请求都会落到网关的请求日志、成本核算与 `/metrics`，所以客户端侧的 model 名要写成真实接入模型名，否则成本/日志会归到 catchall 名下。

排障顺序：`/api/health` → 密钥对不对 → 路径对不对 → 模型 id 对不对 → 才去看运维侧日志。

## 6. 相关技能

- **x-herald-cli**：用 `x-herald` CLI 运维网关（供应商、模型组/实例、接入模型、路由规则、密钥、日志、指标、熔断、成本、配置导入导出）。
- **x-herald-production-debug**：生产主机 / docker 容器 / 数据库直查 / 上游连通性排查。

只在需要「改动网关配置」时才动 CLI 与管理 API；纯调用侧问题在本技能内解决。

## 7. 维护

本技能是**调用侧**说明（客户端怎么连），与仓库自带的 `x-herald-cli` 技能（运维侧，`apps/cli/skills/`，随二进制分发）互补，不要合并。
源文件在仓库 `.agents/skills/x-herald-gateway/`，`.claude/skills/x-herald-gateway/` 必须逐字节一致（`scripts/ci-contract.test.ts` 校验）。
本机各 runtime 的用户级目录是指向仓库源文件的符号链接（`~/.claude/skills`、`~/.codex/skills`、`~/.pi/agent/skills`、`~/.omp/agent/skills`、`~/.grok/skills`、`~/.agents/skills`），改仓库即生效。
