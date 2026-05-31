'use client';

import { useState } from 'react';

import { IS_DEVELOPMENT } from '@x-llm-gateway/shared';
import { Button } from '@x-llm-gateway/ui';

import RenderMonitor from './RenderMonitor';

/**
 * 开发工具栏
 * 仅在开发环境显示
 */
export default function DevTools() {
  const [showRenderMonitor, setShowRenderMonitor] = useState(false);

  // 仅在开发环境显示
  if (!IS_DEVELOPMENT) {
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
