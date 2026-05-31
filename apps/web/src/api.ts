import { createEngine, IS_PRODUCTION, logger, startAutoCleanup, startSnapshotJob } from '@x-llm-gateway/engine';

// Create API app (delegates to engine for routes, adds web-specific background jobs)
export const createApiApp = async () => {
  const { app } = await createEngine({ mountAdminAPI: true });

  // 启动日志自动清理（每24小时检查一次，保留30天）
  if (IS_PRODUCTION || process.env.ENABLE_LOG_CLEANUP === 'true') {
    startAutoCleanup(24, 30);
    logger.info('Auto log cleanup scheduler started (retention: 30 days)');
  }

  // 启动性能快照聚合（先确保表存在，再启动定时任务）
  await startSnapshotJob();
  logger.info('Perf snapshot job started (interval: 5 min)');

  return app;
};

// 懒加载 API app（async 单例）
let _apiAppPromise: ReturnType<typeof createApiApp> | null = null;
export const apiApp = () => {
  if (!_apiAppPromise) {
    _apiAppPromise = createApiApp();
  }
  return _apiAppPromise;
};
