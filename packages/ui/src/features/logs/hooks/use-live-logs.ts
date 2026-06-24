'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { logKeys } from './log-types';

// Backend event type (apps/gateway/src/gateway/services/log-event-bus.ts)
type LiveStreamEvent =
  | {
      event: 'waiting';
      logId: string;
      modelName: string;
      originalModelName?: string;
      providerName: string;
      virtualKeyName?: string;
      startTime: number;
      incomingProtocol: string;
    }
  | {
      event: 'started';
      logId: string;
      modelName: string;
      originalModelName?: string;
      providerName: string;
      virtualKeyName?: string;
      startTime: number;
      incomingProtocol: string;
    }
  | {
      event: 'chunk';
      logId: string;
      outputTokens: number;
      totalChunks: number;
      hasThinking: boolean;
      elapsedMs: number;
    }
  | {
      event: 'completed';
      logId: string;
      status: 'success' | 'failure';
      inputTokens: number;
      outputTokens: number;
      responseTimeMs: number;
      thinkingDurationMs?: number;
    }
  | { event: 'aborted'; logId: string; reason?: 'client_disconnect' | 'timeout' | 'cancelled' | 'stale_cleanup' };

export interface LiveStreamItem {
  logId: string;
  modelName: string;
  originalModelName?: string;
  providerName: string;
  virtualKeyName?: string;
  startTime: number;
  incomingProtocol: string;
  outputTokens: number;
  totalChunks: number;
  hasThinking: boolean;
  elapsedMs: number;
  status: 'waiting' | 'streaming';
}

export function useLiveLogs(enabled = true) {
  const [streams, setStreams] = useState<Map<string, LiveStreamItem>>(new Map());
  const queryClient = useQueryClient();
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const connect = useCallback(() => {
    if (!enabled) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const token = localStorage.getItem('admin_token');
    fetch('/api/logs/live', {
      signal: controller.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.body) return;
        const reader = res.body.getReader();
        readerRef.current = reader;
        const decoder = new TextDecoder();
        let buffer = '';

        const pump = (): Promise<void> =>
          reader.read().then(({ done, value }) => {
            if (done) return;
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop() ?? '';

            for (const part of parts) {
              const line = part.trim();
              if (!line.startsWith('data:')) continue;
              const data = line.slice(5).trim();
              try {
                const event = JSON.parse(data) as LiveStreamEvent;
                handleEvent(event);
              } catch {
                // 解析失败跳过
              }
            }
            return pump();
          });

        return pump();
      })
      .catch(() => {
        // 断连后 3s 重连
        if (!controller.signal.aborted) {
          setTimeout(connect, 3000);
        }
      });
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEvent = useCallback(
    (event: LiveStreamEvent) => {
      if (event.event === 'waiting') {
        setStreams((prev) => {
          const next = new Map(prev);
          next.set(event.logId, {
            logId: event.logId,
            modelName: event.modelName,
            originalModelName: event.originalModelName,
            providerName: event.providerName,
            virtualKeyName: event.virtualKeyName,
            startTime: event.startTime,
            incomingProtocol: event.incomingProtocol,
            outputTokens: 0,
            totalChunks: 0,
            hasThinking: false,
            elapsedMs: 0,
            status: 'waiting',
          });
          return next;
        });
      } else if (event.event === 'started') {
        setStreams((prev) => {
          const next = new Map(prev);
          const existing = prev.get(event.logId);
          next.set(event.logId, {
            ...(existing ?? {
              outputTokens: 0,
              totalChunks: 0,
              hasThinking: false,
              elapsedMs: 0,
            }),
            logId: event.logId,
            modelName: event.modelName,
            originalModelName: event.originalModelName,
            providerName: event.providerName,
            virtualKeyName: event.virtualKeyName,
            startTime: event.startTime,
            incomingProtocol: event.incomingProtocol,
            status: 'streaming',
          });
          return next;
        });
      } else if (event.event === 'chunk') {
        setStreams((prev) => {
          const item = prev.get(event.logId);
          if (!item) return prev;
          const next = new Map(prev);
          next.set(event.logId, {
            ...item,
            outputTokens: event.outputTokens,
            totalChunks: event.totalChunks,
            hasThinking: event.hasThinking,
            elapsedMs: event.elapsedMs,
          });
          return next;
        });
      } else if (event.event === 'completed' || event.event === 'aborted') {
        setStreams((prev) => {
          const next = new Map(prev);
          next.delete(event.logId);
          return next;
        });
        // 刷新历史日志列表
        queryClient.invalidateQueries({ queryKey: logKeys.lists() });
      }
    },
    [queryClient]
  );

  useEffect(() => {
    connect();
    return () => {
      abortRef.current?.abort();
      readerRef.current?.cancel().catch(() => {});
    };
  }, [connect]);

  return streams;
}
