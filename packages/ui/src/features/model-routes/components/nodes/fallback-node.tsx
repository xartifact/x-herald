import { memo } from 'react'

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { ShieldHalf, ArrowDown, ShieldCheck } from 'lucide-react'

interface FallbackNodeData {
  label: string
  description?: string
  [key: string]: unknown
}

/**
 * 降级链（主备链）节点 — 双 source handle
 *
 *  - handle-primary：主出口（左侧源柄）
 *  - handle-backup： 备份出口（右侧源柄）
 *  - 出口节点由 edges 连接，无限制（任意叶子节点）
 *
 * 渲染尺寸：240px 宽以容纳两个把手
 */
function FallbackNodeComponent({ data }: NodeProps<Node<FallbackNodeData>>) {
  const label = data.label || '降级链'

  return (
    <div className="rounded-lg border-2 border-purple-500 bg-purple-50 px-4 py-3 shadow-sm min-w-[180px] max-w-[260px]">
      <Handle type="target" position={Position.Top} className="!bg-purple-500 !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <ShieldHalf className="h-4 w-4 text-purple-600" />
        <span className="text-xs font-semibold text-purple-600 uppercase">{label}</span>
      </div>
      {data.description && <div className="mt-1 text-xs text-purple-700">{data.description}</div>}
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
        <div className="flex items-center gap-1 rounded bg-white/70 px-2 py-1">
          <ShieldHalf className="h-3 w-3 text-purple-600" />
          <span className="font-medium text-purple-700">主</span>
        </div>
        <div className="flex items-center gap-1 rounded bg-white/70 px-2 py-1">
          <ShieldCheck className="h-3 w-3 text-purple-600" />
          <span className="font-medium text-purple-700">备</span>
        </div>
      </div>
      {/* 主出口：左下 */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="handle-primary"
        style={{ left: '25%' }}
        className="!bg-purple-500 !w-3 !h-3"
      />
      <div
        className="mt-2 text-[10px] text-purple-600 font-medium"
        style={{ textAlign: 'left', paddingLeft: '8%' }}
      >
        <ArrowDown className="inline h-3 w-3 mr-1" />
        PRIMARY
      </div>
      {/* 备出口：右下 */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="handle-backup"
        style={{ left: '75%' }}
        className="!bg-purple-500 !w-3 !h-3"
      />
      <div
        className="text-[10px] text-purple-600 font-medium"
        style={{ textAlign: 'right', paddingRight: '8%' }}
      >
        <ArrowDown className="inline h-3 w-3 mr-1" />
        BACKUP
      </div>
    </div>
  )
}

export const FallbackNode = memo(FallbackNodeComponent)
