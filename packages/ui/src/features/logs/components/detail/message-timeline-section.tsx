'use client'

import { useState } from 'react'

import { Button } from '../../../../shared/components/ui/button'
import type { LogMetadata } from '@x-llm-gateway/shared'

import { TimelineMessageCard } from './timeline-message-card'

interface MessageTimelineSectionProps {
  messageSequence: LogMetadata['messageSequence']
  messages?: Array<{ role: string; content: unknown }>
  selectedIndices: number[]
  onSelectionChange: (indices: number[]) => void
}

export function MessageTimelineSection({ messageSequence, messages, selectedIndices, onSelectionChange }: MessageTimelineSectionProps) {
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set())

  if (!messageSequence?.roles?.length) {
    return (
      <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
        无消息序列数据
      </div>
    )
  }

  const { totalCount, roles } = messageSequence
  const allIndices = roles.map((r) => r.index)
  const allSelected = allIndices.every((i) => selectedIndices.includes(i))

  const toggleSelected = (index: number) => {
    if (selectedIndices.includes(index)) {
      onSelectionChange(selectedIndices.filter((i) => i !== index))
    } else {
      onSelectionChange([...selectedIndices, index])
    }
  }

  const toggleExpanded = (index: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-muted-foreground">共 {totalCount} 条消息</span>
        <Button
          variant="ghost" size="sm"
          onClick={() => onSelectionChange(allSelected ? [] : allIndices)}
          className="h-6 px-2 text-xs"
        >
          {allSelected ? '取消全选' : '全选'}
        </Button>
      </div>

      {roles.map((roleInfo, idx) => (
        <TimelineMessageCard
          key={idx}
          roleInfo={roleInfo}
          message={messages?.[roleInfo.index - 1]}
          displayState={{ isExpanded: expandedIndices.has(roleInfo.index), isSelected: selectedIndices.includes(roleInfo.index) }}
          onSelect={() => toggleSelected(roleInfo.index)}
          onToggleExpand={() => toggleExpanded(roleInfo.index)}
        />
      ))}
    </div>
  )
}
