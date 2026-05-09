'use client'

import { useEffect, useState } from 'react'

import type { Node } from '@xyflow/react'
import { Ban } from 'lucide-react'

import { Label } from '@/ui/label'
import { Textarea } from '@/ui/textarea'

interface RejectPropertiesProps {
  node: Node
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void
}

export function RejectProperties({ node, onUpdate }: RejectPropertiesProps) {
  const d = node.data as Record<string, unknown>
  const [reason, setReason] = useState((d.reason as string) || '')

  useEffect(() => {
    setReason((d.reason as string) || '')
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
            onUpdate(node.id, { ...d, reason: e.target.value })
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
