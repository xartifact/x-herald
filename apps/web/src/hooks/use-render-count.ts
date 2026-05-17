/**
 * 渲染指示器 Hook
 * 用于开发环境监控组件渲染次数
 */

import { useEffect, useRef } from 'react';

import { IS_DEVELOPMENT } from '@/core/config/env';

interface RenderInfo {
  componentName: string;
  renderCount: number;
  lastRenderTime: number;
}

// 全局渲染统计
const renderStats = new Map<string, RenderInfo>();

const isDev = IS_DEVELOPMENT;

export function useRenderCount(componentName: string) {
  const renderCount = useRef(0);

  useEffect(() => {
    if (!isDev) return;
    renderCount.current += 1;
    const now = Date.now();
    renderStats.set(componentName, {
      componentName,
      renderCount: renderCount.current,
      lastRenderTime: now,
    });
  });

  if (!isDev) return 0;
  return renderCount.current;
}

/**
 * 获取所有组件的渲染统计
 */
export function getRenderStats(): RenderInfo[] {
  if (!isDev) {
    return [];
  }
  return Array.from(renderStats.values()).sort(
    (a, b) => b.renderCount - a.renderCount
  );
}

/**
 * 重置渲染统计
 */
export function resetRenderStats() {
  if (!isDev) {
    return;
  }
  renderStats.clear();
}

/**
 * 打印渲染统计到控制台
 */
export function printRenderStats() {
  if (!isDev) {
    return;
  }
  const stats = getRenderStats();
  // eslint-disable-next-line no-console
  console.group('%c📊 渲染统计', 'color: #3b82f6; font-weight: bold; font-size: 14px');
  // eslint-disable-next-line no-console
  console.table(stats.map((stat) => ({ 组件: stat.componentName, 渲染次数: stat.renderCount, 最后渲染: new Date(stat.lastRenderTime).toLocaleTimeString() })));
  // eslint-disable-next-line no-console
  console.groupEnd();
}
