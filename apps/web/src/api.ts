import { Hono } from 'hono';

import { loadConfig, validateConfig } from '@/core/config';
import { getDatabase } from '@/core/db/client';
import { startAutoCleanup } from '@/features/logs/log-cleanup';

import logger from './core/lib/logger';
import { createCorsMiddleware } from './core/middleware/cors';
import { errorHandler } from './core/middleware/error';
import { requestLogger } from './core/middleware/logger';
import { authRoutes } from './features/auth';
import { configIORoutes } from './features/config-io';
import { gatewayRoutes } from './features/gateway';
import { healthRoutes } from './features/health';
import { keysRoutes } from './features/keys';
import { logsRoutes } from './features/logs';
import { modelGroupsRoutes } from './features/model-groups';
import { modelRoutesApi } from './features/model-routes';
import { providersRoutes } from './features/providers';
import { settingsRoutes } from './features/settings';
import { virtualModelRoutes } from './features/virtual-models';

// Create API app
export const createApiApp = () => {
  const app = new Hono();

  // Load and validate configuration
  const config = loadConfig();
  validateConfig(config);

  // 验证数据库已初始化（在 instrumentation.ts 中初始化）
  try {
    getDatabase();
  } catch (error) {
    logger.error('Database not initialized. Make sure instrumentation hook is enabled.');
    throw error;
  }

  // 启动日志自动清理（每24小时检查一次，保留30天）
  // 生产环境始终启用，开发环境可通过 ENABLE_LOG_CLEANUP=true 启用
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_LOG_CLEANUP === 'true') {
    startAutoCleanup(24, 30);
    logger.info('Auto log cleanup scheduler started (retention: 30 days)');
  }

  // Global middlewares
  app.use('*', errorHandler);
  app.use('*', requestLogger);
  app.use('*', createCorsMiddleware(config));

  // API Routes (挂载到 /api 前缀下)
  app.route('/api/health', healthRoutes);
  app.route('/api/auth', authRoutes);
  app.route('/api/providers', providersRoutes);
  app.route('/api/model-groups', modelGroupsRoutes);
  app.route('/api/keys', keysRoutes);
  app.route('/api/logs', logsRoutes);
  app.route('/api/settings', settingsRoutes);
  app.route('/api/virtual-models', virtualModelRoutes);
  app.route('/api/model-routes', modelRoutesApi);
  app.route('/api/config', configIORoutes);

  // Gateway Routes (Anthropic/OpenAI 兼容 API)
  app.route('/api/v1', gatewayRoutes);

  // API Root route
  app.get('/api', (c) => {
    return c.json({
      name: 'x-llm-gateway API',
      version: process.env.APP_VERSION || 'dev',
      status: 'running',
      timestamp: new Date().toISOString(),
    });
  });

  // 404 handler for API routes
  app.notFound((c) => {
    return c.json(
      {
        error: 'API endpoint not found',
        path: c.req.path,
      },
      404
    );
  });

  return app;
};

// 懒加载 API app
let _apiApp: ReturnType<typeof createApiApp> | null = null;
export const apiApp = () => {
  if (!_apiApp) {
    _apiApp = createApiApp();
  }
  return _apiApp;
};
