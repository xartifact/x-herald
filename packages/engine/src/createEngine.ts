import { Hono } from 'hono';

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

  // 7. Mount extra routes from the consumer app
  if (options.extraRoutes) {
    for (const { path, routes } of options.extraRoutes) {
      app.route(path, routes);
    }
  }

  // 8. API Root route
  app.get('/api', (c) => {
    return c.json({
      name: 'x-llm-gateway API',
      version: APP_VERSION,
      status: 'running',
      timestamp: new Date().toISOString(),
    });
  });

  // 9. 404 handler
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
