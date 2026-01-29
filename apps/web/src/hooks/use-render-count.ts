/**
 * 渲染指示器 Hook
 * 用于开发环境监控组件渲染次数
 */

import { useEffect, useRef } from 'react';

interface RenderInfo {
  componentName: string;
  renderCount: number;
  lastRenderTime: number;
}

// 全局渲染统计
const renderStats = new Map<string, RenderInfo>();

// 检查是否为开发环境
const isDev = process.env.NODE_ENV === 'development';

export function useRenderCount(componentName: string, logToConsole = false) {
  // 生产环境直接返回 0，不执行任何逻辑
  if (!isDev) {
    return 0;
  }

  const renderCount = useRef(0);
  const mountTime = useRef(Date.now());

  useEffect(() => {
    renderCount.current += 1;
    const now = Date.now();

    // 更新全局统计
    renderStats.set(componentName, {
      componentName,
      renderCount: renderCount.current,
      lastRenderTime: now,
    });

    if (logToConsole) {
      const timeSinceMount = now - mountTime.current;
      console.log(
        `%c[Render] ${componentName}`,
        'color: #10b981; font-weight: bold',
        `#${renderCount.current}`,
        `(${timeSinceMount}ms since mount)`
      );
    }
  });

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
  console.group('%c📊 渲染统计', 'color: #3b82f6; font-weight: bold; font-size: 14px');
  console.table(
    stats.map((stat) => ({
      组件: stat.componentName,
      渲染次数: stat.renderCount,
      最后渲染: new Date(stat.lastRenderTime).toLocaleTimeString(),
    }))
  );
  console.groupEnd();
}
