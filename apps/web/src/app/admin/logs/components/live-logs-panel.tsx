'use client';

import { useEffect, useState } from 'react';

import { Activity, Brain, ChevronDown, Clock, Copy, ExternalLink, Layers, X, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { useLiveLogs, type LiveStreamItem } from '@/hooks/use-live-logs';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card';

const API_BASE = '/api';

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}` };
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}分${Math.floor((ms % 60_000) / 1000)}秒`;
}

const STUCK_THRESHOLD_MS = 30_000;

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={handleCopy} className="text-muted-foreground hover:text-foreground transition-colors" title="复制">
      <Copy className={`h-3 w-3 ${copied ? 'text-green-500' : ''}`} />
    </button>
  );
}

function StreamCard({ item }: { item: LiveStreamItem }) {
  const [elapsedMs, setElapsedMs] = useState(item.elapsedMs);
  const [isCancelling, setIsCancelling] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - item.startTime);
    }, 200);
    return () => clearInterval(interval);
  }, [item.startTime]);

  const displayName = item.originalModelName ?? item.modelName;
  const isWaiting = item.status === 'waiting';
  const isStuck = isWaiting && elapsedMs > STUCK_THRESHOLD_MS;

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsCancelling(true);
    try {
      const res = await fetch(`${API_BASE}/logs/live/${item.logId}/cancel`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('已取消请求');
      } else {
        toast.error(data.error || '取消失败');
      }
    } catch {
      toast.error('取消失败');
    } finally {
      setIsCancelling(false);
    }
  };

  const borderClass = isStuck
    ? 'border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20'
    : 'bg-card';

  return (
    <div className={`rounded-lg border text-sm ${borderClass}`}>
      <div
        className="flex cursor-pointer items-center gap-3 px-4 py-3 select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="relative flex h-2 w-2 shrink-0">
          {isStuck ? (
            <>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </>
          ) : isWaiting ? (
            <>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
            </>
          ) : (
            <>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </>
          )}
        </span>

        <span className="min-w-0 flex-1 truncate font-medium" title={displayName}>
          {displayName}
        </span>

        <span className="text-muted-foreground shrink-0 text-xs">{item.providerName}</span>

        {item.virtualKeyName && (
          <Badge variant="secondary" className="shrink-0 text-xs">
            {item.virtualKeyName}
          </Badge>
        )}

        {item.hasThinking && (
          <Brain className="h-3.5 w-3.5 shrink-0 text-violet-500" />
        )}

        {isWaiting ? (
          <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">等待响应</span>
        ) : (
          <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <Zap className="h-3 w-3" />
            <span>{item.outputTokens} tok</span>
          </div>
        )}

        <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{formatElapsed(elapsedMs)}</span>
        </div>

        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
        />

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
          disabled={isCancelling}
          onClick={handleCancel}
          title="取消请求"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {expanded && (
        <div className="border-t px-4 pb-3 pt-2">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="font-medium">请求 ID</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="truncate" title={item.logId}>{item.logId}</span>
              <CopyButton value={item.logId} />
            </div>

            <span className="text-muted-foreground font-medium">协议</span>
            <Badge variant="outline" className="w-fit px-1.5 py-0 text-[10px]">
              {item.incomingProtocol}
            </Badge>

            {item.modelName !== item.originalModelName && item.originalModelName && (
              <>
                <span className="text-muted-foreground font-medium">路由模型</span>
                <span className="truncate text-muted-foreground" title={item.modelName}>{item.modelName}</span>
              </>
            )}

            {!isWaiting && (
              <>
                <span className="text-muted-foreground font-medium">输出 Tokens</span>
                <div className="flex items-center gap-1">
                  <Zap className="h-3 w-3 text-muted-foreground" />
                  <span>{item.outputTokens}</span>
                </div>

                <span className="text-muted-foreground font-medium">Chunks</span>
                <div className="flex items-center gap-1">
                  <Layers className="h-3 w-3 text-muted-foreground" />
                  <span>{item.totalChunks}</span>
                </div>
              </>
            )}

            {isStuck && (
              <>
                <span className="col-span-2 mt-1 rounded bg-red-100 px-2 py-1 text-red-700 dark:bg-red-950/40 dark:text-red-400">
                  已等待 {formatElapsed(elapsedMs)}，可能卡住
                </span>
              </>
            )}
          </dl>
          <div className="mt-2 flex justify-end border-t pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); router.push(`/admin/logs?detail=${item.logId}`, { scroll: false }); }}
            >
              <ExternalLink className="h-3 w-3" />
              查看详情
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function LiveLogsPanel() {
  const streams = useLiveLogs();

  if (streams.size === 0) return null;

  return (
    <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20">
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
          <Activity className="h-4 w-4" />
          实时请求
          <Badge variant="secondary" className="text-xs">
            {streams.size}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pb-3 max-h-[200px] overflow-y-auto">
        {Array.from(streams.values()).map((item) => (
          <StreamCard key={item.logId} item={item} />
        ))}
      </CardContent>
    </Card>
  );
}
