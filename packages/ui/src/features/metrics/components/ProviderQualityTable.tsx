import { RefreshCw, Trophy } from 'lucide-react';

import { Button } from '../../../shared/components/ui';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../shared/components/ui';

import { useProviderQuality } from '../hooks/use-metrics';

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
      <span className={`text-sm font-bold font-mono ${scoreColor(score)}`}>
        {score.toFixed(0)}
      </span>
    </div>
  );
}

export function ProviderQualityTable() {
  const { data, isLoading, refetch } = useProviderQuality();
  const providers = data?.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-yellow-500" />
          <CardTitle>供应商质量排名（近24小时）</CardTitle>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>供应商</TableHead>
              <TableHead className="text-right">质量评分</TableHead>
              <TableHead className="text-right">成功率</TableHead>
              <TableHead className="text-right">TTFB avg</TableHead>
              <TableHead className="text-right">TTFB P95</TableHead>
              <TableHead className="text-right">TPS</TableHead>
              <TableHead className="text-right">请求数</TableHead>
              <TableHead className="text-right">实例数</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  加载中…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && providers.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  暂无数据
                </TableCell>
              </TableRow>
            )}
            {providers.map((p, i) => (
              <TableRow key={p.providerId ?? p.providerName ?? i}>
                <TableCell className="text-muted-foreground font-mono">{i + 1}</TableCell>
                <TableCell className="font-medium">{p.providerName ?? p.providerId ?? '—'}</TableCell>
                <TableCell>
                  <ScoreBar score={p.qualityScore} />
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmtPct(p.avgSuccessRate)}
                </TableCell>
                <TableCell className="text-right font-mono">{fmtMs(p.avgTtfb)}</TableCell>
                <TableCell className="text-right font-mono">{fmtMs(p.ttfbP95)}</TableCell>
                <TableCell className="text-right font-mono">
                  {p.avgTps != null ? `${p.avgTps.toFixed(1)} t/s` : '—'}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {p.totalRequests.toLocaleString()}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {p.instanceCount}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
