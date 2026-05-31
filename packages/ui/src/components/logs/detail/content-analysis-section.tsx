'use client'

import { Badge } from '../../ui/badge'
import type { ContentFeatures } from './extract-content-features'
import { InfoRow, Section } from './log-info-row'

interface ContentAnalysisSectionProps {
  contentFeatures: ContentFeatures | null
}

export function ContentAnalysisSection({ contentFeatures }: ContentAnalysisSectionProps) {
  if (!contentFeatures) return null

  const hasAnyData =
    (contentFeatures.types && contentFeatures.types.length > 0) ||
    contentFeatures.hasFunctionCalling ||
    contentFeatures.messageCount != null ||
    contentFeatures.roleDistribution ||
    contentFeatures.totalLength != null

  if (!hasAnyData) return null

  return (
    <Section title="内容分析">
      {contentFeatures.types && contentFeatures.types.length > 0 && (
        <InfoRow label="内容类型">
          <div className="flex flex-wrap gap-1">
            {contentFeatures.types.map((type, idx) => (
              <Badge key={idx} variant="outline" className="text-xs">{type}</Badge>
            ))}
          </div>
        </InfoRow>
      )}
      {contentFeatures.hasFunctionCalling && (
        <InfoRow label="函数调用"><Badge variant="secondary">是</Badge></InfoRow>
      )}
      {contentFeatures.toolNames && contentFeatures.toolNames.length > 0 && (
        <InfoRow label="工具名称">
          <div className="flex flex-wrap gap-1">
            {contentFeatures.toolNames.map((name, idx) => (
              <Badge key={idx} variant="secondary" className="text-xs font-mono">{name}</Badge>
            ))}
          </div>
        </InfoRow>
      )}
      {contentFeatures.messageCount != null && (
        <InfoRow label="消息数量">{contentFeatures.messageCount}</InfoRow>
      )}
      {contentFeatures.roleDistribution && (
        <InfoRow label="角色分布">
          <div className="flex items-center gap-2 text-xs">
            {Object.entries(contentFeatures.roleDistribution).map(([role, count], idx, arr) => (
              <span key={role}>
                {role}: {count}
                {idx < arr.length - 1 && <span className="text-muted-foreground mx-1">|</span>}
              </span>
            ))}
          </div>
        </InfoRow>
      )}
      {contentFeatures.totalLength != null && contentFeatures.totalLength > 0 && (
        <InfoRow label="总长度">{contentFeatures.totalLength.toLocaleString()} 字符</InfoRow>
      )}
    </Section>
  )
}
