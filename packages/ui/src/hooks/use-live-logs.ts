import { useEffect, useRef, useCallback, useState } from 'react';

import type { LiveStreamEvent } from '@x-llm-gateway/shared';

export interface LiveStreamItem {
  id: string;
  event: LiveStreamEvent;
  timestamp: number;
}

export function useLiveLogs(enabled = true) {
  const [logs, setLogs] = useState<LiveStreamItem[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!enabled) return;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/logs/live`);
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as LiveStreamEvent;
        setLogs(prev => [...prev.slice(-499), { id: data.logId, event: data, timestamp: Date.now() }]);
      } catch { /* ignore parse errors */ }
    };
    
    ws.onclose = () => {
      setTimeout(() => connect(), 3000);
    };
    
    wsRef.current = ws;
  }, [enabled]);

  useEffect(() => {
    connect();
    return () => { wsRef.current?.close(); };
  }, [connect]);

  return { logs, clear: () => setLogs([]) };
}
