export {
  createDb,
  ensurePostgresDatabase,
  inspectMigrations,
  applyPendingMigrations,
  reconcilePendingMigrationHistory,
  type MigrationState,
  type MigrationHistoryReconcileResult,
  migratePostgresIfEmpty,
  type MigrationBootstrapResult,
  type Db,
} from "./client.js";
export {
  runDatabaseBackup,
  formatDatabaseBackupResult,
  type RunDatabaseBackupOptions,
  type RunDatabaseBackupResult,
} from "./backup-lib.js";
export * from "./schema/index.js";
/* Re-export the drizzle-orm operators so consumers always go through
 * the same physical drizzle-orm copy as the schema. Avoids the
 * pnpm peer-variant dual-package hazard. */
export { and, asc, desc, eq, gt, gte, isNull, isNotNull, inArray, lt, lte, ne, not, or, sql } from "drizzle-orm";
