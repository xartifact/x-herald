import { memo } from 'react'

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { BrainCircuit } from 'lucide-react'

import { DynamicSourceHandle } from './DynamicSourceHandle'

interface IntentData {
  label?: string
  intentConfig?: {
    categories?: string[]
    classifier?: { providerId?: string; modelName?: string }
  }
  _connectedHandles?: string[]
  _handleTargets?: Record<string, string>
  [key: string]: unknown
}

function IntentNodeComponent({ data }: NodeProps<Node<IntentData>>) {
  const categories = data.intentConfig?.categories ?? []
  const connectedHandles = data._connectedHandles ?? []
  const handleTargets = data._handleTargets ?? {}

  const totalHandles = categories.length + 1
  const minWidth = Math.max(160, totalHandles * 80 + 32)

  return (
    <div
      className="rounded-lg border-2 border-violet-500 bg-violet-50 px-4 py-3 pb-10 shadow-sm relative"
      style={{ minWidth: `${minWidth}px` }}
    >
      <Handle type="target" position={Position.Top} className="!bg-violet-500 !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <BrainCircuit className="h-4 w-4 text-violet-600" />
        <span className="text-xs font-semibold text-violet-600 uppercase">意图路由</span>
      </div>
      <div className="mt-1 text-sm font-medium text-violet-900">{data.label || '意图路由'}</div>
      {categories.length > 0 && (
        <div className="mt-1 text-xs text-muted-foreground truncate max-w-[180px]">
          {categories.length} 个分类
        </div>
      )}

      {categories.map((category, i) => {
        const handleId = `handle-${category}`
        const isConnected = connectedHandles.includes(handleId)
        const targetLabel = handleTargets[handleId]
        return (
          <DynamicSourceHandle
            key={category}
            id={handleId}
            label={isConnected && targetLabel ? `${category} → ${targetLabel}` : category}
            color="violet"
            position={i}
            total={totalHandles}
            connected={isConnected}
          />
        )
      })}

      <DynamicSourceHandle
        id="handle-default"
        label={
          connectedHandles.includes('handle-default') && handleTargets['handle-default']
            ? `默认 → ${handleTargets['handle-default']}`
            : '默认'
        }
        color="violet"
        position={categories.length}
        total={totalHandles}
        connected={connectedHandles.includes('handle-default')}
      />
    </div>
  )
}

export const IntentNode = memo(IntentNodeComponent)
