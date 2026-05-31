'use client'

import { Badge } from '../../ui/badge'
import type { Log } from '@x-llm-gateway/shared'

import { InfoRow, Section } from './log-info-row'

interface MetadataRequestSectionsProps {
  log: Log
  resolveClientType?: (clientType: string) => string
}

export function MetadataRequestSections({ log, resolveClientType }: MetadataRequestSectionsProps) {
  return (
    <>
      <Section title="请求信息">
        <InfoRow label="方法">{log.requestMethod || '-'}</InfoRow>
        <InfoRow label="路径">
          <span className="text-xs break-all">{log.requestPath || '-'}</span>
        </InfoRow>
        <InfoRow label="客户端 IP">{log.clientIp || '-'}</InfoRow>
        <InfoRow label="客户端">
          <div className="space-y-1">
            <Badge variant="secondary" className="text-xs font-normal">
              {log.clientType ? (resolveClientType ? resolveClientType(log.clientType) : log.clientType) : '未知客户端'}
            </Badge>
            {log.userAgent && log.userAgent !== 'unknown' && (
              <div className="text-xs text-muted-foreground break-all font-mono">{log.userAgent}</div>
            )}
          </div>
        </InfoRow>
        <InfoRow label="请求 ID">
          <span className="text-xs break-all">{log.id}</span>
        </InfoRow>
        <InfoRow label="创建时间">
          {new Date(log.createdAt).toLocaleString('zh-CN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
          })}
        </InfoRow>
      </Section>
    </>
  )
}
