# 接入新 Provider（外部 Agent 向导）

给 Agent 用的**逐步接入流程**：从零到「接入模型可被客户端调用」。每一步都有可复现的命令、
成功判据、失败后的下一步。网关不生成任何源码——所有动作都是管理 API 调用。

> 前置：`x-herald ping` 返回 ok，`x-herald auth whoami` 的 `tokenSource` 不是 `none`。
> 变更前先 `x-herald config export > before-$(date +%Y%m%d-%H%M%S).json`。

## 0. 先确认它到底是什么协议

接入失败最常见的原因不是密钥错，而是**协议选错**。问自己一个问题就够：

| 上游特征 | 协议 | 判据 |
| --- | --- | --- |
| `POST /v1/chat/completions`，`choices[].message.content` | `openai` | 多数自建/中转/FastChat/vLLM 默认 |
| `POST /v1/messages`，响应有 `content[]` + `stop_reason` | `anthropic` | 官方 Anthropic 或 Claude 兼容层 |
| URL 带 `:generateContent`，响应有 `candidates[]` | `gemini` | Google 原生 |
| `POST /inference` 或自定义路径，非 chat 语义 | `asr` / `tts` | 语音上游，需显式 `endpoint` |

不确定时用**最小代价探测**，两条路径：

```bash
# 路径 A：直接问上游（不需要先建 provider）
curl -s http://x99:8000/v1/models -H "Authorization: Bearer sk-..." | head -c 400
curl -s http://x99:8000/v1/messages -o /dev/null -w '%{http_code}\n'   # 405/404 = 不是 anthropic

# 路径 B：已建 provider 时用网关探测（只读，不落库）
x-herald providers models <providerId>
```

路径 A 更快，且失败时能立刻看出是网络问题还是协议不符。路径 B 验证的是「网关视角可达」，
两者结论不一致时以 B 为准——只有 B 经过了网关到上游的那条实际网络路径。

## 1. 创建 Provider

```bash
x-herald providers create \
  --name "x99-vllm" \
  --protocols '{"openai":{"baseUrl":"http://x99:8000/v1","enabled":true}}' \
  --api-key "sk-..."      # 上游不需要鉴权时省略
```

音频上游（自有契约）要显式给端点：

```bash
x-herald providers create \
  --name "x99-whisper" \
  --protocols '{"asr":{"baseUrl":"http://x99:9000","enabled":true,"endpoint":"/inference"}}'
```

**成功判据**：输出里有 `id`。记下它，后面每一步都要用。

**失败与下一步**：

| 症状 | 原因 | 下一步 |
| --- | --- | --- |
| 400 `protocols is required` | 少传 `--protocols` | 补上；至少一个协议 `enabled: true` |
| 400 `At least one protocol must be configured` | `enabled` 写成 false | 改正 |
| `baseUrl` 校验失败 | 少了 `http://` | 补全 scheme |

## 2. 探测上游模型（只读）

```bash
x-herald providers models <providerId>
```

**成功判据**：返回数组非空，每项有 `id`（上游真实模型名）与可选 `contextWindow` / `cost`。

**失败与下一步**：

| 症状 | 原因 | 下一步 |
| --- | --- | --- |
| `404` / 空数组 | 上游无 `/models` 端点 | 跳过探测，手写实例（见第 3 步），`actualModelName` 用上游文档里的名字 |
| `401` | API key 错或没传 | `providers update <id> --api-key ...` 后重试 |
| 连接超时 | 网关到上游网络不通 | 先 `x-herald instances test`（第 4 步）确认网络，而不是继续加配置 |

上游没有 `/models` 时**不要**为了过这一步去 `sync-models` 一个假列表——那会把编造的模型名写进库。

## 3. 建立可用链路：模型组 → 实例

实例必须挂在模型组里才能被路由。两条路：

**A. 已有同类模型组**（推荐，复用路由策略）：

```bash
x-herald groups list                                  # 找目标组
x-herald providers sync-models <providerId> \
  --models '[{"id":"qwen3-32b","name":"Qwen3 32B","contextWindow":32768}]' \
  --group-ids '["<groupId>"]'
```

