import type { UiSchema } from '@rjsf/utils'
import { CapabilityNodeDataSchema } from '@xartifact/x-herald-shared'

import { zodToRjsfSchema } from '../zod-to-rjsf'

const CAPABILITIES = [
  { value: 'vision', label: '视觉 (vision)' },
  { value: 'audio', label: '音频 (audio)' },
  { value: 'video', label: '视频 (video)' },
  { value: 'tool_use', label: '工具调用 (tool_use)' },
  { value: 'tts', label: '语音合成 (tts)' },
]

/**
 * 能力节点 Schema（Zod 派生 + capabilities 数组项 enum 注入）
 *
 * capabilityConfig.capabilities 在 shared Zod 中是自由 string[]，
 * 面板侧用 itemEnums 注入受支持的能力枚举以驱动 MultiCheckboxWidget。
 */
export const capabilitySchema = zodToRjsfSchema(CapabilityNodeDataSchema, {
  titles: {
    label: '显示名称',
    capabilityConfig: '能力配置',
    'capabilityConfig.capabilities': '能力列表',
  },
  descriptions: {
    'capabilityConfig.capabilities': '勾选的能力将生成画布上对应 handle',
  },
  defaults: {
    label: '能力路由',
  },
  itemEnums: {
    'capabilityConfig.capabilities': CAPABILITIES.map((c) => c.value),
  },
})

export const capabilityUiSchema: UiSchema = {
  capabilityConfig: {
    capabilities: {
      'ui:widget': 'MultiCheckboxWidget',
      'ui:options': {
        enumOptions: CAPABILITIES,
      },
    },
  },
}
