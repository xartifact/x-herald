'use client'

import { memo } from 'react'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Ban } from 'lucide-react'

interface RejectData {
  label: string
  reason: string
  [key: string]: unknown
}

function RejectNodeComponent({ data }: NodeProps) {
  const nodeData = data as RejectData
  return (
    <div className="rounded-lg border-2 border-red-500 bg-red-50 px-4 py-3 shadow-sm min-w-[140px]">
      <Handle type="target" position={Position.Top} className="!bg-red-500 !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <Ban className="h-4 w-4 text-red-600" />
        <span className="text-xs font-semibold text-red-600 uppercase">拒绝</span>
      </div>
      <div className="mt-1 text-sm text-red-900">
        {nodeData.reason || nodeData.label || '请求被拒绝'}
      </div>
    </div>
  )
}

export const RejectNode = memo(RejectNodeComponent)
