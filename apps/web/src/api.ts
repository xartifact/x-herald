import { Hono } from 'hono';
import { loadConfig, validateConfig } from '@x-llm-gateway/config';
import { createDatabase } from '@x-llm-gateway/database';
import { createCorsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/error';
import { requestLogger } from './middleware/logger';
import { startAutoCleanup } from './lib/log-cleanup';
import logger from './lib/logger';
import healthRoutes from './features/health/routes';
import authRoutes from './features/auth/routes';
import providersRoutes from './features/providers/routes';
import modelsRoutes from './features/models/routes';
import keysRoutes from './features/keys/routes';
import logsRoutes from './features/logs/routes';
import gatewayRoutes from './features/gateway/routes';

// Create API app (异步版本)
export const createApiApp = async () => {
  const app = new Hono();

  // Load and validate configuration
  const config = loadConfig();
  validateConfig(config);

  // Initialize database (等待初始化完成)
  await createDatabase(config.database);
  logger.info('Database initialized');

  // 启动日志自动清理（每24小时检查一次，保留30天）
  if (process.env.NODE_ENV === 'production') {
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
  app.route('/api/models', modelsRoutes);
  app.route('/api/keys', keysRoutes);
  app.route('/api/logs', logsRoutes);

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

