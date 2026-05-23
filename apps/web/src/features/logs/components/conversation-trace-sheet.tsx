'use client'

import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Clock, Loader2, XCircle, X } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/core/lib/utils'
import { useConversationTrace } from '@/hooks/use-conversation-trace'
import type { ConversationAttempt, ConversationRound } from '@/hooks/log-types'

interface ConversationTraceSheetProps {
  conversationId: string | null | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatMs(ms: number | null | undefined) {
  if (ms == null) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`
}

function StatusIcon({ status }: { status: ConversationRound['status'] }) {
  if (status === 'success') return <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
  if (status === 'failure') return <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
  return <Loader2 className="h-4 w-4 text-yellow-500 animate-spin flex-shrink-0" />
}

function AttemptRow({ attempt }: { attempt: ConversationAttempt }) {
  const isSuccess = attempt.status === 'success'
  const isFailure = attempt.status === 'failure'

  return (
    <div className={cn(
      'flex items-center gap-3 px-3 py-2 rounded text-xs',
      isSuccess && 'bg-green-50 dark:bg-green-950/20',
      isFailure && 'bg-red-50 dark:bg-red-950/20',
      !isSuccess && !isFailure && 'bg-muted/50'
    )}>
      <span className="text-muted-foreground w-4 text-center font-mono">{attempt.candidateIndex}</span>
      <span className="flex-1 font-medium">{attempt.providerName ?? '未知 Provider'}</span>
      {attempt.failoverReason && (
        <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
          {attempt.failoverReason}
        </Badge>
      )}
      {attempt.statusCode && (
        <span className="text-muted-foreground font-mono">{attempt.statusCode}</span>
      )}
      <div className="flex gap-2 text-muted-foreground">
        {attempt.ttfbMs != null && (
          <span>TTFB {formatMs(attempt.ttfbMs)}</span>
        )}
        <span>{formatMs(attempt.durationMs)}</span>
      </div>
    </div>
  )
}

function RoundCard({ round, index }: { round: ConversationRound; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const hasFailover = round.attempts.length > 1

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left"
      >
        <StatusIcon status={round.status} />
        <span className="text-xs text-muted-foreground font-mono w-5 flex-shrink-0">#{index + 1}</span>
        <span className="flex-1 text-sm font-medium truncate">{round.modelName}</span>
        {hasFailover && (
          <Badge variant="secondary" className="text-xs flex-shrink-0">
            {round.attempts.length} 次尝试
          </Badge>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
          <span>{round.inputTokens + round.outputTokens} tokens</span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatMs(round.responseTimeMs)}
          </span>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-1.5 border-t bg-muted/10">
          {round.errorMessage && (
            <div className="flex items-start gap-2 py-2 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span>{round.errorMessage}</span>
            </div>
          )}
          <div className="pt-1 space-y-1">
            {round.attempts.map((attempt) => (
              <AttemptRow key={attempt.id} attempt={attempt} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function ConversationTraceSheet({ conversationId, open, onOpenChange }: ConversationTraceSheetProps) {
  const { data, isLoading } = useConversationTrace(conversationId)
  const rounds = data?.data ?? []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-full md:w-[560px] md:max-w-[560px] p-0 flex flex-col" hideCloseButton>
        <SheetTitle className="sr-only">对话链路追踪</SheetTitle>
        <SheetDescription className="sr-only">查看完整对话中每轮请求和 Failover 链路</SheetDescription>

        <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold">对话链路追踪</h2>
            {conversationId && (
              <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate max-w-[380px]">
                {conversationId}
              </p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1 px-4 py-3">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : rounds.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <p className="text-sm">未找到该对话的请求记录</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-3">共 {rounds.length} 轮请求</p>
              {rounds.map((round, i) => (
                <RoundCard key={round.id} round={round} index={i} />
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
