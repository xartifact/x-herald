# Transformer Chain 架构文档

## 概述

x-llm-gateway 采用 **Transformer Chain + 统一中间格式 + 模型组路由** 架构实现协议转换和模型接入。

## 核心架构

```
用户请求
    ↓
┌─────────────────────────────────────────────────────────────────┐
│                     请求处理流程                                  │
├─────────────────────────────────────────────────────────────────┤
│  1. 协议检测 → 识别 OpenAI/Anthropic 格式                        │
│  2. 标准化   → Transformer 转为 StandardRequest                  │
│  3. 权限检查 → Virtual Key 验证                                  │
│  4. 模型路由 → 模型组选择具体实例                                 │
│  5. 请求适配 → 转为 Provider 协议格式                            │
│  6. 上游调用 → 发送到 LLM Provider                               │
│  7. 响应转换 → 标准化 → 适配 → 返回                              │
└─────────────────────────────────────────────────────────────────┘
```

## 架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         请求生命周期                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. 入口检测 (Protocol Detection)                                    │
│     └── 根据路径和请求体识别协议类型 (OpenAI/Anthropic/...)          │
│                                                                     │
│  2. 请求标准化 (Request Normalization)                               │
│     └── Ingress Transformer: 外部协议 → StandardRequest              │
│                                                                     │
│  3. 业务处理 (Business Logic)                                        │
│     ├── 权限检查 (Virtual Key)                                       │
│     ├── 模型路由 (Model Resolution)                                  │
│     └── Provider 选择                                                │
│                                                                     │
│  4. 请求适配 (Request Adaptation)                                    │
│     └── Egress Transformer: StandardRequest → Provider 协议          │
│                                                                     │
│  5. 上游调用 (Upstream Call)                                         │
│     └── HTTP 请求到 LLM Provider                                     │
│                                                                     │
│  6. 响应标准化 (Response Normalization)                              │
│     └── Ingress Transformer: Provider 响应 → StandardResponse        │
│                                                                     │
│  7. 响应适配 (Response Adaptation)                                   │
│     └── Egress Transformer: StandardResponse → 外部协议              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## 核心组件

### 1. 统一数据模型 (Standard Schema)

位置: `packages/shared/src/types/llm.ts`

```typescript
// 统一请求格式
interface StandardRequest {
  model: string;
  messages: StandardMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
  tool_choice?: ToolChoice;
  reasoning?: ReasoningConfig;
  metadata?: Record<string, unknown>;
}

// 统一响应格式
interface StandardResponse {
  id: string;
  object: 'chat.completion' | 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Choice[];
  usage?: Usage;
}
```

### 2. Transformer 接口

位置: `packages/shared/src/types/transformer.ts`

```typescript
interface Transformer {
  readonly name: string;
  readonly supportedProtocols?: ProtocolType[];

  // 请求转换
  normalizeRequest?(request: unknown, ctx: TransformerContext): Promise<StandardRequest>;
  adaptRequest?(request: StandardRequest, ctx: TransformerContext): Promise<AdaptedRequest>;

  // 响应转换
  normalizeResponse?(response: Response, ctx: TransformerContext): Promise<StandardResponse>;
  adaptResponse?(response: StandardResponse, ctx: TransformerContext): Promise<Response>;

  // 流式处理
  transformStream?(stream: ReadableStream, ctx: TransformerContext): Promise<ReadableStream>;
}
```

### 3. Transformer 注册表

位置: `apps/web/src/transformer/registry.ts`

```typescript
// 注册 Transformer
registerTransformer('openai', OpenAITransformer);
registerTransformer('anthropic', AnthropicTransformer);

// 获取 Transformer
const transformer = getTransformer('openai');
```

### 4. Transformer Chain 执行器

位置: `apps/web/src/transformer/chain.ts`

```typescript
// 构建请求处理链
const chain = TransformerChain.forNormalization(['openai']);
const result = await chain.normalize(rawRequest, ctx);

// 构建适配链
const adaptChain = TransformerChain.forAdaptation(['anthropic']);
const adapted = await adaptChain.adapt(standardRequest, ctx);
```

## 协议转换器实现

### OpenAI Transformer

位置: `apps/web/src/transformer/protocols/openai.ts`

- 支持 OpenAI API 格式
- 处理工具调用、流式响应
- 支持 vision、JSON mode

### Anthropic Transformer

位置: `apps/web/src/transformer/protocols/anthropic.ts`

- 支持 Anthropic Messages API
- 处理 thinking/reasoning 模式
- 支持 tool_use、tool_result

## 使用方式

### 在 Gateway 路由中使用

位置: `apps/web/src/features/gateway/routes.ts`

```typescript
// 1. 检测协议
const protocol = detectProtocol(path, body);

// 2. 标准化请求
const transformer = getTransformer(protocol);
const standardReq = await transformer.normalizeRequest!(body, ctx);

// 3. 查找 Provider 并适配
const targetTransformer = getTransformer(providerProtocol);
const adapted = await targetTransformer.adaptRequest!(standardReq, ctx);

// 4. 发送请求
const response = await fetch(url, { body: JSON.stringify(adapted.body) });

// 5. 转换响应
const standardRes = await targetTransformer.normalizeResponse!(response, ctx);
const finalRes = await transformer.adaptResponse!(standardRes, ctx);
```

