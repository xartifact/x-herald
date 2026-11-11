# x-herald 语音能力需求：ASR / TTS / 双向流

> 状态：**已实现（P1–P5）**。上游硬件条件仍未验证（见 §7 阻塞项），接口契约与验收标准均已落地并有用例固化。实现落点见 §十。

## 一、背景与目标

x-herald 目前是纯文本/多模态 **输入** 网关（`capability-router.ts` 已能识别 `audio` 能力位），但没有音频的**输入转录**与**输出合成**路由。四条 `/audio/*` 路径实测全部返回前端 SPA HTML：

```
POST /api/v1/audio/transcriptions → 200 text/html
POST /api/v1/audio/speech         → 200 text/html
POST /api/v1/audio/tts            → 200 text/html
POST /api/v1/tts                  → 200 text/html
```

目标：让客户端（语音助理 App、任意 OpenAI 兼容客户端）通过 x-herald 统一访问语音能力，复用现有的虚拟 key 鉴权、模型路由、熔断、failover、日志链路。

**非目标**：不实现音频编解码与重采样（交给上游服务）；不做语音模型推理；不替代上游的说话人分离、情感识别等能力。

## 二、现状盘点（代码事实）

| 位置                                                                | 现状                                                                    | 影响                                                                           |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `apps/gateway/src/gateway/api.ts:117-121`                           | 挂载 `actuator/openai/embedding/anthropic/jev` 五组路由                 | 无 audio 组                                                                    |
| `apps/gateway/src/gateway/services/capability-router.ts:18`         | `CAPABILITY_PRIORITY` 已含 `audio: 80`、`tts: 70`                       | 能力位存在，但只用于 chat 请求**内容**检测（`input_audio` part），不是转录端点 |
| `packages/shared/src/types/model-group.ts:31`                       | `category: 'chat' \| 'embedding' \| 'image' \| 'audio' \| 'system_one'` | **只有一个 `audio`**，无法区分 ASR 与 TTS                                      |
| `packages/shared/src/types/log.ts:26`                               | `requestCategory` 无音频项                                              | 音频请求无法归类统计                                                           |
| `apps/gateway/src/gateway/handlers/openai/embedding-handler.ts`     | 纯透传实现，含 failover/熔断/日志                                       | 可直接复用的模板                                                               |
| `apps/gateway/src/gateway/handlers/openai/embedding-executor.ts:23` | `DEFAULT_ENDPOINT = '/v1/embeddings'`                                   | 端点写死，需参数化                                                             |

## 三、接口契约

三个端点，全部挂在 `/api/v1` 下，走现有 `virtualKeyMiddleware`。

### 3.1 `POST /v1/audio/transcriptions`（语音转文字）

对齐 OpenAI Audio Transcriptions API。

**请求**（`multipart/form-data`）：

| 字段              | 类型   | 必填 | 说明                                    |
| ----------------- | ------ | ---- | --------------------------------------- |
| `file`            | binary | 是   | 音频文件；WAV/MP3/M4A/WebM，建议 ≤25 MB |
| `model`           | string | 是   | 走模型路由，例如 `sensevoice-small`     |
| `language`        | string | 否   | BCP-47，如 `zh`；缺省由上游自动判定     |
| `response_format` | string | 否   | `json`（默认）/ `text` / `verbose_json` |
| `prompt`          | string | 否   | 偏置提示词（上游支持时透传）            |
| `temperature`     | number | 否   | 透传                                    |

**响应** `200 application/json`：

```json
{ "text": "帮我用 Codex 修一下登录页面的 Bug。" }
```

`verbose_json` 时追加 `language`、`duration`，上游给出时再带 `segments`。

**错误**：`400` 缺 `file`/`model`；`401` 无效虚拟 key；`404` 模型不存在或不在 `allowedModels`；`413` 超限；`502` 上游失败；`504` 上游超时。

### 3.2 `POST /v1/audio/speech`（文字转语音）

对齐 OpenAI Audio Speech API。

**请求**（`application/json`）：

