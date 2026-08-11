import type { UiSchema } from '@rjsf/utils'
import { VmNodeDataSchema } from '@xartifact/x-llm-gateway-shared'

import { zodToRjsfSchema } from '../zod-to-rjsf'

/**
 * 接入模型触发节点 —— Zod 派生（只读展示）
 *
 * 画布上每个 modelTrigger 节点对应一个「接入模型」入口，
 * 路由从该节点开始向下游流转。
 */
export const vmSchema = zodToRjsfSchema(VmNodeDataSchema, {
  titles: {
    label: '显示名称',
    modelName: '模型名',
  },
  defaults: {
    label: '接入模型',
  },
})

export const vmUiSchema: UiSchema = {
  label: { 'ui:readonly': true },
  modelName: { 'ui:readonly': true },
}
