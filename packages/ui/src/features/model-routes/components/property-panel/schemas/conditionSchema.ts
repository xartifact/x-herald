import type { UiSchema } from '@rjsf/utils'
import { ConditionNodeDataSchema } from '@xartifact/x-herald-shared'

import { FIELDS, NUMERIC_OPERATORS, STRING_OPERATORS } from '../condition-fields'
import { zodToRjsfSchema } from '../zod-to-rjsf'

const FIELD_VALUES = FIELDS.map((f) => f.value)
const OPERATOR_VALUES = [
  ...new Set([...STRING_OPERATORS, ...NUMERIC_OPERATORS].map((o) => o.value)),
]

/**
 * 条件节点 Schema（Zod 派生 + 画布字段/操作符 enum 注入）
 *
 * field / operator 在 shared Zod 中是自由 string（匹配 RouteCondition），
 * 面板侧注入受支持的 enum 以驱动 SelectWidget。
 */
export const conditionSchema = zodToRjsfSchema(ConditionNodeDataSchema, {
  titles: {
    label: '显示名称',
    field: '匹配字段',
    operator: '操作符',
    value: '值',
  },
  defaults: {
    label: '条件',
  },
  enums: {
    field: FIELD_VALUES,
    operator: OPERATOR_VALUES,
  },
})

const OPERATOR_OPTIONS = [
  ...STRING_OPERATORS,
  ...NUMERIC_OPERATORS.filter((o) => !STRING_OPERATORS.some((s) => s.value === o.value)),
]

export const conditionUiSchema: UiSchema = {
  field: {
    'ui:options': {
      enumNames: FIELDS.map((f) => f.label),
    },
  },
  operator: {
    'ui:options': {
      enumNames: OPERATOR_OPTIONS.map((o) => o.label),
    },
  },
  value: {
    'ui:options': {
      placeholder: '18,19,20,21,22 或 gpt-4',
    },
  },
}
