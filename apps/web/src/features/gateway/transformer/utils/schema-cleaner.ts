/**
 * Schema 清理配置
 */
export interface SchemaCleanConfig {
  cleanEnabled: boolean;
  preserveFields?: string[];  // 保留的字段（覆盖默认清理）
  additionalBannedFields?: string[];  // 额外清理的字段
}

/**
 * 默认黑名单字段
 */
const DEFAULT_BANNED_FIELDS = new Set([
  '$schema',
  '$id',
  '$ref',
  '$defs',
  'definitions',
  '$comment',
]);

/**
 * 清理 JSON Schema，移除不兼容 OpenAI API 的元数据字段
 *
 * 保留的字段（OpenAI 规范）：
 * - type, properties, required, description, additionalProperties
 * - enum, format, pattern, minLength, maxLength, minimum, maximum
 * - items（数组类型定义）
 *
 * 移除的字段（元数据）：
 * - $schema, $id, $ref, $defs, definitions, $comment
 *
 * 注意：additionalProperties 是 OpenAI API 推荐/必需的字段（特别是 strict mode）
 *
 * @param schema 要清理的 schema
 * @param config 清理配置（可选，禁用或未提供时返回原 schema）
 */
export function cleanSchemaForOpenAI(
  schema: unknown,
  config?: SchemaCleanConfig
): unknown {
  // 只有明确禁用清理时才跳过
  if (config?.cleanEnabled === false) {
    return schema;
  }

  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  // 构建黑名单
  const bannedFields = new Set([...DEFAULT_BANNED_FIELDS]);

  // 添加额外清理的字段
  if (config?.additionalBannedFields) {
    config.additionalBannedFields.forEach(field => bannedFields.add(field));
  }

  // 移除需要保留的字段
  if (config?.preserveFields) {
    config.preserveFields.forEach(field => bannedFields.delete(field));
  }

  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    // 跳过黑名单字段
    if (bannedFields.has(key)) {
      continue;
    }

    // 递归处理 properties
    if (key === 'properties' && typeof value === 'object' && value !== null) {
      cleaned[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([prop, propSchema]) => [
          prop,
          cleanSchemaForOpenAI(propSchema),
        ])
      );
    }
    // 递归处理 items
    else if (key === 'items' && typeof value === 'object') {
      cleaned[key] = cleanSchemaForOpenAI(value);
    }
    // 递归处理 additionalProperties（如果它是对象 schema）
    else if (key === 'additionalProperties' && typeof value === 'object') {
      cleaned[key] = cleanSchemaForOpenAI(value);
    }
    // 保留其他所有字段
    else {
      cleaned[key] = value;
    }
  }

  return cleaned;
}
