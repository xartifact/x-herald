import type { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import type postgres from "postgres";

type PostgresDb = ReturnType<typeof drizzlePostgres<Record<string, unknown>>>;

/**
 * Logger interface — the consumer app injects its own logger.
 * Packages/db never imports a logger directly.
 */
export interface DbLogger {
  trace(obj: unknown, msg?: string): void;
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

/**
 * Database connection options.
 * Same shape as the original DatabaseOptions in gateway.
 */
export interface DatabaseOptions {
  type: "postgres" | "pglite";
  // postgres-only
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  // pglite-only
  dataDir?: string;
  // control
  migrateOnBoot: boolean;
  migrationsFolder?: string;
}

export type Database = PostgresDb;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbClient = Database | Transaction;
