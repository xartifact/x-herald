import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import logger from '../lib/logger';

const connectionString = process.env.DATABASE_URL ||
  `postgres://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'postgres'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'llm_gateway'}`;

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

async function main() {
  logger.info('Running migrations...');

  await migrate(db, {
    migrationsFolder: './src/db/migrations',
  });

  logger.info('Migrations completed!');

  await client.end();
}

main().catch((error) => {
  logger.error({ error }, 'Migration failed');
  process.exit(1);
});
