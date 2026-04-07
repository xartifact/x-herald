'use client'

import { memo } from 'react'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Network } from 'lucide-react'

interface ModelTriggerData {
  label: string
  modelName: string
  [key: string]: unknown
}

function ModelTriggerNodeComponent({ data }: NodeProps) {
  const nodeData = data as ModelTriggerData
  return (
    <div className="rounded-lg border-2 border-blue-500 bg-blue-50 px-4 py-3 shadow-sm min-w-[160px]">
      <div className="flex items-center gap-2">
        <Network className="h-4 w-4 text-blue-600" />
        <span className="text-xs font-semibold text-blue-600 uppercase">请求入口</span>
      </div>
      <div className="mt-1 font-mono text-sm font-medium text-blue-900">
        {nodeData.modelName || nodeData.label}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !w-3 !h-3" />
    </div>
  )
}

export const ModelTriggerNode = memo(ModelTriggerNodeComponent)
