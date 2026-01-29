'use client';

import { useState } from 'react';
import RenderMonitor from './RenderMonitor';
import { Button } from '@/components/ui/button';

/**
 * 开发工具栏
 * 仅在开发环境显示
 */
export default function DevTools() {
  const [showRenderMonitor, setShowRenderMonitor] = useState(false);

  // 仅在开发环境显示
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <>
      {/* 开发工具触发按钮 */}
      {!showRenderMonitor && (
        <div className="fixed bottom-4 left-4 z-50">
          <Button
            onClick={() => setShowRenderMonitor(true)}
            variant="outline"
            size="sm"
            className="shadow-lg bg-white hover:bg-gray-50"
            title="打开渲染监控"
          >
            🛠️ 开发工具
          </Button>
        </div>
      )}

      {/* 渲染监控面板 */}
      {showRenderMonitor && (
        <RenderMonitor onClose={() => setShowRenderMonitor(false)} />
      )}
    </>
  );
}