| 字段              | 类型   | 必填 | 说明                                       |
| ----------------- | ------ | ---- | ------------------------------------------ |
| `model`           | string | 是   | 例如 `kokoro-zh`                           |
| `input`           | string | 是   | 待合成文本，建议 ≤4096 字符                |
| `voice`           | string | 是   | 音色标识，由上游定义并需在模型元数据中声明 |
| `response_format` | string | 否   | `wav`（默认）/ `mp3` / `pcm`               |
| `speed`           | number | 否   | 0.25–4.0，默认 1.0                         |

**响应** `200`，`Content-Type` 按 `response_format`（`audio/wav` 等），body 为二进制音频字节流。

**要求**：响应必须**流式透传**（不整体缓冲），否则长文本首字节延迟不可接受。

### 3.3 `GET /v1/audio/stream`（WebSocket 双向流）

用于低延迟交互与打断。**这是唯一非 OpenAI 标准的部分**，需要明确设计。

**握手**：`Upgrade: websocket`，查询参数或首帧携带 `model`；鉴权沿用虚拟 key（Header 或 `?key=`）。

**帧协议**（JSON 控制帧 + 二进制数据帧）：

| 方向 | 帧                                                         | 说明                                |
| ---- | ---------------------------------------------------------- | ----------------------------------- |
| C→S  | `{"type":"start","model":"sensevoice-small","mode":"asr"}` | 开始会话                            |
| C→S  | binary                                                     | 音频分片（16 kHz mono PCM 或 WebM） |
| C→S  | `{"type":"commit"}`                                        | 一段话说完，请求出结果              |
| S→C  | `{"type":"partial","text":"帮我用"}`                       | 中间结果                            |
| S→C  | `{"type":"final","text":"…"}`                              | 最终结果                            |
| S→C  | `{"type":"error","message":"…"}`                           | 错误                                |
| C→S  | `{"type":"cancel"}`                                        | 打断，服务端丢弃当前结果            |

TTS 方向（`mode:"tts"`）：C→S 发 `{"type":"text","text":"…"}`，S→C 回 binary 音频分片 + `{"type":"done"}`。

**开放问题**：协议转换层（`apps/gateway/src/gateway/transformer`）目前只处理 JSON，WS 需要独立生命周期管理。**建议第一版只做 ASR 与 TTS 两个 HTTP 端点，WS 单独立项**。

## 四、模型与 Provider 扩展

### 4.1 模型分类

现有 `category` 只有一个 `audio`，ASR 与 TTS 混在一起会让路由无法区分。需要二选一：

| 方案                                          | 改动                                                               | 评价                           |
| --------------------------------------------- | ------------------------------------------------------------------ | ------------------------------ |
| A. 新增 `asr` / `tts` 两个 category           | `model-group.ts:31` 枚举、UI 表单 schema、DB 无迁移（varchar(50)） | **推荐**，语义清晰             |
| B. 保留 `audio`，用 `capabilities` 子字段区分 | 只改模型元数据                                                     | 改动小，但路由需二次解析，易错 |

采用 A 时需同步修改：`packages/shared/src/types/model-group.ts`、`packages/ui/src/features/model-groups/hooks/management-form-schema.ts:34`、以及所有 `category` 的字面量分支。

### 4.2 Provider 配置

`providers.protocols` 目前是 `Partial<Record<string, ExtendedProtocolConfig>>`，key 是协议名（`openai`/`anthropic`/`gemini`/`jev`）。音频上游多为**自有 HTTP 契约**（whisper-server 的 `/inference`、sherpa 的自定义端点），不是 OpenAI 协议。

需要新增：

```ts
// packages/shared/src/types/provider.ts
export interface ExtendedProtocolsConfig {
  openai?: ExtendedProtocolConfig
  anthropic?: ExtendedProtocolConfig
  gemini?: ExtendedProtocolConfig
  jev?: ExtendedProtocolConfig
  // 语音：上游自定契约，用 baseUrl + endpoint 描述
  asr?: ExtendedProtocolConfig & { endpoint?: string }
  tts?: ExtendedProtocolConfig & { endpoint?: string }
}
```

