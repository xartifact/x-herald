import { memo } from 'react'

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { Sparkles } from 'lucide-react'

import { DynamicSourceHandle } from './DynamicSourceHandle'

interface CapabilityData {
  label?: string
  capabilityConfig?: {
    capabilities?: string[]
  }
  _connectedHandles?: string[]
  _handleTargets?: Record<string, string>
  [key: string]: unknown
}

function CapabilityNodeComponent({ data }: NodeProps<Node<CapabilityData>>) {
  const capabilities = data.capabilityConfig?.capabilities ?? []
  const connectedHandles = data._connectedHandles ?? []
  const handleTargets = data._handleTargets ?? {}

  const totalHandles = capabilities.length + 1
  const minWidth = Math.max(160, totalHandles * 80 + 32)

  return (
    <div
      className="rounded-lg border-2 border-cyan-500 bg-cyan-50 px-4 py-3 pb-10 shadow-sm relative"
      style={{ minWidth: `${minWidth}px` }}
    >
      <Handle type="target" position={Position.Top} className="!bg-cyan-500 !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-cyan-600" />
        <span className="text-xs font-semibold text-cyan-600 uppercase">能力路由</span>
      </div>
      <div className="mt-1 text-sm font-medium text-cyan-900">{data.label || '能力路由'}</div>
      {capabilities.length > 0 && (
        <div className="mt-1 text-xs text-muted-foreground truncate max-w-[180px]">
          {capabilities.join(', ')}
        </div>
      )}

      {capabilities.map((cap, i) => {
        const handleId = `handle-${cap}`
        const isConnected = connectedHandles.includes(handleId)
        const targetLabel = handleTargets[handleId]
        return (
          <DynamicSourceHandle
            key={cap}
            id={handleId}
            label={isConnected && targetLabel ? `${cap} → ${targetLabel}` : cap}
            color="cyan"
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
        color="cyan"
        position={capabilities.length}
        total={totalHandles}
        connected={connectedHandles.includes('handle-default')}
      />
    </div>
  )
}

export const CapabilityNode = memo(CapabilityNodeComponent)
