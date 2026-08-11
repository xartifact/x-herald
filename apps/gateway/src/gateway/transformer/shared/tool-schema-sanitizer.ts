const OBJECT_HINT_KEYS = ['properties', 'required', 'additionalProperties'] as const

function looksLikeObjectSchema(node: Record<string, unknown>): boolean {
  return OBJECT_HINT_KEYS.some((key) => key in node)
}

function sanitizeUnionBranch(branch: unknown): unknown {
  const sanitized = sanitizeNode(branch, false)
  if (
    sanitized &&
    typeof sanitized === 'object' &&
    !Array.isArray(sanitized) &&
    !('type' in sanitized) &&
    looksLikeObjectSchema(sanitized as Record<string, unknown>)
  ) {
    return { type: 'object', ...(sanitized as Record<string, unknown>) }
  }
  return sanitized
}

function sanitizeNode(schema: unknown, isRoot: boolean): unknown {
  if (Array.isArray(schema)) return schema.map((item) => sanitizeNode(item, false))
  if (!schema || typeof schema !== 'object') return schema

  const node: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === 'required' && !Array.isArray(value)) continue

    if (key === 'anyOf' || key === 'oneOf') {
      node[key] = Array.isArray(value) ? value.map(sanitizeUnionBranch) : value
    } else if (key === 'properties' && value && typeof value === 'object') {
      node[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([prop, propSchema]) => [
          prop,
          sanitizeNode(propSchema, false),
        ]),
      )
    } else if ((key === 'items' || key === 'additionalProperties' || key === 'allOf') && value) {
      node[key] = sanitizeNode(value, false)
    } else {
      node[key] = value
    }
  }

  // 部分 Provider（如 Moonshot）要求 type 不能与 anyOf/oneOf 同级共存，type 只能出现在分支内部。
  // 根 schema（function.parameters / input_schema）的 type 是硬性要求、不可移除，
  // 因此根节点上与 type 冲突的 anyOf/oneOf 直接丢弃（放弃这层联合校验，保留基础 object 结构）；
  // 非根节点则移除自身 type，改用分支各自的 type（步骤 2 已保证每个分支都有 type）。
  if (('anyOf' in node || 'oneOf' in node) && 'type' in node) {
    if (isRoot) {
      delete node.anyOf
      delete node.oneOf
    } else {
      delete node.type
    }
  }

  return node
}

/**
 * 修复不完全遵循 JSON Schema 规范、部分严格校验的 Provider（如 x.ai、Moonshot）会拒绝的 tool schema 写法：
 * 1. required 字段值不是数组（如 null）时移除该字段
 * 2. anyOf/oneOf 分支缺少 type 但带有 object 特征字段（properties/required/additionalProperties）时补 type: "object"
 * 3. type 与 anyOf/oneOf 同级共存时：根节点丢弃 anyOf/oneOf（根 type 不可移除），非根节点移除自身 type
 * 按供应商协议配置（protocols.<protocol>.toolSchemaSanitization）可选启用，不针对特定供应商硬编码。
 */
export function sanitizeToolSchema(schema: unknown): unknown {
  return sanitizeNode(schema, true)
}

/**
 * 对 OpenAI 格式 tools 数组（{function: {parameters}}）做 schema 归一化。
 * 用于 same-protocol passthrough 路径——该路径不经过 adaptRequest，需单独调用。
 */
export function sanitizeOpenAIToolsArray(tools: unknown[]): unknown[] {
  return tools.map((tool) => {
    if (!tool || typeof tool !== 'object') return tool
    const { function: fn, ...rest } = tool as { function?: { parameters?: unknown } }
    if (!fn?.parameters) return tool
    return { ...rest, function: { ...fn, parameters: sanitizeToolSchema(fn.parameters) } }
  })
}

/**
 * 对 Anthropic 格式 tools 数组（{input_schema}）做 schema 归一化。
 * 用于 same-protocol passthrough 路径——该路径不经过 adaptRequest，需单独调用。
 */
export function sanitizeAnthropicToolsArray(tools: unknown[]): unknown[] {
  return tools.map((tool) => {
    if (!tool || typeof tool !== 'object') return tool
    const { input_schema: inputSchema, ...rest } = tool as { input_schema?: unknown }
    if (!inputSchema) return tool
    return { ...rest, input_schema: sanitizeToolSchema(inputSchema) }
  })
}