## 扩展指南

### 添加新协议支持

1. **创建 Transformer 类**

```typescript
// apps/web/src/transformer/protocols/gemini.ts
export class GeminiTransformer implements Transformer {
  readonly name = 'gemini';
  readonly supportedProtocols = ['gemini'];

  async normalizeRequest(request: unknown, ctx: TransformerContext): Promise<StandardRequest> {
    // 实现转换逻辑
  }

  async adaptRequest(request: StandardRequest, ctx: TransformerContext): Promise<AdaptedRequest> {
    // 实现适配逻辑
  }
}
```

2. **注册 Transformer**

```typescript
// apps/web/src/transformer/index.ts
import { GeminiTransformer } from './protocols/gemini';

export function registerDefaultTransformers(): void {
  registerTransformer('openai', OpenAITransformer);
  registerTransformer('anthropic', AnthropicTransformer);
  registerTransformer('gemini', GeminiTransformer); // 新增
}
```

3. **更新 Provider 配置**

在数据库中添加支持 gemini 协议的 Provider 配置。

## 优势

1. **N→1→N 架构**: 新增协议只需实现到统一格式的双向转换
2. **可组合**: 支持 Chain 模式，多个 Transformer 可以串联
3. **类型安全**: 完整的 TypeScript 类型支持
4. **易于测试**: 每个 Transformer 可独立测试
5. **渐进式扩展**: 可以逐步添加新协议，不影响现有功能

## 模型组架构

### 核心概念

模型组（Model Group）是对相同能力模型的抽象，解决不同供应商模型命名差异问题。

```
模型组: "gpt-4"
├── 实例1: OpenAI → "gpt-4-turbo"
├── 实例2: Azure → "gpt-4"
├── 实例3: Groq → "llama3-70b-8192" (能力相似)
└── 实例4: Anthropic → "claude-3-opus-20240229" (能力相似)
```

### 数据模型

#### 模型组 (model_groups)

```typescript
interface ModelGroup {
  id: string;
  name: string;              // 唯一标识，如 "gpt-4"
  displayName: string;       // 显示名称
  capabilities: {
    streaming: boolean;
    functionCalling: boolean;
    vision: boolean;
    maxTokens: number;
    contextWindow: number;
  };
  routingConfig: {
    strategy: 'round_robin' | 'weighted' | 'least_latency' | 'priority' | 'cost_optimized' | 'smart';
    fallbackEnabled: boolean;
  };
}
```

#### 模型实例 (model_instances)

```typescript
interface ModelInstance {
  id: string;
  groupId: string;           // 关联模型组
  providerId: string;        // 关联供应商
  actualModelName: string;   // 供应商实际模型名
  weight: number;            // 路由权重
  priority: number;          // 优先级
  costPer1kTokens?: {        // 成本
    input: number;
    output: number;
  };
}
```

### 路由策略

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| round_robin | 轮询选择实例 | 负载均衡 |
| weighted | 按权重选择 | 不同实例性能差异 |
| priority | 按优先级选择 | 主备模式 |
| least_latency | 最低延迟 | 实时性要求 |
| cost_optimized | 成本最优 | 成本控制 |
| smart | 综合评分 | 智能选择 |

### 使用示例

**创建模型组:**
```bash
POST /api/model-groups
{
  "name": "gpt-4",
  "displayName": "GPT-4",
  "capabilities": {
    "streaming": true,
    "functionCalling": true,
    "maxTokens": 8192
  },
  "routingConfig": {
    "strategy": "smart",
    "fallbackEnabled": true
  }
}
```

**添加模型实例:**
```bash
POST /api/model-groups/instances
{
  "groupId": "<group-id>",
  "providerId": "<provider-id>",
  "name": "OpenAI GPT-4 Turbo",
  "actualModelName": "gpt-4-turbo-preview",
  "weight": 100,
  "priority": 0
}
```

**调用:**
```bash
POST /api/v1/chat/completions
{
  "model": "gpt-4",
  "messages": [...]
}
# 自动路由到最优实例
```

## 优势

1. **N→1→N 架构**: 新增协议只需实现到统一格式的双向转换
2. **可组合**: 支持 Chain 模式，多个 Transformer 可以串联
3. **模型抽象**: 模型组屏蔽供应商差异，统一调用接口
4. **智能路由**: 6种路由策略满足不同场景需求
5. **类型安全**: 完整的 TypeScript 类型支持
6. **渐进式扩展**: 可以逐步添加新协议和新模型

## 未来扩展

- [ ] 添加 Gemini、Vertex AI 等更多协议支持
- [ ] 实现流式响应的实时转换
- [ ] 添加自定义 Transformer 插件机制
- [ ] 支持意图识别 (Intent Router) Transformer
- [ ] 添加缓存 Transformer
- [ ] 模型组健康检查和自动故障转移
- [ ] 实时成本统计和预算控制
