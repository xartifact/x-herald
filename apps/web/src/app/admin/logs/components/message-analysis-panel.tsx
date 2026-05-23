'use client'

import { AlertTriangle, Bot, ChevronDown, ChevronRight, Link, RotateCcw, Shield, ShieldAlert } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/core/lib/utils'

import type { AnalysisMode, AnalysisResult } from './use-message-analysis'
import { useMessageAnalysis } from './use-message-analysis'

interface MessageAnalysisPanelProps {
  logId: string
  selectedIndices: number[]
}

const MODES: { key: AnalysisMode; label: string }[] = [
  { key: 'full', label: '完整对话' },
  { key: 'system', label: '系统提示' },
  { key: 'user', label: '用户意图' },
]

function RatioBar({ label, ratio, colorClass }: { label: string; ratio: number; colorClass: string }) {
  const pct = Math.round(ratio * 100)
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-muted-foreground flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', colorClass)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-muted-foreground font-mono">{pct}%</span>
    </div>
  )
}

function AnalysisResultView({ result }: { result: AnalysisResult }) {
  const { scenario, promptStrategies, tokenBreakdown, signals, mismatch } = result

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-0">
          {scenario}
        </Badge>
        {promptStrategies.map((s) => (
          <Badge key={s} variant="outline" className="text-xs font-mono">{s}</Badge>
        ))}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Token 分布</p>
        <RatioBar label="系统提示" ratio={tokenBreakdown.systemPromptRatio} colorClass="bg-blue-400" />
        <RatioBar label="历史上下文" ratio={tokenBreakdown.contextRatio} colorClass="bg-amber-400" />
        <RatioBar label="本轮输入" ratio={tokenBreakdown.userQueryRatio} colorClass="bg-green-400" />
      </div>

      <div className="flex flex-wrap gap-2">
        {signals.hasPii && (
          <span className="flex items-center gap-1 text-xs text-orange-600">
            <AlertTriangle className="h-3 w-3" />含 PII
          </span>
        )}
        {signals.hasInjectionAttempt && (
          <span className="flex items-center gap-1 text-xs text-red-600">
            <ShieldAlert className="h-3 w-3" />疑似注入
          </span>
        )}
        {signals.hasExternalUrls && (
          <span className="flex items-center gap-1 text-xs text-blue-600">
            <Link className="h-3 w-3" />含外部链接
          </span>
        )}
        {!signals.hasPii && !signals.hasInjectionAttempt && !signals.hasExternalUrls && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <Shield className="h-3 w-3" />无异常信号
          </span>
        )}
        <span className="text-xs text-muted-foreground">语言: {signals.language}</span>
      </div>

      {mismatch && (
        <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded px-2 py-1.5">
          ⚠ {mismatch}
        </div>
      )}
    </div>
  )
}

function AnalysisSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-2.5 w-full rounded-full" />
        <Skeleton className="h-2.5 w-full rounded-full" />
        <Skeleton className="h-2.5 w-full rounded-full" />
      </div>
      <Skeleton className="h-4 w-32 rounded" />
    </div>
  )
}

export function MessageAnalysisPanel({ logId, selectedIndices }: MessageAnalysisPanelProps) {
  const { status, result, error, expanded, setExpanded, handleAnalyze, hasSelection, isActive, activeMode } =
    useMessageAnalysis({ logId, selectedIndices })

  const isProcessing = status === 'loading' || status === 'streaming'

  return (
    <div className="border-b">
      <div className="px-4 py-2.5 bg-muted/30 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-purple-500" />
            <span className="text-sm font-semibold">请求侦探</span>
          </div>
          <div className="flex items-center gap-1.5">
            {status === 'done' && (
              <Button variant="ghost" size="sm" onClick={() => handleAnalyze(activeMode)} className="h-6 px-2 text-xs gap-1">
                <RotateCcw className="h-3 w-3" />
              </Button>
            )}
            {isActive && (
              <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)} className="h-6 w-6 p-0">
                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {MODES.map(({ key, label }) => (
            <Button
              key={key}
              size="sm"
              variant={activeMode === key && isActive ? 'default' : 'outline'}
              disabled={isProcessing}
              onClick={() => handleAnalyze(key)}
              className="h-6 px-2 text-xs"
            >
              {isProcessing && activeMode === key ? '分析中...' : label}
            </Button>
          ))}
          {hasSelection && (
            <Button
              size="sm"
              variant={activeMode === 'selected' && isActive ? 'default' : 'outline'}
              disabled={isProcessing}
              onClick={() => handleAnalyze('selected')}
              className="h-6 px-2 text-xs"
            >
              {isProcessing && activeMode === 'selected' ? '分析中...' : `选中 ${selectedIndices.length} 条`}
            </Button>
          )}
        </div>
      </div>

      {isActive && expanded && (
        <div className="px-4 py-3 bg-purple-50/30 dark:bg-purple-950/10">
          {status === 'error' ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : status === 'loading' || status === 'streaming' ? (
            <AnalysisSkeleton />
          ) : result ? (
            <AnalysisResultView result={result} />
          ) : null}
        </div>
      )}
    </div>
  )
}
