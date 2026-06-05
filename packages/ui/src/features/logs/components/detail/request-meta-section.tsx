'use client'

import { ChevronRight } from 'lucide-react'
import { Badge } from '../../../../shared/components/ui/badge'
import type { Log } from '@x-llm-gateway/shared'
import { InfoRow, Section } from './log-info-row'

interface RequestMetaSectionProps {
  log: Log
  isPending: boolean
  isSuccess: boolean
}

export function RequestMetaSection({ log, isPending, isSuccess }: RequestMetaSectionProps) {
  return (
    <Section title="基本信息">
      <InfoRow
        label="状态"
        value={
          <div className="flex items-center gap-2">
            <span className={isPending ? 'text-amber-600' : isSuccess ? 'text-green-600' : 'text-red-600'}>
              {isPending ? '请求中' : isSuccess ? '成功' : '失败'}
            </span>
            {!isPending && log.statusCode != null && (
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{log.statusCode}</code>
            )}
          </div>
        }
      />
      <InfoRow label="模型" value={log.modelName} mono />
      {log.originalModelName && log.originalModelName !== log.modelName && (
        <InfoRow label="原始模型" value={log.originalModelName} mono />
      )}
      <InfoRow label="供应商" value={log.providerName || '-'} />
      {log.providerId && <InfoRow label="供应商ID" value={log.providerId} copyable mono />}
      <InfoRow label="虚拟密钥" value={log.virtualKeyName || '-'} copyable mono />
      {log.virtualKeyId && <InfoRow label="密钥ID" value={log.virtualKeyId} copyable mono />}
      {log.incomingProtocol && log.targetProtocol && (
        <InfoRow
          label="协议转换"
          value={
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[10px] font-mono">{log.incomingProtocol}</Badge>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <Badge variant="outline" className="text-[10px] font-mono">{log.targetProtocol}</Badge>
            </div>
          }
        />
      )}
    </Section>
  )
}
