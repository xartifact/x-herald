'use client'

import type { Node } from '@xyflow/react'
import { Network } from 'lucide-react'

import { Badge } from '../../../../shared/components/ui/badge'

interface VmNodeData {
  modelName?: string;
  label?: string;
  [key: string]: unknown;
}

interface VmPropertiesProps {
  node: Node<VmNodeData>;
}

export function VmProperties({ node }: VmPropertiesProps) {
  const modelName = node.data.modelName ?? '';
  const label = node.data.label ?? '';
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-blue-600 font-semibold text-sm">
        <Network className="h-4 w-4" />
        <span>接入模型入口</span>
      </div>

      <div className="space-y-2">
        <div>
          <p className="text-xs text-muted-foreground mb-1">模型名称</p>
          <p className="text-sm font-mono font-medium">{modelName}</p>
        </div>
        {label && label !== modelName && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">显示名称</p>
            <p className="text-sm">{label}</p>
          </div>
        )}
      </div>

      <div className="pt-2 border-t">
        <Badge variant="outline" className="text-xs">只读节点</Badge>
        <p className="text-xs text-muted-foreground mt-1.5">
          接入模型节点由系统生成，不可在画布中修改。
          <br />在"接入模型"管理页面管理。
        </p>
      </div>
    </div>
  )
}
