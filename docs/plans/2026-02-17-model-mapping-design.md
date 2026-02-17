# 模型映射功能设计文档

## 背景

当前系统的模型路由仅支持精确匹配和别名匹配。当客户端请求的模型不存在时，直接返回错误。本功能添加三级匹配机制，在模型不存在时自动映射到默认模型，提高系统的容错能力和灵活性。

## 目标

- 支持三级匹配策略：精确匹配 → 别名匹配 → 默认模型组 fallback
- 透明转发，客户端无感知
- 与现有模型组系统兼容

## 设计概述

### 匹配流程

```
客户端请求模型 "gpt-5"
    ↓
1. 精确匹配 → 查找 name="gpt-5" 的模型组
    ↓ 未找到
2. 别名匹配 → 查找 aliases 包含 "gpt-5" 的模型组
    ↓ 未找到
3. 全局默认 → 使用 config.modelMapping.defaultModelGroup
    ↓
路由到模型组的实际实例
```

### 核心组件

#### 1. 配置扩展

**文件**: `src/core/config/schema.ts`

```typescript
export interface GatewayConfig {
  // ... 现有配置
  modelMapping: ModelMappingConfig;
}

export interface ModelMappingConfig {
  enabled: boolean;          // 是否启用模型映射
  defaultModelGroup: string; // 全局默认模型组名称（必须是存在的模型组名）
}
```

**默认配置**:
```yaml
modelMapping:
  enabled: true
  defaultModelGroup: "claude-3-sonnet"  # 示例，部署时配置
```

#### 2. 映射服务

**文件**: `src/features/gateway/services/model-mapping.ts`

```typescript
export interface ModelMappingResult {
  modelName: string;        // 映射后的模型名称
  isMapped: boolean;        // 是否发生了映射
  originalModel: string;    // 原始请求的模型名称
  mappingType: 'exact' | 'alias' | 'fallback' | null;
}

export class ModelMappingService {
  /**
   * 解析模型名称，支持三级匹配
   */
  async resolveModel(
    requestedModel: string,
    virtualKeyId?: string
  ): Promise<ModelMappingResult>;

  /**
   * 验证默认模型组配置是否有效
   */
  validateDefaultModelGroup(): Promise<boolean>;
}
```

**匹配逻辑**:
1. 检查 `modelMapping.enabled`，如为 false 直接返回原模型名
2. 调用 `modelGroupRouter.findModelGroup()` 尝试精确/别名匹配
3. 如未找到，返回配置的 `defaultModelGroup`
4. 记录映射日志（用于监控 fallback 频率）

#### 3. 集成点

**文件**: `src/features/gateway/services/model-group-router.ts`

修改 `route()` 方法，在查找模型组前调用映射服务:

```typescript
async route(context: RoutingContext): Promise<RouteResult> {
  // 1. 解析模型名称（支持 fallback）
  const mappingResult = await modelMappingService.resolveModel(
    context.requestedModel,
    context.virtualKeyId
  );

  // 2. 使用映射后的模型名查找模型组
  const group = await this.findModelGroup(mappingResult.modelName);
  // ... 后续逻辑不变
}
```

#### 4. 日志记录

在 `request_logs` 表中记录映射信息:
- `modelName`: 实际使用的模型（映射后的）
- 新增字段 `originalModelName`: 客户端请求的原始模型
- 在 metadata 中记录 `mappingType`

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| 默认模型组未配置 | 启动时警告，fallback 功能禁用 |
| 默认模型组不存在 | 启动时报错，阻止服务启动 |
| 循环映射风险 | 映射只进行一次，不会递归 fallback |

## 安全考虑

1. **虚拟密钥权限检查**: 映射后的模型仍需通过 `virtualKey.allowedModels` 权限检查
2. **防止滥用**: 记录 fallback 频率，监控是否有恶意请求不存在的模型

## 性能影响

- 映射服务增加一次数据库查询（查找模型组）
- 可添加内存缓存（可选优化，首期可不实现）

## 验收标准

- [ ] 请求存在的模型，正常路由（精确匹配）
- [ ] 请求模型别名，正常路由（别名匹配）
- [ ] 请求不存在的模型，自动 fallback 到默认模型组
- [ ] 禁用映射功能时，请求不存在模型返回错误
- [ ] 默认模型组不存在时，服务启动失败并给出明确错误
- [ ] 日志中正确记录原始模型名和映射类型

## 相关文件

- `src/core/config/schema.ts` - 配置扩展
- `src/core/config/loader.ts` - 配置加载
- `src/features/gateway/services/model-mapping.ts` - 新增映射服务
- `src/features/gateway/services/model-group-router.ts` - 集成映射服务
- `src/features/gateway/services/chat-completion-handler.ts` - 日志记录
- `src/features/logs/db.ts` - 日志表字段扩展