`endpoint` 缺省时按协议取默认值（`/v1/audio/transcriptions`、`/v1/audio/speech`）。

### 4.3 二进制透传

`PassthroughCandidateExecutor`（`embedding-executor.ts`）按 JSON 处理 body。音频需要两条新分支：

| 方向 | 要求                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------- |
| 上行 | `multipart/form-data` **不可解析**（解析会破坏 boundary），原样转发 + 只改写表单里的 `model` 字段 |
| 下行 | 按 `Content-Type` 判定二进制，**不缓冲**、不 JSON 解析，直接 `ReadableStream` 透传                |

上行改写 `model` 需要在 multipart 中定位该 part；建议用流式 multipart 解析器，避免整个文件进内存。

## 五、日志与可观测

- `requestCategory` 增加 `'asr'`、`'tts'`（`packages/shared/src/types/log.ts:26`、`packages/db/src/schema/logs.ts:65`）。
- 日志需记录：音频时长、字节数、上游耗时、首字节延迟（TTS）、文本字符数（TTS）。
- **不得记录**音频内容或完整转写文本（隐私）；只记长度与时延。
- Prometheus 指标复用现有 middleware，需确认 multipart 请求不会导致 body 被提前消费。

## 六、验收标准

| #   | 场景                         | 通过条件                                      |
| --- | ---------------------------- | --------------------------------------------- |
| 1   | 上传 3 s WAV + 正确 model    | 200，`text` 非空，与源音频语义一致            |
| 2   | 缺 `file`                    | 400，错误体为 OpenAI 错误结构                 |
| 3   | 无效虚拟 key                 | 401                                           |
| 4   | `model` 不在 `allowedModels` | 404                                           |
| 5   | TTS 合成 1 句中文            | 200，返回可播放音频，`Content-Type` 正确      |
| 6   | TTS 长文本（>500 字）        | 首字节 < 2 s（需流式透传，不能等全部合成）    |
| 7   | 上游 5xx                     | 按现有 failover 策略重试，全失败返回 502      |
| 8   | 上游超时                     | 504，且日志记录 errorType                     |
| 9   | 音频模型出现在 `/v1/models`  | `capabilities` 含 `audio`/`tts`，客户端可发现 |
| 10  | 日志                         | 不含音频内容；含时长、字节数、时延            |

## 七、阻塞项（必须先确认）

**当前上游硬件未验证可用。** x99（RTX 2070 8 GB / i7-6800K）实测：

| 环节           | x99 CPU                                  | Mac M4 Pro         | 说明         |
| -------------- | ---------------------------------------- | ------------------ | ------------ |
| TTS 短句       | 5.6 s 生成 1.5 s 音频（**0.27× 实时**）  | 0.9 s（4.5× 实时） | x99 慢于实时 |
| TTS 长句       | 12.7 s 生成 4.8 s 音频（**0.38× 实时**） | 2.3 s（5.7× 实时） | 同上         |
| ASR 3.4 s 音频 | 0.14 s（25×）                            | 0.05 s（67–98×）   | 可用         |

CUDA 路径当前**不可用**：缺 `libcudnn.so`（`cudnn` 在 Arch `extra` 仓库，需 root 安装；免 root 解压方案下载中）。

因此：

1. 需求 §3 的接口契约**不依赖**硬件，可先实现并用手工 mock 上游验证。
2. 验收标准 #6（TTS 首字节 < 2 s）在当前 x99 CPU 上**无法达成**，需 GPU 打通后重测。
3. 若 GPU 打通后仍慢于实时，则 TTS 上游应保留在 Mac（本地服务），仅 ASR 放 x99；网关对二者透明，切换只改 provider 配置。

## 八、实施顺序建议

