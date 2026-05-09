'use client';

import { useState } from 'react';

import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';

import { Button } from '@/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/table';

import type { InstanceSummary } from '../hooks/use-metrics';
import { useInstancesSummary } from '../hooks/use-metrics';
import { AnomalyBadge } from './AnomalyBadge';
import { InstancePerfChart } from './InstancePerfChart';

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function fmtTps(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v.toFixed(1)} t/s`;
}

function successRateColor(rate: number | null): string {
  if (rate == null) return '';
  if (rate >= 0.95) return 'text-green-600';
  if (rate >= 0.8) return 'text-yellow-600';
  return 'text-red-600';
}

function ttfbColor(ms: number | null): string {
  if (ms == null) return '';
  if (ms < 3000) return 'text-green-600';
  if (ms < 10000) return 'text-yellow-600';
  return 'text-red-600';
}

export function InstancePerfTable() {
  const { data, isLoading, refetch } = useInstancesSummary();
  const [expanded, setExpanded] = useState<string | null>(null);

  const instances = data?.data ?? [];

  const toggle = (id: string) => setExpanded((prev) => (prev === id ? null : id));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>实例性能</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>实例</TableHead>
              <TableHead>供应商</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">TTFB P95</TableHead>
              <TableHead className="text-right">延迟 P95</TableHead>
              <TableHead className="text-right">成功率</TableHead>
              <TableHead className="text-right">TPS</TableHead>
              <TableHead className="text-right">基线 TTFB</TableHead>
              <TableHead className="text-right">样本</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  加载中…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && instances.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  暂无数据，等待首次聚合（约5分钟）
                </TableCell>
              </TableRow>
            )}
            {instances.map((inst: InstanceSummary) => (
              <>
                <TableRow
                  key={inst.instanceId}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => toggle(inst.instanceId)}
                >
                  <TableCell>
                    {expanded === inst.instanceId
                      ? <ChevronDown className="h-4 w-4" />
                      : <ChevronRight className="h-4 w-4" />}
                  </TableCell>
                  <TableCell className="font-medium">
                    {inst.instanceName ?? inst.instanceId.slice(0, 8)}
                    {inst.groupName && (
                      <span className="text-xs text-muted-foreground ml-1">({inst.groupName})</span>
                    )}
                  </TableCell>
                  <TableCell>{inst.providerName ?? '—'}</TableCell>
                  <TableCell>
                    <AnomalyBadge level={inst.anomalyLevel} score={inst.anomalyScore} />
                  </TableCell>
                  <TableCell className={`text-right font-mono ${ttfbColor(inst.ttfbP95)}`}>
                    {fmtMs(inst.ttfbP95)}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${ttfbColor(inst.latencyP95)}`}>
                    {fmtMs(inst.latencyP95)}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${successRateColor(inst.successRate)}`}>
                    {fmtPct(inst.successRate)}
                  </TableCell>
                  <TableCell className="text-right font-mono">{fmtTps(inst.tpsAvg)}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {fmtMs(inst.baselineTtfbP95)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {inst.sampleCount.toLocaleString()}
                  </TableCell>
                </TableRow>
                {expanded === inst.instanceId && (
                  <TableRow key={`${inst.instanceId}-chart`}>
                    <TableCell colSpan={10} className="bg-muted/30 p-4">
                      <InstancePerfChart
                        instanceId={inst.instanceId}
                        instanceName={inst.instanceName ?? inst.instanceId}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
