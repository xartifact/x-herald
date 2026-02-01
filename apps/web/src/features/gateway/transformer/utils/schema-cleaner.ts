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
 */
export function cleanSchemaForOpenAI(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  // 黑名单：需要移除的字段（仅包含真正不兼容的元数据）
  const bannedFields = new Set([
    '$schema',
    '$id',
    '$ref',
    '$defs',
    'definitions',
    '$comment',
  ]);

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
