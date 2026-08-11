import type { UiSchema } from '@rjsf/utils'
import { FallbackNodeDataSchema } from '@xartifact/x-llm-gateway-shared'

import { zodToRjsfSchema } from '../zod-to-rjsf'

/**
 * 降级链（主备链）节点 Schema
 *
 * 配置项：label / description
 * 主/备出口通过画布 edges 连接（handle-primary / handle-backup），不在面板编辑
 */
export const fallbackSchema = zodToRjsfSchema(FallbackNodeDataSchema, {
  titles: {
    label: '显示名称',
    description: '描述',
  },
  defaults: {
    label: '降级链',
  },
})

export const fallbackUiSchema: UiSchema = {
  description: {
    'ui:widget': 'TextareaWidget',
    'ui:options': {
      rows: 2,
      placeholder: '选填：此降级链的用途说明',
    },
  },
}
