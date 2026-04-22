'use client'

import { memo } from 'react'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Layers, Server } from 'lucide-react'

interface TargetData {
  label: string
  targetType: 'virtual_model' | 'model_group' | 'model_instance'
  targetName: string
  ruleName?: string
  [key: string]: unknown
}

function TargetNodeComponent({ data }: NodeProps) {
  const nodeData = data as TargetData
  const isGroup = nodeData.targetType === 'model_group' || nodeData.targetType === 'virtual_model'

  return (
    <div className="rounded-lg border-2 border-green-500 bg-green-50 px-4 py-3 shadow-sm min-w-[160px]">
      <Handle type="target" position={Position.Top} className="!bg-green-500 !w-3 !h-3" />
      <div className="flex items-center gap-2">
        {isGroup ? (
          <Layers className="h-4 w-4 text-green-600" />
        ) : (
          <Server className="h-4 w-4 text-green-600" />
        )}
        <span className="text-xs font-semibold text-green-600 uppercase">
          {nodeData.targetType === 'virtual_model' ? '虚拟模型' :
           nodeData.targetType === 'model_group' ? '模型组' : '实例'}
        </span>
      </div>
      {nodeData.ruleName && (
        <div className="text-xs text-muted-foreground truncate max-w-[180px]">
          {nodeData.ruleName}
        </div>
      )}
      <div className="mt-1 text-sm font-medium text-green-900">
        {nodeData.targetName || nodeData.label}
      </div>
    </div>
  )
}

export const TargetNode = memo(TargetNodeComponent)
