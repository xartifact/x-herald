export interface SchemaCleanConfig {
  cleanEnabled: boolean;
  preserveFields?: string[];
  additionalBannedFields?: string[];
}

const DEFAULT_BANNED_FIELDS = new Set([
  '$schema',
  '$id',
  '$ref',
  '$defs',
  'definitions',
  '$comment',
]);

/**
 * 清理 JSON Schema，移除部分不完整实现 OpenAI 兼容协议的 provider 无法识别的元数据字段。
 * 默认不清理（透明透传）；需在 model instance 的 schemaConfig.cleanEnabled=true 时才启用。
 */
export function cleanSchemaForOpenAI(
  schema: unknown,
  config?: SchemaCleanConfig
): unknown {
  if (!config?.cleanEnabled) {
    return schema;
  }

  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const bannedFields = new Set([...DEFAULT_BANNED_FIELDS]);

  if (config.additionalBannedFields) {
    config.additionalBannedFields.forEach(field => bannedFields.add(field));
  }

  if (config.preserveFields) {
    config.preserveFields.forEach(field => bannedFields.delete(field));
  }

  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    if (bannedFields.has(key)) {
      continue;
    }

    if (key === 'properties' && typeof value === 'object' && value !== null) {
      cleaned[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([prop, propSchema]) => [
          prop,
          cleanSchemaForOpenAI(propSchema, config),
        ])
      );
    } else if (key === 'items' && typeof value === 'object') {
      cleaned[key] = cleanSchemaForOpenAI(value, config);
    } else if (key === 'additionalProperties' && typeof value === 'object') {
      cleaned[key] = cleanSchemaForOpenAI(value, config);
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
}
