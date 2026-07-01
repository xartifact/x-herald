export { createDbConnection, getDatabase, closeDb } from "./client";
export { seedSystemData } from "./seed";
export type { Database, DatabaseOptions, DbClient, DbLogger, Transaction } from "./types";

// Schema definitions
export * from "./schema";

// Re-export drizzle-orm query operators — consumers should import from here, not from drizzle-orm directly
export {
  eq, and, or, sql,
  asc, desc,
  gt, gte, lt, lte, ne,
  inArray, isNotNull,
  count, max,
} from "drizzle-orm";
