'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

import type { LiveStreamEvent } from '@x-llm-gateway/shared';

export interface LiveStreamItem {
  logId: string;
  modelName: string;
  originalModelName?: string;
  providerName: string;
  virtualKeyName?: string;
  startTime: number;
  incomingProtocol: string;
  status: 'waiting' | 'streaming' | 'completed' | 'aborted';
  outputTokens: number;
  totalChunks: number;
  hasThinking: boolean;
  elapsedMs: number;
}

function createInitialItem(ev: LiveStreamEvent & { event: 'waiting' | 'started' }): LiveStreamItem {
  return {
    logId: ev.logId,
    modelName: ev.modelName,
    originalModelName: ev.originalModelName,
    providerName: ev.providerName,
    virtualKeyName: ev.virtualKeyName,
    startTime: ev.startTime,
    incomingProtocol: ev.incomingProtocol,
    status: 'waiting',
    outputTokens: 0,
    totalChunks: 0,
    hasThinking: false,
    elapsedMs: 0,
  };
}

export function useLiveLogs(enabled = true) {
  const [streams, setStreams] = useState<Map<string, LiveStreamItem>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);

  const updateStream = useCallback((logId: string, updater: (prev: LiveStreamItem) => LiveStreamItem) => {
    setStreams((prev) => {
      const next = new Map(prev);
      const existing = next.get(logId);
      if (!existing) return prev;
      next.set(logId, updater(existing));
      return next;
    });
  }, []);

  const removeStream = useCallback((logId: string) => {
    setStreams((prev) => {
      const next = new Map(prev);
      next.delete(logId);
      return next;
    });
  }, []);

  const connect = useCallback(() => {
    if (!enabled) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/logs/live`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as LiveStreamEvent;
        const now = Date.now();

        switch (data.event) {
          case 'waiting':
          case 'started': {
            setStreams((prev) => {
              const next = new Map(prev);
              if (!next.has(data.logId)) {
                next.set(data.logId, {
                  ...createInitialItem(data),
                  status: data.event === 'started' ? 'streaming' : 'waiting',
                });
              }
              return next;
            });
            break;
          }
          case 'chunk':
            updateStream(data.logId, (prev) => ({
              ...prev,
              outputTokens: data.usage?.completionTokens ?? prev.outputTokens,
              totalChunks: prev.totalChunks + 1,
              hasThinking: prev.hasThinking || !!data.reasoningContent,
              elapsedMs: now - prev.startTime,
            }));
            break;
          case 'completed':
            updateStream(data.logId, (prev) => ({
              ...prev,
              status: 'completed',
              outputTokens: data.totalTokens,
              elapsedMs: data.durationMs,
            }));
            setTimeout(() => removeStream(data.logId), 3000);
            break;
          case 'aborted':
            removeStream(data.logId);
            break;
        }
      } catch { /* ignore parse errors */ }
    };

    ws.onclose = () => {
      setTimeout(() => connect(), 3000);
    };

    wsRef.current = ws;
  }, [enabled, updateStream, removeStream]);

  useEffect(() => {
    connect();
    return () => { wsRef.current?.close(); };
  }, [connect]);

  return streams;
}
