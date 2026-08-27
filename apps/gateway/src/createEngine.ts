import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { existsSync } from 'fs'
import { join } from 'path'

import { loadConfig, validateConfig, APP_VERSION } from './config'
import { getDatabase } from './db/client'
import { rootLogger } from './lib'
import { createCorsMiddleware } from './middleware/cors'
import { errorHandler } from './middleware/error'
import { requestLogger } from './middleware/logger'
import { registerDefaultTransformers } from './gateway/transformer'

import type { GatewayConfig } from './config'
import type { Database } from './db/client'

const logger = rootLogger.child({ module: 'engine' })

export interface CreateEngineOptions {
  /** Additional Hono routes to mount (from features not yet migrated to engine) */
  extraRoutes?: Array<{
    path: string
    routes: Hono
  }>
  /** Skip config validation (default: false) */
  skipConfigValidation?: boolean
  /** Mount management API routes (default: false) */
  mountAdminAPI?: boolean
  /** Pre-initialized database instance (for testing) */
  db?: Database
}

export interface EngineInstance {
  app: Hono
  config: GatewayConfig
  db: Database
}

export async function createEngine(options: CreateEngineOptions = {}): Promise<EngineInstance> {
  // 1. Load and validate configuration
  const config = loadConfig()
  if (!options.skipConfigValidation) {
    validateConfig(config)
  }

  // 2. Verify database is initialized
  let db: Database
  if (options.db) {
    db = options.db
  } else {
    try {
      db = getDatabase()
    } catch (error) {
      logger.error('Database not initialized. Make sure instrumentation hook is enabled.')
      throw error
    }
  }

  // 2b. Load runtime policies from DB (TTFB / circuit breaker)
  try {
    const { loadTtfbTimeoutConfig } = await import('./gateway/services/ttfb-timeout-policy')
    const { recoverCircuitBreakerState } = await import('./gateway/services/circuit-breaker-state')
    await Promise.all([loadTtfbTimeoutConfig(), recoverCircuitBreakerState()])
  } catch (error) {
    logger.warn({ err: error }, 'Failed to load runtime policies (using defaults)')
  }

  // 2c. 加载所有接入模型的 active route_rules 到内存缓存（运行时引擎查询入口）
  try {
    const { loadAllActiveRouteRules } = await import('./features/route-rules/service')
    await loadAllActiveRouteRules()
  } catch (error) {
    logger.warn({ err: error }, 'route rules cache load skipped or failed (safe to continue)')
  }

  // 2d. 启动 RouteRuleEngine auto-rebuild（订阅 route-rules 变更并维护内存索引）
  try {
    const { getRouteRuleEngine } = await import('./gateway/services/route-rule-engine')
    getRouteRuleEngine().startAutoRebuild()
  } catch (error) {
    logger.warn(
      { err: error },
      'route rule engine auto-rebuild skipped or failed (safe to continue)',
    )
  }

  try {
    const { installCircuitBreakerPrometheus } =
      await import('./features/metrics/prometheus-circuit-breaker')
    installCircuitBreakerPrometheus()
  } catch (error) {
    logger.warn(
      { err: error },
      'prometheus circuit-breaker subscriber install skipped or failed (safe to continue)',
    )
  }
  try {
    const { installResourceGauges } = await import('./features/metrics/gateway-resource-metrics')
    installResourceGauges()
  } catch (error) {
    logger.warn(
      { err: error },
      'prometheus resource gauges install skipped or failed (safe to continue)',
    )
  }

  try {
    const { installCleanupJob } = await import('./features/potential-models')
    installCleanupJob()
  } catch (error) {
    logger.warn(
      { err: error },
      'potential model cleanup job install skipped or failed (safe to continue)',
    )
  }

  // 3. Create Hono app
  const app = new Hono()

  // 4. Register default transformers
  registerDefaultTransformers()

  // 5. Global middlewares
  app.use('*', errorHandler)
  app.use('*', requestLogger)
  app.use('*', createCorsMiddleware(config))

  // 5b. Prometheus HTTP middleware (QPS + duration) — mounted globally so it
  //     observes /api/v1, /api/* and /metrics scrapes alike.
  try {
    const { prometheusHttpMiddleware } =
      await import('./features/metrics/prometheus-http-middleware')
    app.use('*', prometheusHttpMiddleware)
  } catch (error) {
    logger.warn(
      { err: error },
      'prometheus http middleware install skipped or failed (safe to continue)',
    )
  }

  // 5c. Prometheus /metrics endpoint — mounted on root (outside /api/*) so
  //     it bypasses JWT auth. Network-isolation + optional METRICS_IP_ALLOWLIST.
  try {
    const { metricsRoutes: promRoutes } = await import('./features/metrics/prometheus-endpoint')
    app.route('/', promRoutes)
  } catch (error) {
    logger.warn(
      { err: error },
      'prometheus /metrics endpoint mount skipped or failed (safe to continue)',
    )
  }

  // 6. Mount engine-internal routes
  // Gateway API v1 (Anthropic/OpenAI compatible)
  const { default: gatewayRoutes } = await import('./gateway/api')
  app.route('/api/v1', gatewayRoutes)

  // 7. Mount management API routes (if enabled)
  if (options.mountAdminAPI) {
    const { authMiddleware } = await import('./features/auth/middleware')

    // Apply auth middleware to all admin API routes (except auth/health/gateway)
    app.use('/api/*', async (c, next) => {
      const path = c.req.path
      if (
        path === '/api' ||
        path.startsWith('/api/v1') ||
        path.startsWith('/api/auth') ||
        path.startsWith('/api/health')
      ) {
        return next()
      }
      return authMiddleware(c, next)
    })

    const { default: healthRoutes } = await import('./features/health/api')
    app.route('/api/health', healthRoutes)

    const { default: authRoutes } = await import('./features/auth/api')
    app.route('/api/auth', authRoutes)

    const { default: providersRoutes } = await import('./features/providers/api')
    app.route('/api/providers', providersRoutes)

    const { default: modelGroupRoutes } = await import('./features/model-groups/api')
    app.route('/api/model-groups', modelGroupRoutes)

    const { default: keysRoutes } = await import('./features/keys/api')
    app.route('/api/keys', keysRoutes)

    const { default: logsRoutes } = await import('./features/logs/api')
    app.route('/api/logs', logsRoutes)

    const { consoleLogRoutes } = await import('./features/console-logs')
    app.route('/api/console-logs', consoleLogRoutes)
    const { default: settingsRoutes } = await import('./features/settings/api')
    app.route('/api/settings', settingsRoutes)

    const { default: accessModelRoutes } = await import('./features/access-models/api')
    app.route('/api/access-models', accessModelRoutes)

    const { default: routingTracesRoutes } = await import('./features/routing-traces/api')
    app.route('/api/routing-traces', routingTracesRoutes)

    const { potentialModelRoutes } = await import('./features/potential-models')
    app.route('/api/potential-models', potentialModelRoutes)

    const { default: configIORoutes } = await import('./features/config-io/api')
    app.route('/api/config', configIORoutes)

    const { default: circuitBreakerRoutes } = await import('./features/circuit-breaker/api')
    app.route('/api/circuit-breaker', circuitBreakerRoutes)

    const { metricsRoutes } = await import('./features/metrics/api')
    app.route('/api/metrics', metricsRoutes)

    const { aiRoutes } = await import('./features/ai-assist/api')
    app.route('/api/ai', aiRoutes)

    const { default: costRoutes } = await import('./features/costs/api')
    app.route('/api/costs', costRoutes)

    const { routeRulesRoutes } = await import('./features/route-rules')
    app.route('/api/access-models/:accessModelId/route-rules', routeRulesRoutes)

    const { routeOverviewRoutes } = await import('./features/route-overview')
    app.route('/api/route-overview', routeOverviewRoutes)
  }

  // 9. Mount extra routes from the consumer app
  if (options.extraRoutes) {
    for (const { path, routes } of options.extraRoutes) {
      app.route(path, routes)
    }
  }

  // 10. API Root route
  app.get('/api', (c) => {
    return c.json({
      name: 'x-herald API',
      version: APP_VERSION,
      status: 'running',
      timestamp: new Date().toISOString(),
    })
  })

  // 11. Serve SPA static files (TanStack Router build output)
  const spaDistPath = join(process.cwd(), 'apps/web/dist')
  if (existsSync(spaDistPath)) {
    app.use('/*', serveStatic({ root: './apps/web/dist' }))
    app.use('/*', serveStatic({ root: './apps/web/dist', path: 'index.html' }))
  }

  // 12. 404 handler
  app.notFound((c) => {
    return c.json(
      {
        error: 'API endpoint not found',
        path: c.req.path,
      },
      404,
    )
  })

  logger.info({ port: config.server.port }, 'Engine created successfully')

  return { app, config, db }
}
