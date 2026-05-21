'use client'

import type { Node } from '@xyflow/react'
import { MousePointerClick, X } from 'lucide-react'

import { Button } from '@x-llm-gateway/ui'

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
      <div className="flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
        <MousePointerClick className="h-6 w-6 mb-2 opacity-40" />
        <p className="text-xs font-medium">选择节点</p>
        <p className="text-[11px] mt-0.5 opacity-70">点击画布中的节点查看配置</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col max-h-[calc(100vh-160px)]">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <h3 className="text-xs font-semibold text-foreground">
          {selectedNode.type === 'modelTrigger' && '虚拟模型'}
          {selectedNode.type === 'condition' && '条件节点'}
          {selectedNode.type === 'target' && '目标节点'}
          {(selectedNode.type === 'reject' || selectedNode.type === 'fallback') && '策略节点'}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-foreground"
          onClick={() => {
            // 点击关闭：模拟点击画布空白处取消选中
            const pane = document.querySelector<HTMLElement>('.react-flow__pane')
            if (pane) pane.click()
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
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
    </div>
  )
}