**B. 新建组**（上游是新能力类别时）：

```bash
# 语音/嵌入这类非对话能力，category 必须选对，否则路由不会选中它
x-herald groups create --name "asr-main" --display-name "ASR 主组" --category asr
x-herald instances create \
  --provider-id <providerId> \
  --name "x99-whisper-1" \
  --actual-model-name "sensevoice-small" \
  --protocol asr \
  --group-ids '["<groupId>"]'
```

`--protocol` 要与第 1 步 provider 里启用的协议一致（`openai` / `anthropic` / `gemini` / `jev` / `asr` / `tts`）。
留空表示「按客户端协议自动选」，只对同时启用了 openai 与 anthropic 的供应商成立；音频端点必须显式写。

`category` 取值：`chat` / `embedding` / `image` / `audio` / `asr` / `tts` / `system_one`。
**选错类别的后果**：`/v1/audio/transcriptions` 只接受 `asr` 组的候选，`chat` 组会被直接过滤，表现为 404。

**成功判据**：`x-herald groups instances` 能列出新实例，且 `groupId` 正确。

## 4. 验证连通性

```bash
x-herald instances test <instanceId>
```

**成功判据**：返回成功且带延迟。这是唯一能证明「网关能真的打到上游」的检查。

**失败与下一步**：

| 症状 | 原因 | 下一步 |
| --- | --- | --- |
| 超时 | 网络/防火墙 | 在网关主机上 curl 上游 baseUrl 复现；不是网关配置问题 |
| 401/403 | 上游密钥 | `providers update` 改 key |
| 404 | `actualModelName` 与上游不符 | 用第 2 步探测到的 `id` 原样填写 |
| 5xx | 上游自身故障 | 保留配置但 `instances toggle <id>` 停用，避免拖累组内其他实例 |

## 5. 暴露给客户端

在**现有接入模型**上加一条 `route_to_group` 规则，或新建接入模型：

```bash
x-herald rules list <accessModelId>
x-herald rules save <accessModelId> --graph '<canvas JSON>'   # 目标组指向第 3 步的组
x-herald rules activate <accessModelId> --version <v>
```

**成功判据**：`x-herald rules list <accessModelId>` 显示该版本 state 为 `active`。

路由规则保存时会校验：目标模型组必须与接入模型**同工作空间**，否则返回
`400 CROSS_WORKSPACE_ROUTE_TARGET`。跨空间不是权限问题，是路由表本身不跨越边界。

## 6. 端到端验证

用虚拟密钥而非管理员 token（后者只对管理 API 有效）：

```bash
x-herald --api-key "$VK" ...        # CLI 的 --api-key 走 /api/v1
```

或者直接：

```bash
curl -s $X_HERALD_URL/api/v1/chat/completions \
  -H "Authorization: Bearer $VK" -H 'content-type: application/json' \
  -d '{"model":"<接入模型名>","messages":[{"role":"user","content":"ping"}]}'
```

**成功判据**：200 且 `choices[0].message.content` 非空。
随后 `x-herald logs list --model-name <接入模型名>` 应能查到这一条，且 `providerName` 是第 1 步建的供应商。

## 回滚

按依赖倒序拆除，每步都可用：

```bash
# 只停用（保留配置，随时恢复）—— 首选
x-herald instances toggle <instanceId>
x-herald providers toggle <providerId>

# 彻底移除
x-herald rules save <accessModelId> --graph '<不含该组的新图>' && x-herald rules activate <accessModelId> --version <newV>
x-herald instances delete <instanceId>
x-herald providers delete <providerId>
```

先摘路由、再删实例、最后删 provider：反过来会让路由规则短暂指向不存在的目标。

**验证回滚**：`x-herald config export | jq` 中不再出现该 provider；已有的其他路由仍能正常调用。

## 不要做的事

- **不要**用 `config import` 做单点接入——它会整体覆盖，粒度太粗。
- **不要**为了「让探测通过」而 `sync-models` 编造上游不存在的模型名。
- **不要**在 `instances test` 未通过时就去改路由规则：那会把故障从「本地可见」变成「线上 5xx」。
