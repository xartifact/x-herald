import { createEngine, createDatabase, loadConfig, seedSystemData, IS_PRODUCTION } from './index';
import rootLogger from './lib/logger';
import { startAutoCleanup } from './features/logs/log-cleanup';
import { startSnapshotJob } from './features/metrics/snapshot-job';

const logger = rootLogger.child({ module: 'server' });

const PORT = parseInt(process.env.PORT || '3000', 10);

async function main() {
  const config = loadConfig();
  await createDatabase(config.database);
  await seedSystemData();

  const { app } = await createEngine({ mountAdminAPI: true, skipConfigValidation: true });

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
  });

  logger.info({ port: PORT }, 'Engine server started');
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start engine server');
  process.exit(1);
});