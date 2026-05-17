'use client';

import { useEffect, useState } from 'react';

import { Activity, Brain, Clock, X, Zap } from 'lucide-react';
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

const STUCK_THRESHOLD_MS = 30_000; // 30秒视为"卡住"

function StreamCard({ item }: { item: LiveStreamItem }) {
  const [elapsedMs, setElapsedMs] = useState(item.elapsedMs);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - item.startTime);
    }, 200);
    return () => clearInterval(interval);
  }, [item.startTime]);

  const displayName = item.originalModelName ?? item.modelName;
  const isWaiting = item.status === 'waiting';
  const isStuck = isWaiting && elapsedMs > STUCK_THRESHOLD_MS;

  const handleCancel = async () => {
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

  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${isStuck ? 'border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20' : 'bg-card'}`}>
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
        <Brain className="text-violet-500 h-3.5 w-3.5 shrink-0" />
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
