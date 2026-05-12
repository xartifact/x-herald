import { useQuery } from '@tanstack/react-query';

const API_BASE = '/api/metrics';

async function fetchJson<T>(url: string): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : null;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export interface InstanceSummary {
  instanceId: string;
  instanceName: string | null;
  groupId: string | null;
  groupName: string | null;
  providerId: string | null;
  providerName: string | null;
  bucketStart: string | null;
  sampleCount: number;
  successRate: number | null;
  ttfbAvg: number | null;
  ttfbP50: number | null;
  ttfbP95: number | null;
  ttfbP99: number | null;
  /** 总响应时间均值（首字节到完整响应结束） */
  latencyAvg: number | null;
  /** 总响应时间 P95 */
  latencyP95: number | null;
  ttftAvg: number | null;
  ttftP95: number | null;
  tpsAvg: number | null;
  avgInputTokens: number | null;
  avgOutputTokens: number | null;
  baselineTtfbP95: number | null;
  baselineSuccessRate: number | null;
  totalSamples24h: number | null;
  anomalyScore: number | null;
  anomalyLevel: 'normal' | 'warning' | 'critical';
}

export interface TimeseriesPoint {
  bucketStart: string;
  sampleCount: number;
  successRate: number | null;
  ttfbAvg: number | null;
  ttfbP50: number | null;
  ttfbP95: number | null;
  latencyAvg: number | null;
  latencyP95: number | null;
  ttftAvg: number | null;
  ttftP95: number | null;
  tpsAvg: number | null;
  tpsP50: number | null;
}

export interface TimeseriesBaseline {
  ttfbP95: number | null;
  latencyP95: number | null;
  tpsAvg: number | null;
  successRate: number | null;
}

export interface ProviderQuality {
  providerId: string | null;
  providerName: string | null;
  instanceCount: number;
  totalRequests: number;
  avgSuccessRate: number;
  avgTtfb: number;
  ttfbP95: number | null;
  avgTps: number | null;
  /** 总响应时间均值 */
  avgLatency: number | null;
  avgRetryRate: number | null;
  qualityScore: number;
}

export interface MetricsSummary {
  recentHour: {
    totalRequests: number;
    avgSuccessRate: number | null;
    avgTtfbP95: number | null;
    activeInstances: number;
  };
  daily: { totalRequests: number; activeInstances: number };
  anomalyCount: number;
}

export function useMetricsSummary() {
  return useQuery<MetricsSummary>({
    queryKey: ['metrics', 'summary'],
    queryFn: () => fetchJson(`${API_BASE}/summary`),
    refetchInterval: 60_000,
  });
}

export function useInstancesSummary() {
  return useQuery<{ data: InstanceSummary[] }>({
    queryKey: ['metrics', 'instances'],
    queryFn: () => fetchJson(`${API_BASE}/instances`),
    refetchInterval: 60_000,
  });
}

export function useInstanceTimeseries(instanceId: string, period = '6h') {
  return useQuery<{ instanceId: string; period: string; data: TimeseriesPoint[]; baseline: TimeseriesBaseline | null }>({
    queryKey: ['metrics', 'timeseries', instanceId, period],
    queryFn: () => fetchJson(`${API_BASE}/instances/${instanceId}/timeseries?period=${period}`),
    enabled: !!instanceId,
    refetchInterval: 60_000,
  });
}

export function useProviderQuality() {
  return useQuery<{ data: ProviderQuality[] }>({
    queryKey: ['metrics', 'providers', 'quality'],
    queryFn: () => fetchJson(`${API_BASE}/providers/quality`),
    refetchInterval: 60_000,
  });
}
