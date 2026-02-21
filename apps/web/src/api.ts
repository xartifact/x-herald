import { Hono } from 'hono';

import { loadConfig, validateConfig } from '@/core/config';
import { createDatabase } from '@/core/db/client';
import { startAutoCleanup } from '@/features/logs/log-cleanup';

import logger from './core/lib/logger';
import { createCorsMiddleware } from './core/middleware/cors';
import { errorHandler } from './core/middleware/error';
import { requestLogger } from './core/middleware/logger';
import { authRoutes } from './features/auth';
import { gatewayRoutes, registerDefaultTransformers } from './features/gateway';
import { healthRoutes } from './features/health';
import { keysRoutes } from './features/keys';
import { logsRoutes } from './features/logs';
import { modelGroupsRoutes } from './features/model-groups';
import { providersRoutes } from './features/providers';
import { settingsRoutes } from './features/settings';

// Create API app (异步版本)
export const createApiApp = async () => {
  const app = new Hono();

  // Register default transformers
  registerDefaultTransformers();
  logger.info('Transformers registered');

  // Load and validate configuration
  const config = loadConfig();
  validateConfig(config);

  // Initialize database (等待初始化完成)
  await createDatabase(config.database);
  logger.info('Database initialized');

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

  // Gateway Routes (Anthropic/OpenAI 兼容 API)
  app.route('/api/v1', gatewayRoutes);

  // API Root route
  app.get('/api', (c) => {
    return c.json({
      name: 'x-llm-gateway API',
      version: '2.0.0',
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

// 懒加载 API app (异步版本)
let _apiApp: Awaited<ReturnType<typeof createApiApp>> | null = null;
export const apiApp = async () => {
  if (!_apiApp) {
    _apiApp = await createApiApp();
  }
  return _apiApp;
};
