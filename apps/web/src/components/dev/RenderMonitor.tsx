'use client';

import { useEffect, useState } from 'react';

import { X, RefreshCw, Printer } from 'lucide-react';

import { getRenderStats, printRenderStats, resetRenderStats } from '@/hooks/use-render-count';
import { Button } from '@x-llm-gateway/ui';
import { Card, CardContent, CardHeader, CardTitle } from '@x-llm-gateway/ui';

interface RenderMonitorProps {
  onClose?: () => void;
}

export default function RenderMonitor({ onClose }: RenderMonitorProps) {
  const [stats, setStats] = useState(getRenderStats());
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    // 每秒更新一次统计
    const interval = setInterval(() => {
      setStats(getRenderStats());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleReset = () => {
    resetRenderStats();
    setStats([]);
  };

  const handlePrint = () => {
    printRenderStats();
  };

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          onClick={() => setIsMinimized(false)}
          variant="outline"
          size="sm"
          className="shadow-lg"
        >
          📊 渲染监控 ({stats.length})
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96">
      <Card className="shadow-2xl border-2">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              📊 渲染监控
              <span className="text-xs font-normal text-muted-foreground">
                ({stats.length} 组件)
              </span>
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handlePrint}
                title="打印到控制台"
              >
                <Printer className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleReset}
                title="重置统计"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setIsMinimized(true)}
                title="最小化"
              >
                <span className="text-xs">−</span>
              </Button>
              {onClose && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={onClose}
                  title="关闭"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-y-auto">
            {stats.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                暂无渲染数据
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium">组件</th>
                    <th className="text-right p-2 font-medium">渲染次数</th>
                    <th className="text-right p-2 font-medium">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((stat, index) => (
                    <tr
                      key={stat.componentName}
                      className={`border-b ${
                        stat.renderCount > 10
                          ? 'bg-red-50 dark:bg-red-950/20'
                          : stat.renderCount > 5
                          ? 'bg-yellow-50 dark:bg-yellow-950/20'
                          : ''
                      }`}
                    >
                      <td className="p-2 font-mono truncate" title={stat.componentName}>
                        {stat.componentName}
                      </td>
                      <td className="p-2 text-right">
                        <span
                          className={`inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 rounded text-xs font-semibold ${
                            stat.renderCount > 10
                              ? 'bg-red-600 text-white'
                              : stat.renderCount > 5
                              ? 'bg-yellow-600 text-white'
                              : 'bg-green-600 text-white'
                          }`}
                        >
                          {stat.renderCount}
                        </span>
                      </td>
                      <td className="p-2 text-right text-muted-foreground">
                        {new Date(stat.lastRenderTime).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="p-2 border-t bg-muted/50 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-green-600"></span>
                <span>≤5</span>
                <span className="inline-block w-2 h-2 rounded-full bg-yellow-600"></span>
                <span>6-10</span>
                <span className="inline-block w-2 h-2 rounded-full bg-red-600"></span>
                <span>&gt;10</span>
              </div>
              <div>总计: {stats.reduce((sum, s) => sum + s.renderCount, 0)} 次</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
