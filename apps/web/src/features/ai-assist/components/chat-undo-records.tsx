import { Undo2 } from 'lucide-react'

import { Badge } from '@x-llm-gateway/ui'
import { Button } from '@x-llm-gateway/ui'

import type { ActionRecord } from './chat-types'

interface ChatUndoRecordsProps {
  records: ActionRecord[]
  onUndo: (record: ActionRecord, index: number) => void
}

export function ChatUndoRecords({ records, onUndo }: ChatUndoRecordsProps) {
  if (records.length === 0) return null

  return (
    <div className="px-4 py-2 border-t space-y-1.5">
      <p className="text-xs text-muted-foreground font-medium">操作记录</p>
      {records.map((record, i) => (
        <div key={i} className="flex items-center justify-between gap-2 text-xs bg-muted/50 rounded px-2 py-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <Badge variant="outline" className="text-[10px] h-4 shrink-0">已应用</Badge>
            <span className="truncate text-muted-foreground">{record.explanation}</span>
          </div>
          <Button
            variant="ghost" size="icon" className="h-5 w-5 shrink-0"
            onClick={() => onUndo(record, i)}
            title="撤销此次修改"
          >
            <Undo2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  )
}
