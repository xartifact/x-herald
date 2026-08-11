import { z } from 'zod'
import type { RJSFSchema } from '@rjsf/utils'

type JsonSchemaNode = RJSFSchema & {
  properties?: Record<string, JsonSchemaNode>
  items?: JsonSchemaNode
  additionalProperties?: JsonSchemaNode | boolean
}

export interface ZodToRjsfOptions {
  /** 点路径 → title，如 `intentConfig.targetGroupIds` */
  titles?: Record<string, string>
  /** 点路径 → description */
  descriptions?: Record<string, string>
  /** 顶层 property default（仅当 schema 未带 default 时写入）*/
  defaults?: Record<string, unknown>
  /**
   * 从 JSON Schema 中删除的属性路径（不进 RJSF 表单）。
   * 例：`strategyType`、`intentConfig.classifier`
   * formData 中已有字段不会被 RJSF 剔除，仍会随 onChange 透传。
   */
  omit?: string[]
  /** 点路径 → enum 值列表（覆盖 Zod 导出的自由 string） */
  enums?: Record<string, string[]>
  /**
   * 点路径 → 数组项 enum 值列表，即设置 `array.items.enum`（`enums` 只能改标量属性的
   * enum，改不了数组项——例如 `capabilityConfig.capabilities: string[]` 这种多选场景）。
   */
  itemEnums?: Record<string, string[]>
  /**
   * 点路径 → 从生成的 JSON Schema 中移除 `enum`。
   *
   * RJSF v6 的 StringField 会从 `schema.enum` 自动生成 `enumOptions`
   * 并覆盖 widget 的 `ui:options.enumOptions`，导致带 label 的选项被
   * 只有 value 的选项覆盖。对已通过 `ui:options.enumOptions` 提供
   * label 的字段，应在 JSON Schema 中移除 `enum` 以避免冲突。
   */
  stripEnum?: string[]
}

/**
 * Phase 1C: Zod → RJSFSchema 派生
 *
 * 使用 zod v4 原生 `z.toJSONSchema` —— 第三方 `zod-to-json-schema` 包只认识
 * zod v3 的内部 `_def` 结构，遇到 zod v4 schema 会静默退化成空 schema。
 *
 * UiSchema 仍手写；本函数只负责 JSON Schema。
 */
export function zodToRjsfSchema(zodSchema: z.ZodType, options: ZodToRjsfOptions = {}): RJSFSchema {
  const { titles, descriptions, defaults, omit, enums, itemEnums, stripEnum } = options
  const jsonSchema = z.toJSONSchema(zodSchema, { target: 'draft-07' }) as JsonSchemaNode

  // node.data 通过 .passthrough() 保留画布内部字段（routeId / targetType 等），
  // 但这些字段不应作为 RJSF 的"附加属性"渲染给用户编辑；RJSF 默认不会从
  // formData 中剔除 schema 之外的既有字段，所以数据仍会随 onChange 原样透传。
  jsonSchema.additionalProperties = false

  if (omit) {
    for (const path of omit) {
      omitProperty(jsonSchema, path)
    }
  }

  if (titles) {
    for (const [path, title] of Object.entries(titles)) {
      const prop = getProperty(jsonSchema, path)
      if (prop) prop.title = title
    }
  }

  if (descriptions) {
    for (const [path, description] of Object.entries(descriptions)) {
      const prop = getProperty(jsonSchema, path)
      if (prop) prop.description = description
    }
  }

  if (defaults && jsonSchema.properties) {
    for (const [key, value] of Object.entries(defaults)) {
      const prop = jsonSchema.properties[key]
      if (prop && prop.default === undefined) {
        ;(prop as { default: unknown }).default = value
      }
    }
  }

  if (enums) {
    for (const [path, values] of Object.entries(enums)) {
      const prop = getProperty(jsonSchema, path)
      if (prop) {
        prop.enum = values
        // free-form string 字段注入 enum 后不应再保留 type 冲突；RJSF 需要 enum
        if (prop.type === undefined) prop.type = 'string'
      }
    }
  }

  if (itemEnums) {
    for (const [path, values] of Object.entries(itemEnums)) {
      const prop = getProperty(jsonSchema, path)
      if (prop?.items) {
        prop.items.enum = values
        if (prop.items.type === undefined) prop.items.type = 'string'
      }
    }
  }

  if (stripEnum) {
    for (const path of stripEnum) {
      const prop = getProperty(jsonSchema, path)
      if (prop) delete prop.enum
    }
  }

  return jsonSchema
}

function getProperty(schema: JsonSchemaNode, path: string): JsonSchemaNode | undefined {
  const parts = path.split('.')
  let current: JsonSchemaNode | undefined = schema
  for (const part of parts) {
    if (!current?.properties?.[part]) return undefined
    current = current.properties[part]
  }
  return current
}

function omitProperty(schema: JsonSchemaNode, path: string): void {
  const parts = path.split('.')
  if (parts.length === 0) return

  let parent: JsonSchemaNode | undefined = schema
  for (let i = 0; i < parts.length - 1; i++) {
    parent = parent?.properties?.[parts[i]!]
    if (!parent) return
  }

  const key = parts[parts.length - 1]!
  if (parent?.properties && key in parent.properties) {
    delete parent.properties[key]
  }

  if (Array.isArray(parent?.required)) {
    parent.required = parent.required.filter((r) => r !== key)
    if (parent.required.length === 0) delete parent.required
  }
}
