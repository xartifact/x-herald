import type { UiSchema } from '@rjsf/utils'
import { IntentNodeDataSchema } from '@xartifact/x-herald-shared'

import { zodToRjsfSchema } from '../zod-to-rjsf'

/**
 * 意图节点 Schema（Zod 派生）
 *
 * intentConfig.classifier.categories 从表单里省略——它由编译器在 compile-flow
 * 阶段用节点自身的 intentConfig.categories 回填（见 canvas-route-engine 对
 * classifier.categories 的合并逻辑），不需要用户在分类器子表单里重复填写。
 */
export const intentSchema = zodToRjsfSchema(IntentNodeDataSchema, {
  omit: ['intentConfig.classifier.categories'],
  titles: {
    label: '显示名称',
    intentConfig: '意图配置',
    'intentConfig.categories': '分类列表',
    'intentConfig.classifier': '分类器（可选）',
    'intentConfig.classifier.providerId': 'Provider',
    'intentConfig.classifier.modelName': '模型',
    'intentConfig.classifier.historyWindow': '对话历史窗口',
  },
  descriptions: {
    'intentConfig.categories': '每个分类将生成画布上一个 handle，拖线到目标节点定义路由',
    'intentConfig.classifier.historyWindow':
      '喂给分类器的最近 N 条 user/assistant 消息（不含 system），默认 10，范围 1-100',
  },
  defaults: {
    label: '意图路由',
  },
})

export const intentUiSchema: UiSchema = {
  intentConfig: {
    categories: {
      'ui:field': 'CategoryListField',
    },
    classifier: {
      providerId: {
        'ui:widget': 'RemoteSelectWidget',
        'ui:options': {
          remoteSource: 'providers',
          placeholder: '选择供应商',
          allowClear: true,
        },
      },
      modelName: {
        'ui:widget': 'RemoteSelectWidget',
        'ui:options': {
          dependsOn: 'providerId',
          remoteSource: 'model-instances',
          filterParams: { providerId: 'providerId' },
          placeholder: '选择模型实例',
          allowClear: true,
          searchable: true,
          lazy: true,
          pageSize: 30,
        },
      },
    },
  },
}
