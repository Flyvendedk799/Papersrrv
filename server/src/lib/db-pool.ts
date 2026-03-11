/**
 * Database connection pool with read replica support.
 * Single-instance: both read and write use the primary.
 * Multi-instance: configure READ_REPLICA_URL for read-heavy queries.
 */
import { logger } from "../middleware/logger.js";

export interface DbPool {
  /** Primary database for writes and consistent reads */
  primary: unknown; // Db type from @paperclipai/db
  /** Read replica for heavy read queries (falls back to primary) */
  replica: unknown;
}

let _pool: DbPool | null = null;

export function initDbPool(primaryDb: unknown, replicaUrl?: string): DbPool {
  if (_pool) return _pool;

  let replicaDb = primaryDb;
  if (replicaUrl) {
    // Dynamic import to create read replica connection
    // const { createDb } = await import("@paperclipai/db");
    // replicaDb = createDb(replicaUrl);
    logger.info("db-pool: read replica configured (not yet connected - uncomment createDb when ready)");
  }

  _pool = { primary: primaryDb, replica: replicaDb };
  logger.info({
    hasReplica: replicaUrl ? true : false,
  }, "db-pool: initialized");
  return _pool;
}

export function getDbPool(): DbPool {
  if (!_pool) throw new Error("DbPool not initialized — call initDbPool first");
  return _pool;
}

/**
 * Helper: use replica for read-heavy endpoints.
 * Falls back to primary if no replica configured.
 */
export function getReadDb(): unknown {
  return getDbPool().replica;
}

export function getWriteDb(): unknown {
  return getDbPool().primary;
}
