import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { existsSync } from 'fs';
import { join } from 'path';

import { loadConfig, validateConfig, APP_VERSION } from './config';
import { getDatabase } from './db/client';
import { rootLogger } from './lib';
import { createCorsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/error';
import { requestLogger } from './middleware/logger';
import { registerDefaultTransformers } from './gateway/transformer';

import type { GatewayConfig } from './config';
import type { Database } from './db/client';

const logger = rootLogger.child({ module: 'engine' });

export interface CreateEngineOptions {
  /** Additional Hono routes to mount (from features not yet migrated to engine) */
  extraRoutes?: Array<{
    path: string;
    routes: Hono;
  }>;
  /** Skip config validation (default: false) */
  skipConfigValidation?: boolean;
  /** Mount management API routes (default: false) */
  mountAdminAPI?: boolean;
}

export interface EngineInstance {
  app: Hono;
  config: GatewayConfig;
  db: Database;
}

export async function createEngine(options: CreateEngineOptions = {}): Promise<EngineInstance> {
  // 1. Load and validate configuration
  const config = loadConfig();
  if (!options.skipConfigValidation) {
    validateConfig(config);
  }

  // 2. Verify database is initialized
  let db: Database;
  try {
    db = getDatabase();
  } catch (error) {
    logger.error('Database not initialized. Make sure instrumentation hook is enabled.');
    throw error;
  }

  // 3. Create Hono app
  const app = new Hono();

  // 4. Register default transformers
  registerDefaultTransformers();

  // 5. Global middlewares
  app.use('*', errorHandler);
  app.use('*', requestLogger);
  app.use('*', createCorsMiddleware(config));

  // 6. Mount engine-internal routes
  // Gateway API v1 (Anthropic/OpenAI compatible)
  const { default: gatewayRoutes } = await import('./gateway/api');
  app.route('/api/v1', gatewayRoutes);

  // 7. Mount management API routes (if enabled)
  if (options.mountAdminAPI) {
    const { default: healthRoutes } = await import('./features/health/api');
    app.route('/api/health', healthRoutes);

    const { default: authRoutes } = await import('./features/auth/api');
    app.route('/api/auth', authRoutes);

    const { default: providersRoutes } = await import('./features/providers/api');
    app.route('/api/providers', providersRoutes);

    const { default: modelGroupRoutes } = await import('./features/model-groups/api');
    app.route('/api/model-groups', modelGroupRoutes);

    const { default: keysRoutes } = await import('./features/keys/api');
    app.route('/api/keys', keysRoutes);

    const { default: logsRoutes } = await import('./features/logs/api');
    app.route('/api/logs', logsRoutes);

    const { default: settingsRoutes } = await import('./features/settings/api');
    app.route('/api/settings', settingsRoutes);

    const { default: accessModelRoutes } = await import('./features/access-models/api');
    app.route('/api/access-models', accessModelRoutes);

    const { default: modelRoutesApi } = await import('./features/model-routes/api');
    app.route('/api/model-routes', modelRoutesApi);

    const { default: configIORoutes } = await import('./features/config-io/api');
    app.route('/api/config', configIORoutes);

    const { default: circuitBreakerRoutes } = await import('./features/circuit-breaker/api');
    app.route('/api/circuit-breaker', circuitBreakerRoutes);

    const { metricsRoutes } = await import('./features/metrics/api');
    app.route('/api/metrics', metricsRoutes);

    const { aiRoutes } = await import('./features/ai-assist/api');
    app.route('/api/ai', aiRoutes);

    const { default: mitmRoutes } = await import('./mitm/routes');
    app.route('/api/mitm', mitmRoutes);
  }

  // 9. Mount extra routes from the consumer app
  if (options.extraRoutes) {
    for (const { path, routes } of options.extraRoutes) {
      app.route(path, routes);
    }
  }

  // 10. API Root route
  app.get('/api', (c) => {
    return c.json({
      name: 'x-llm-gateway API',
      version: APP_VERSION,
      status: 'running',
      timestamp: new Date().toISOString(),
    });
  });

  // 11. Serve SPA static files (TanStack Router build output)
  const spaDistPath = join(process.cwd(), 'apps/tanstack/dist');
  if (existsSync(spaDistPath)) {
    app.use('/*', serveStatic({ root: './apps/tanstack/dist' }));
    app.use('/*', serveStatic({ root: './apps/tanstack/dist', path: 'index.html' }));
  }

  // 12. 404 handler
  app.notFound((c) => {
    return c.json(
      {
        error: 'API endpoint not found',
        path: c.req.path,
      },
      404
    );
  });

  logger.info({ port: config.server.port }, 'Engine created successfully');

  return { app, config, db };
}
