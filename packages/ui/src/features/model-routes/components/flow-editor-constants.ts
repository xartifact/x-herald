import type { NodeType } from '@xartifact/x-llm-gateway-shared'
import { NodeTypeUIRegistry } from './node-type-ui-registry'

const NODE_TYPE_KEYS = Object.keys(NodeTypeUIRegistry) as NodeType[]

export const nodeTypes = Object.fromEntries(
  NODE_TYPE_KEYS.map((type) => [type, NodeTypeUIRegistry[type].component]),
)

export interface NodeTemplate {
  type: NodeType
  label: string
  desc: string
  icon: (typeof NodeTypeUIRegistry)[NodeType]['icon']
  color: string
  defaultData: Record<string, unknown>
}

/**
 * add-node-dialog 的模板列表 —— 派生自 NodeTypeUIRegistry，只包含声明了
 * templateDefaults 的类型（modelTrigger 不可手动添加，由 build-flow 按接入模型自动同步）。
 */
export const NODE_TEMPLATES: NodeTemplate[] = NODE_TYPE_KEYS.flatMap((type) => {
  const entry = NodeTypeUIRegistry[type]
  if (!entry.templateDefaults) return []
  return [
    {
      type,
      label: entry.templateLabel ?? entry.title,
      desc: entry.templateDesc ?? '',
      icon: entry.icon,
      color: entry.colorClassName,
      defaultData: entry.templateDefaults,
    },
  ]
})
