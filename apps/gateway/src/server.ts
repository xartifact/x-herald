// BigInt JSON serialization polyfill — Drizzle ORM returns bigint columns
// as JavaScript BigInt values which JSON.stringify cannot handle natively.
// Converting to string preserves full precision (no Number overflow for large values).
// @ts-expect-error — extending built-in prototype is intentional
BigInt.prototype.toJSON = function () {
  return this.toString();
};

import { captureUnhandledErrors, ErrorReporter } from '@x-tinker/sdk';
import type { ErrorReporterConfig } from '@x-tinker/sdk';
import { createEngine, createDatabase, getDatabase, loadConfig, seedSystemData, IS_PRODUCTION } from './index';
import rootLogger from './lib/logger';
import { startAutoCleanup } from './features/logs/log-cleanup';
import { startSnapshotJob } from './features/metrics/snapshot-job';

const logger = rootLogger.child({ module: 'server' });

const PORT = parseInt(process.env.PORT || '3000', 10);

// ─── x-tinker SDK Setup ──────────────────────────────────────
const X_TINKER_URL = process.env.X_TINKER_URL || '';
const X_TINKER_PROJECT_ID = process.env.X_TINKER_PROJECT_ID || 'x-llm-gateway';

const sdkConfig: ErrorReporterConfig | null = X_TINKER_URL
  ? {
      serverUrl: X_TINKER_URL,
      projectId: X_TINKER_PROJECT_ID,
      environment: {
        NODE_ENV: process.env.NODE_ENV || 'development',
        APP_VERSION: process.env.APP_VERSION || 'dev',
      },
    }
  : null;

// Global uncaught exception / rejection handler
if (sdkConfig) {
  logger.info({ url: X_TINKER_URL, projectId: X_TINKER_PROJECT_ID }, 'x-tinker SDK enabled');
  captureUnhandledErrors(sdkConfig);
}

async function main() {
  const config = loadConfig();
  await createDatabase(config.database);
  await seedSystemData();

  const { app } = await createEngine({ mountAdminAPI: true, skipConfigValidation: true, db: getDatabase() });

  // Start background jobs
  if (IS_PRODUCTION || process.env.ENABLE_LOG_CLEANUP === 'true') {
    startAutoCleanup(24, 30);
    logger.info('Auto log cleanup scheduler started (retention: 30 days)');
  }
  await startSnapshotJob();
  logger.info('Perf snapshot job started (interval: 5 min)');

  logger.info({ port: PORT }, 'Engine server starting');

  Bun.serve({
    port: PORT,
    fetch: app.fetch,
    idleTimeout: 0,
  });

  logger.info({ port: PORT }, 'Engine server started');
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start engine server');
  if (sdkConfig) {
    const reporter = new ErrorReporter(sdkConfig);
    reporter.report(
      err instanceof Error ? err : new Error(String(err)),
      undefined,
      { stage: 'bootstrap', port: String(PORT) },
    ).catch(() => {});
  }
  process.exit(1);
});