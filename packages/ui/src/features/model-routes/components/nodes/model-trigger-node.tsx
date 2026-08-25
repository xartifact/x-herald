import { memo } from 'react'

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { Network } from 'lucide-react'

interface ModelTriggerData {
  label: string
  modelName: string
  [key: string]: unknown
}

function ModelTriggerNodeComponent({ data }: NodeProps<Node<ModelTriggerData>>) {
  // label = displayName || name（人类可读名称）
  // modelName = name（接入的上游模型标识）
  const name = data.label
  const modelName = data.modelName
  return (
    <div className="rounded-lg border-2 border-blue-500 bg-blue-500/15 px-4 py-3 shadow-sm min-w-[160px]">
      <div className="flex items-center gap-2">
        <Network className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase">
          请求入口
        </span>
      </div>
      <div className="mt-1 font-mono text-sm font-medium text-blue-900 dark:text-blue-100 truncate max-w-[180px]">
        {name}
      </div>
      <div className="text-[11px] font-mono text-blue-700/70 dark:text-blue-300/70 truncate max-w-[180px]">
        {modelName}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !w-3 !h-3" />
    </div>
  )
}

export const ModelTriggerNode = memo(ModelTriggerNodeComponent)
