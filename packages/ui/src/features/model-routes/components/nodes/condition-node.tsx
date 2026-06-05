'use client'

import { memo } from 'react'

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { GitBranch } from 'lucide-react'

interface ConditionData {
  label: string
  field: string
  operator: string
  value: string
  [key: string]: unknown
}

function ConditionNodeComponent({ data }: NodeProps<Node<ConditionData>>) {
  return (
    <div className="rounded-lg border-2 border-amber-500 bg-amber-50 px-4 py-3 shadow-sm min-w-[180px]">
      <Handle type="target" position={Position.Top} className="!bg-amber-500 !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-amber-600" />
        <span className="text-xs font-semibold text-amber-600 uppercase">条件</span>
      </div>
      <div className="mt-1 text-sm text-amber-900">
        {data.label || `${data.field} ${data.operator} ${data.value}`}
      </div>
      <div className="flex justify-between mt-2">
        <div className="text-xs text-green-600">True</div>
        <div className="text-xs text-red-600">False</div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        className="!bg-green-500 !w-3 !h-3 !left-[30%]"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        className="!bg-red-500 !w-3 !h-3 !left-[70%]"
      />
    </div>
  )
}

export const ConditionNode = memo(ConditionNodeComponent)
