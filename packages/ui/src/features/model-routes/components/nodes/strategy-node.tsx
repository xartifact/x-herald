import { memo } from 'react'

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { Ban, ArrowDownToLine } from 'lucide-react'

interface StrategyNodeData {
  label: string
  strategyType: 'reject' | 'fallback'
  reason?: string
  description?: string
  [key: string]: unknown
}

const themeConfig = {
  reject: {
    border: 'border-red-500',
    bg: 'bg-red-50',
    text: 'text-red-600',
    handle: '!bg-red-500',
    icon: Ban,
    label: '拒绝',
  },
  fallback: {
    border: 'border-orange-500',
    bg: 'bg-orange-50',
    text: 'text-orange-600',
    handle: '!bg-orange-500',
    icon: ArrowDownToLine,
    label: '兜底拒绝',
  },
} as const

function StrategyNodeComponent({ data }: NodeProps<Node<StrategyNodeData>>) {
  const theme = themeConfig[data.strategyType] ?? themeConfig.reject
  const Icon = theme.icon

  return (
    <div
      className={`rounded-lg border-2 ${theme.border} ${theme.bg} px-4 py-3 shadow-sm min-w-[160px]`}
    >
      <Handle type="target" position={Position.Top} className={`${theme.handle} !w-3 !h-3`} />
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${theme.text}`} />
        <span className={`text-xs font-semibold ${theme.text} uppercase`}>{theme.label}</span>
      </div>
      {(data.reason || data.description) && (
        <div className={`mt-1 text-sm ${theme.text}`}>{data.reason || data.description}</div>
      )}
      <Handle type="source" position={Position.Bottom} className={`${theme.handle} !w-3 !h-3`} />
    </div>
  )
}

export const StrategyNode = memo(StrategyNodeComponent)
