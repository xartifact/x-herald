# 模型组使用指南

## 快速开始

### 1. 创建供应商

首先创建你的 LLM 供应商:

```bash
POST /api/providers
{
  "name": "openai",
  "apiKey": "sk-...",
  "protocols": {
    "openai": {
      "enabled": true,
      "baseUrl": "https://api.openai.com/v1"
    }
  }
}
```

### 2. 创建模型组

创建一个抽象的模型组:

```bash
POST /api/model-groups
{
  "name": "gpt-4",
  "displayName": "GPT-4",
  "description": "GPT-4 系列模型",
  "capabilities": {
    "streaming": true,
    "functionCalling": true,
    "vision": false,
    "jsonMode": true,
    "maxTokens": 8192,
    "contextWindow": 128000
  },
  "routingConfig": {
    "strategy": "smart",
    "fallbackEnabled": true
  }
}
```

### 3. 添加模型实例

将供应商的实际模型添加到模型组:

```bash
POST /api/model-groups/instances
{
  "groupId": "<model-group-id>",
  "providerId": "<provider-id>",
  "name": "OpenAI GPT-4 Turbo",
  "actualModelName": "gpt-4-turbo-preview",
  "description": "OpenAI GPT-4 Turbo",
  "weight": 100,
  "priority": 0,
  "costPer1kTokens": {
    "input": 0.01,
    "output": 0.03
  }
}
```

### 4. 调用模型

现在可以通过模型组名称调用:

```bash
POST /api/v1/chat/completions
Authorization: Bearer <virtual-key>
{
  "model": "gpt-4",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ]
}
```

Gateway 会自动根据路由策略选择最优实例。

## 多供应商配置示例

### 场景: GPT-4 多供应商备份

```
模型组: gpt-4
├── 实例1: OpenAI (priority: 0, weight: 50)
├── 实例2: Azure OpenAI (priority: 1, weight: 50)
└── 实例3: Groq (priority: 2, weight: 100)
```

**配置:**

```bash
# 创建 OpenAI 实例 (主)
POST /api/model-groups/instances
{
  "groupId": "<gpt-4-group-id>",
  "providerId": "<openai-provider-id>",
  "name": "OpenAI GPT-4",
  "actualModelName": "gpt-4-turbo",
  "priority": 0,
  "weight": 50
}

# 创建 Azure 实例 (备)
POST /api/model-groups/instances
{
  "groupId": "<gpt-4-group-id>",
  "providerId": "<azure-provider-id>",
  "name": "Azure GPT-4",
  "actualModelName": "gpt-4",
  "priority": 1,
  "weight": 50
}

# 创建 Groq 实例 (低成本备选)
POST /api/model-groups/instances
{
  "groupId": "<gpt-4-group-id>",
  "providerId": "<groq-provider-id>",
  "name": "Groq Llama3-70B",
  "actualModelName": "llama3-70b-8192",
  "priority": 2,
  "weight": 100,
  "costPer1kTokens": {
    "input": 0.0005,
    "output": 0.0015
  }
}
```

**路由策略:**

- **priority**: 优先使用 OpenAI，失败时切换到 Azure，最后使用 Groq
- **weighted**: 按权重分配流量 (OpenAI:Azure 1:1，Groq 2倍流量)
- **smart**: 综合考虑健康状态、成本、延迟

## 路由策略详解

### round_robin (轮询)

按顺序循环选择实例，适合负载均衡。

```json
{
  "routingConfig": {
    "strategy": "round_robin",
    "fallbackEnabled": true
  }
}
```

### weighted (权重)

按配置权重分配流量。

```json
{
  "routingConfig": {
    "strategy": "weighted",
    "fallbackEnabled": true,
    "params": {
      "weights": {
        "instance-id-1": 70,
        "instance-id-2": 30
      }
    }
  }
}
```

### priority (优先级)

按优先级选择，数字越小优先级越高。

```json
{
  "routingConfig": {
    "strategy": "priority",
    "fallbackEnabled": true
  }
}
```

### least_latency (最少延迟)

优先选择延迟最低的实例。

```json
{
  "routingConfig": {
    "strategy": "least_latency",
    "fallbackEnabled": true,
    "params": {
      "latencyThreshold": 1000
    }
  }
}
```

### cost_optimized (成本优化)

选择成本最低的实例。

```json
{
  "routingConfig": {
    "strategy": "cost_optimized",
    "fallbackEnabled": true,
    "params": {
      "costThreshold": 0.05
    }
  }
}
```

### smart (智能)

综合评分选择最优实例，考虑:
- 健康状态 (30分)
- 权重 (20分)
- 优先级 (10分)
- 成本 (20分)

```json
{
  "routingConfig": {
    "strategy": "smart",
    "fallbackEnabled": true
  }
}
```

## API 参考

### 模型组管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/model-groups | 获取所有模型组 |
| GET | /api/model-groups/:id | 获取模型组详情 |
| POST | /api/model-groups | 创建模型组 |
| PUT | /api/model-groups/:id | 更新模型组 |
| DELETE | /api/model-groups/:id | 删除模型组 |
| PATCH | /api/model-groups/:id/toggle | 切换启用状态 |

### 模型实例管理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/model-groups/instances | 创建实例 |
| PUT | /api/model-groups/instances/:id | 更新实例 |
| DELETE | /api/model-groups/instances/:id | 删除实例 |
| PATCH | /api/model-groups/instances/:id/toggle | 切换启用状态 |

## 最佳实践

1. **模型命名**: 使用简洁、有意义的模型组名称，如 "gpt-4"、"claude-3-opus"
2. **成本配置**: 为每个实例配置 `costPer1kTokens`，便于成本优化
3. **健康检查**: 定期运行健康检查，自动标记异常实例
4. **权限控制**: 通过 Virtual Key 的 `allowedModels` 限制可访问的模型组
5. **监控**: 关注路由决策日志，了解流量分布
