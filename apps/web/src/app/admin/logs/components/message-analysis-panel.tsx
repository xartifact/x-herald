'use client'

import { useState } from 'react'

import { Bot, ChevronDown, ChevronRight, Loader2, RotateCcw } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface MessageAnalysisPanelProps {
  logId: string
  selectedIndices: number[]
}

type AnalysisStatus = 'idle' | 'loading' | 'streaming' | 'done' | 'error'

export function MessageAnalysisPanel({ logId, selectedIndices }: MessageAnalysisPanelProps) {
  const [status, setStatus] = useState<AnalysisStatus>('idle')
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(true)

  const hasSelection = selectedIndices.length > 0
  const isActive = status !== 'idle'

  async function handleAnalyze() {
    setStatus('loading')
    setResult('')
    setError('')
    setExpanded(true)

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : ''
      const response = await fetch(`/api/logs/${logId}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify(hasSelection ? { indices: selectedIndices } : {}),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string }
        setError(data.error ?? `请求失败 (${response.status})`)
        setStatus('error')
        return
      }

      setStatus('streaming')

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let text = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const chunk = line.slice(6).trim()
          if (chunk === '[DONE]') continue
          try {
            const parsed = JSON.parse(chunk) as {
              error?: string
              choices?: Array<{ delta?: { content?: string } }>
            }
            if (parsed.error) {
              setError(parsed.error)
              setStatus('error')
              return
            }
            const delta = parsed.choices?.[0]?.delta?.content
            if (delta) {
              text += delta
              setResult(text)
            }
          } catch {
            // skip malformed SSE chunk
          }
        }
      }

      setStatus('done')
    } catch {
      setError('请求失败，请检查网络连接')
      setStatus('error')
    }
  }

  return (
    <div className="border-b">
      <div className="px-4 py-2.5 bg-muted/30 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-purple-500" />
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
              onClick={handleAnalyze}
              className="h-7 px-2 text-xs gap-1"
            >
              <RotateCcw className="h-3 w-3" />
              重新分析
            </Button>
          )}
          <Button
            size="sm"
            onClick={status === 'idle' || status === 'error' ? handleAnalyze : undefined}
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
        <div className="px-4 py-3 bg-purple-50/30 dark:bg-purple-950/10">
          {status === 'error' ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <div className="text-sm whitespace-pre-wrap leading-relaxed">
              {result || (status === 'loading' ? '正在连接模型...' : '')}
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
