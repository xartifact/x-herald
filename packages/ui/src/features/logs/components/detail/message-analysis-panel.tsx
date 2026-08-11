import { Bot, ChevronDown, ChevronRight, Loader2, RotateCcw } from 'lucide-react'

import { Badge } from '../../../../shared/components/ui/badge'
import { Button } from '../../../../shared/components/ui/button'

import { useMessageAnalysis } from './use-message-analysis'

interface MessageAnalysisPanelProps {
  logId: string
  selectedIndices: number[]
}

export function MessageAnalysisPanel({ logId, selectedIndices }: MessageAnalysisPanelProps) {
  const { status, result, error, expanded, setExpanded, handleAnalyze, hasSelection, isActive } =
    useMessageAnalysis({ logId, selectedIndices })

  return (
    <div className="border-b">
      <div className="px-4 py-2.5 bg-muted/30 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">AI 分析</span>
          {hasSelection && (
            <Badge variant="secondary" className="text-xs">
              已选 {selectedIndices.length} 条
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status === 'done' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleAnalyze('full')}
              className="h-7 px-2 text-xs gap-1"
            >
              <RotateCcw className="h-3 w-3" />
              重新分析
            </Button>
          )}
          <Button
            size="sm"
            onClick={
              status === 'idle' || status === 'error'
                ? () => handleAnalyze(hasSelection ? 'selected' : 'full')
                : undefined
            }
            disabled={status === 'loading' || status === 'streaming'}
            className="h-7 px-3 text-xs gap-1.5"
          >
            {status === 'loading' ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                准备中...
              </>
            ) : status === 'streaming' ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                分析中...
              </>
            ) : hasSelection ? (
              '分析选中消息'
            ) : (
              '分析全部消息'
            )}
          </Button>
          {isActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              className="h-7 w-7 p-0"
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>
      {isActive && expanded && (
        <div className="px-4 py-3 bg-primary/5">
          {status === 'error' ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <div className="text-sm whitespace-pre-wrap leading-relaxed">
              {result
                ? JSON.stringify(result, null, 2)
                : status === 'loading'
                  ? '正在连接模型...'
                  : ''}
              {status === 'streaming' && (
                <span className="inline-block w-1.5 h-4 bg-foreground/70 animate-pulse ml-0.5 align-middle rounded-sm" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