| 阶段 | 内容                                                | 依赖                |
| ---- | --------------------------------------------------- | ------------------- |
| P1   | 新增 `asr`/`tts` category + provider 配置扩展       | 无                  |
| P2   | `/v1/audio/transcriptions`（复用 embedding 透传链） | P1                  |
| P3   | `/v1/audio/speech`（含流式透传）                    | P1                  |
| P4   | `/v1/models` 暴露音频模型、日志字段、指标           | P2/P3               |
| P5   | WebSocket `/v1/audio/stream`                        | P2/P3，**单独评审** |

## 九、待决问题（已裁决）

1. **`asr`/`tts` 是否作为独立 category？** 是。已落地为 `MODEL_GROUP_CATEGORIES`（`chat/embedding/image/audio/asr/tts/system_one`），
   路由按类别过滤；`audio` 保留给「对话中带音频输入」的多模态模型。
2. **WebSocket 端点是否本期内做？** 做了（P5），但**帧协议是网关自有契约**，不是 OpenAI 标准。
   上游为 WS 契约时透明桥接（含 `partial`），为 HTTP 契约时按 commit/text 触发单次调用（只有 `final`/`done`）。
3. **上游是自建还是云 API？** 两者都支持，差别由 `provider.protocols.<asr|tts>` 的 `baseUrl`/`endpoint` 描述；
   网关不假设配额或积压语义，只做超时（504）与网络失败（502）的归类。
4. **TTS 音色枚举放哪？** 放上游。`voice` 是自由字符串，网关只做类型校验并与其余字段一起透传；
   `/v1/models` 暂不返回 voice 列表——上游没有统一枚举来源，编造列表比不提供更有害。
5. **音频是否经过日志中间件？multipart 能否重放？** 经过；**不重放**。请求体在读取前用 `content-length`
   预判上限，读取后只改写 `model` 一字段并按字节原样转发；日志**不存**音频内容与转写文本，只存长度与时延。

## 十、实现落点（已交付）

| 需求条目                         | 实现位置                                                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| §3.1 转录端点                    | `apps/gateway/src/gateway/handlers/audio/transcription-handler.ts`、`routes/audio.ts`                             |
| §3.2 合成端点（流式透传）        | `handlers/audio/speech-handler.ts`、`handlers/audio/audio-executor.ts`                                            |
| §3.3 WebSocket 双向流            | `handlers/audio/stream-session.ts`、`routes/audio-stream.ts`；`server.ts` 注册 `hono/bun` 的 `websocket`          |
| §4.1 asr/tts 分类                | `packages/shared/src/types/model-group.ts`（`MODEL_GROUP_CATEGORIES`）；UI 分组表单与日志筛选                     |
| §4.2 provider 配置扩展           | `packages/shared/src/types/provider.ts`（`endpoint` + `asr`/`tts`）；`getAudioEndpoint()`                         |
| §4.3 multipart 改写 / 二进制透传 | `handlers/audio/multipart.ts`（逐字节改写，不重新序列化）、`PreparedRequest.body` 支持二进制                      |
| §5 日志与可观测                  | `REQUEST_CATEGORIES` 含 `asr`/`tts`；`LogMetadata.audio`（字节数/时长/首字节/上游耗时）；请求与响应体一律不落内容 |
| §6 #4 allowedModels              | 音频端点按 `404` 返回（与「模型不存在」同语义）                                                                   |
| §6 #8 超时                       | 音频执行器把 `ttfb_timeout` 映射为 `504` + `errorType: upstream_timeout`                                          |
| §6 #9 模型发现                   | `/v1/models` 按类别发射 `capabilities.audio` / `capabilities.tts`                                                 |

**已知约束**：`partial` 帧只可能来自上游 WS 契约（`ws://` / `wss://` 的 `provider.protocols.<asr|tts>`）。
HTTP 契约的 ASR 上游（whisper-server / sherpa）没有中间结果，只能产出 `final`；这是上游能力边界，不是网关取舍。

**验证**：`apps/gateway/src/__tests__/audio.test.ts`（端到端 HTTP 链路、错误语义、日志脱敏、时长采集）、
`apps/gateway/src/__tests__/audio-socket.test.ts`（真实 `Bun.serve` + WebSocket 升级与帧分派）。
