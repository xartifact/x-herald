'use client'

import type { Node } from '@xyflow/react'
import { MousePointerClick } from 'lucide-react'

import { ConditionProperties } from './condition-properties'
import { RejectProperties } from './reject-properties'
import { TargetProperties } from './target-properties'
import { VmProperties } from './vm-properties'

interface PropertyPanelProps {
  selectedNode: Node | null
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void
}

export function PropertyPanel({ selectedNode, onUpdate }: PropertyPanelProps) {
  if (!selectedNode) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
        <MousePointerClick className="h-8 w-8 mb-3 opacity-40" />
        <p className="text-sm font-medium">选择节点</p>
        <p className="text-xs mt-1">点击画布中的节点查看和编辑配置</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      {selectedNode.type === 'modelTrigger' && <VmProperties node={selectedNode} />}
      {selectedNode.type === 'condition' && (
        <ConditionProperties node={selectedNode} onUpdate={onUpdate} />
      )}
      {selectedNode.type === 'target' && (
        <TargetProperties node={selectedNode} onUpdate={onUpdate} />
      )}
      {(selectedNode.type === 'reject' || selectedNode.type === 'fallback') && (
        <RejectProperties node={selectedNode} onUpdate={onUpdate} />
      )}
    </div>
  )
}
