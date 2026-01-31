# 协议转换测试集

本测试集用于验证 LLM Gateway 的协议转换功能，确保 OpenAI 和 Anthropic 协议能够正确地相互转换。

## 测试文件结构

```
__tests__/
├── README.md                    # 本文件
├── cross-protocol.test.ts       # 跨协议转换测试（16 个测试用例）
../protocols/__tests__/
├── openai.test.ts              # OpenAI 协议转换器测试（25 个测试用例）
└── anthropic.test.ts           # Anthropic 协议转换器测试（35 个测试用例）
```

**总计**: 76 个测试用例，238 个断言

## 测试覆盖范围

### 1. OpenAI 协议转换器测试 (openai.test.ts)

#### 请求转换测试 (normalizeRequest)
- ✅ 基本聊天请求转换
- ✅ max_completion_tokens 参数处理
- ✅ 多模态消息（图片）
- ✅ 工具调用请求
- ✅ stop 序列（字符串和数组）
- ✅ response_format（JSON 模式）
- ✅ originalProvider 元数据

#### 请求适配测试 (adaptRequest)
- ✅ 标准请求转 OpenAI 格式
- ✅ 工具定义转换
- ✅ 多模态内容转换
- ✅ 函数类型的 tool_choice
- ✅ 可选字段（temperature, top_p 等）

#### 响应转换测试 (normalizeResponse)
- ✅ 基本响应转换
- ✅ 工具调用响应
- ✅ 缺失 usage 字段处理

#### 响应适配测试 (adaptResponse)
- ✅ 标准响应转 OpenAI 格式
- ✅ Content-Type 头设置

#### 流式转换测试 (transformStream)
- ✅ 流式响应转换
- ✅ 工具调用的流式响应

#### 边界情况
- ✅ 空消息内容
- ✅ null content 处理
- ✅ 频率和存在惩罚参数
- ✅ seed 参数

### 2. Anthropic 协议转换器测试 (anthropic.test.ts)

#### 请求转换测试 (normalizeRequest)
- ✅ 基本聊天请求
- ✅ system prompt 处理
- ✅ 工具调用请求
- ✅ 多模态消息（base64 图片和 URL 图片）
- ✅ thinking/reasoning 模式
- ✅ stop_sequences 处理
- ✅ metadata（user_id）
- ✅ 各种 tool_choice 类型（auto/any/tool）

#### 请求适配测试 (adaptRequest)
- ✅ 标准请求转 Anthropic 格式
- ✅ system 消息分离到单独字段
- ✅ 多个 system 消息合并
- ✅ 工具定义转换（input_schema）
- ✅ 多模态内容转换
- ✅ base64 图片转换
- ✅ stop 序列转换
- ✅ reasoning 转 thinking
- ✅ userId 转 metadata

#### 响应转换测试 (normalizeResponse)
- ✅ 基本响应转换
- ✅ 工具调用响应
- ✅ 缓存 token 统计
- ✅ 各种 stop_reason 映射

#### 响应适配测试 (adaptResponse)
- ✅ 标准响应转 Anthropic 格式
- ✅ 工具调用响应转换
- ✅ Content-Type 头设置

#### 流式转换测试 (transformStream)
- ✅ 空流处理
- ✅ 流式事件透传

#### 边界情况
- ✅ 空 content 数组
- ✅ 空字符串 content
- ✅ max_tokens 默认值（4096）
- ✅ 未知的 stop_reason 处理

### 3. 跨协议转换测试 (cross-protocol.test.ts)

#### OpenAI → 标准格式 → Anthropic
- ✅ 基本聊天请求转换
- ✅ 工具调用请求转换
- ✅ 多模态请求转换
- ✅ base64 图片转换

#### Anthropic → 标准格式 → OpenAI
- ✅ 基本聊天请求转换
- ✅ 工具调用请求转换
- ✅ thinking/reasoning 处理

#### 响应转换
- ✅ Anthropic 响应 → 标准格式 → OpenAI 响应
- ✅ OpenAI 响应 → 标准格式 → Anthropic 响应

#### 端到端场景
- ✅ 完整的 OpenAI → Anthropic → Anthropic → OpenAI 流程
- ✅ 工具调用的完整流程

#### 数据一致性验证
- ✅ Token 统计一致性
- ✅ 消息顺序一致性
- ✅ 空内容处理

## 运行测试

```bash
# 运行所有协议转换测试
bun test src/features/gateway/transformer

# 运行单个测试文件
bun test src/features/gateway/transformer/protocols/__tests__/openai.test.ts
bun test src/features/gateway/transformer/protocols/__tests__/anthropic.test.ts
bun test src/features/gateway/transformer/__tests__/cross-protocol.test.ts
```

## 关键转换规则

### OpenAI ↔ 标准格式

| OpenAI | 标准格式 | 说明 |
|--------|----------|------|
| `messages[].role: system/user/assistant/tool` | 相同 | 直接映射 |
| `messages[].content: string` | 相同 | 直接映射 |
| `messages[].content: array` | `MessageContent[]` | 多模态内容 |
| `tool_calls` | `tool_calls` | 工具调用 |
| `finish_reason: tool_calls` | 相同 | 直接映射 |
| `usage.prompt_tokens` | `usage.prompt_tokens` | Token 统计 |

### Anthropic ↔ 标准格式

| Anthropic | 标准格式 | 说明 |
|-----------|----------|------|
| `system` 字段 | `messages[].role: system` | 分离到消息数组 |
| `messages[].role: user/assistant/tool` | 相同 | 直接映射 |
| `content: string` | 相同 | 直接映射 |
| `content[].type: text/image` | `MessageContent[]` | 多模态内容 |
| `content[].type: tool_use` | `tool_calls` | 工具调用 |
| `content[].type: tool_result` | `tool_call_id` | 工具结果 |
| `stop_reason: end_turn` | `finish_reason: stop` | 映射 |
| `stop_reason: tool_use` | `finish_reason: tool_calls` | 映射 |
| `thinking` | `reasoning` | 推理模式 |
| `usage.cache_read_input_tokens` | `usage.prompt_tokens_details.cached_tokens` | 缓存统计 |

### 跨协议转换注意事项

1. **角色映射**
   - OpenAI: `system`, `user`, `assistant`, `tool`
   - Anthropic: `user`, `assistant`, `tool`
   - Anthropic 的 system prompt 通过单独字段传递

2. **工具调用差异**
   - OpenAI: `tool_calls` 数组在消息中，`arguments` 是 JSON 字符串
   - Anthropic: `content` 数组包含 `tool_use` 块，`input` 是对象

3. **图片格式**
   - OpenAI: `image_url` 支持 URL 和 base64
   - Anthropic: `image` 支持 URL 和 base64，使用 `source` 字段

4. **Token 统计**
   - Anthropic 支持缓存 token 统计，OpenAI 不直接支持
   - 转换时保留所有可用统计信息

## 扩展测试

添加新协议转换器时，建议测试以下场景：

1. **基本请求/响应转换** - 验证核心功能
2. **流式响应** - 验证 SSE 格式处理
3. **工具调用** - 验证 function calling
4. **多模态内容** - 验证图片等富媒体
5. **边界情况** - 空值、缺失字段、默认值
6. **跨协议转换** - 与其他协议的互操作性
