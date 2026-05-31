'use client'

import { Badge } from '@x-llm-gateway/ui'
import { CLIENT_REGISTRY } from '@x-llm-gateway/engine'
import type { Log } from '@/hooks/use-logs'

import { InfoRow, Section } from './log-info-row'

interface MetadataRequestSectionsProps {
  log: Log
}

export function MetadataRequestSections({ log }: MetadataRequestSectionsProps) {
  return (
    <>
      <Section title="请求信息">
        <InfoRow label="方法" value={log.requestMethod || '-'} mono />
        <InfoRow label="路径" value={<span className="text-xs break-all">{log.requestPath || '-'}</span>} copyable mono />
        <InfoRow label="客户端 IP" value={log.clientIp || '-'} copyable mono />
        <InfoRow label="客户端" value={
          <div className="space-y-1">
            <Badge variant="secondary" className="text-xs font-normal">
              {log.clientType ? (CLIENT_REGISTRY[log.clientType] ?? log.clientType) : '未知客户端'}
            </Badge>
            {log.userAgent && log.userAgent !== 'unknown' && (
              <div className="text-xs text-muted-foreground break-all font-mono">{log.userAgent}</div>
            )}
          </div>
        } />
        <InfoRow label="请求 ID" value={<span className="text-xs break-all">{log.id}</span>} copyable mono />
        <InfoRow label="创建时间" value={new Date(log.createdAt).toLocaleString('zh-CN', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        })} mono />
      </Section>
    </>
  )
}