'use client'

import { useEffect, useState } from 'react'

import type { Node } from '@xyflow/react'
import { Ban } from 'lucide-react'

import { Label } from '../../../../shared/components/ui/label'
import { Textarea } from '../../../../shared/components/ui/textarea'

interface RejectNodeData {
  reason?: string;
  [key: string]: unknown;
}

interface RejectPropertiesProps {
  node: Node<RejectNodeData>;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
}

export function RejectProperties({ node, onUpdate }: RejectPropertiesProps) {
  const [reason, setReason] = useState(node.data.reason ?? '')

  useEffect(() => {
    setReason(node.data.reason ?? '')
  }, [node.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-red-600 font-semibold text-sm">
        <Ban className="h-4 w-4" />
        <span>拒绝节点配置</span>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">拒绝原因</Label>
        <Textarea
          value={reason}
          onChange={e => {
            setReason(e.target.value)
            onUpdate(node.id, { ...node.data, reason: e.target.value })
          }}
          placeholder="请求被拒绝的原因（可选）"
          rows={3}
          className="text-sm resize-none"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        请求到达此节点时将返回 403 错误，并携带上述原因信息。
      </p>
    </div>
  )
}
