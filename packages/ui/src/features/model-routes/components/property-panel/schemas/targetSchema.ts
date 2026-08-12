import type { UiSchema } from '@rjsf/utils'
import { TargetNodeDataSchema } from '@xartifact/x-herald-shared'

import { zodToRjsfSchema } from '../zod-to-rjsf'

/**
 * 暴露给测试用例做对齐校验 — 顺序必须与 packages/shared/.../node-data.ts
 * 中 ActionTypeSchema 的枚举顺序保持一致（详见该文件顶部注释）。
 */
export const ACTION_TYPES = [
  { value: 'route_to_group', label: '路由到模型组' },
  { value: 'route_to_instance', label: '路由到实例' },
  { value: 'route_to_access_model', label: '路由到接入模型' },
  { value: 'route_to_virtual_model', label: '路由到虚拟模型（废弃）' },
]

export const targetSchema = zodToRjsfSchema(TargetNodeDataSchema, {
  titles: {
    label: '显示名称',
    actionType: '动作类型',
    targetId: '目标 ID',
    targetName: '目标名称',
  },
  defaults: {
    label: '目标',
    actionType: 'route_to_group',
  },
})

export const targetUiSchema: UiSchema = {
  actionType: {
    'ui:widget': 'RemoteSelectWidget',
    'ui:options': {
      enumNames: ACTION_TYPES.map((a) => a.label),
      allowClear: false,
    },
  },
  targetId: {
    'ui:widget': 'RemoteSelectWidget',
    'ui:options': {
      dependsOn: 'actionType',
      remoteSourceMap: {
        route_to_group: 'model-groups',
        route_to_instance: 'model-instances',
        route_to_access_model: 'access-models',
        // 旧名 deprecated — 历史上等价于 access-models（构建时已归一）
        route_to_virtual_model: 'access-models',
      },
      searchable: true,
      lazy: true,
      pageSize: 30,
    },
  },
  targetName: {
    'ui:widget': 'hidden',
  },
}
