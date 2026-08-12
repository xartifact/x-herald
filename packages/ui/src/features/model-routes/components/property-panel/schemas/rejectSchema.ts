import type { UiSchema } from '@rjsf/utils'
import { StrategyNodeDataSchema } from '@xartifact/x-herald-shared'

import { zodToRjsfSchema } from '../zod-to-rjsf'

/**
 * 拒绝 / 兜底拒绝节点 Schema（Zod 派生，reject 与 fallback 共用）
 *
 * strategyType 由节点 type 决定，不在面板编辑。
 */
export const rejectSchema = zodToRjsfSchema(StrategyNodeDataSchema, {
  titles: {
    label: '显示名称',
    reason: '拒绝原因',
  },
  defaults: {
    label: '拒绝',
  },
  omit: ['strategyType'],
})

export const rejectUiSchema: UiSchema = {
  reason: {
    'ui:widget': 'TextareaWidget',
    'ui:options': {
      rows: 3,
      placeholder: '请求被拒绝的原因（可选）',
    },
  },
}
