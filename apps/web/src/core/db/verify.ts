import postgres from 'postgres';
import logger from '../lib/logger';

const connectionString = process.env.DATABASE_URL ||
  `postgres://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'postgres'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'llm_gateway'}`;

const client = postgres(connectionString, { max: 1 });

async function verifyTables() {
  logger.info('Verifying database tables...');

  const expectedTables = [
    'providers',
    'model_groups',
    'model_instances',
    'virtual_keys',
    'request_logs',
    'health_targets',
    'health_runs',
    'expert_routing_config',
  ];

  const results = await client`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
  `;

  const existingTables = results.map(r => r.table_name);
  logger.info({ tables: existingTables }, 'Existing tables:');

  let allExist = true;
  for (const table of expectedTables) {
    const exists = existingTables.includes(table);
    logger.info({ table, exists }, exists ? '✓' : '✗');
    if (!exists) allExist = false;
  }

  if (allExist) {
    logger.info('All tables verified successfully!');
  } else {
    logger.error('Some tables are missing!');
    process.exit(1);
  }

  await client.end();
}

verifyTables().catch((error) => {
  logger.error({ error }, 'Verification failed');
  process.exit(1);
});
