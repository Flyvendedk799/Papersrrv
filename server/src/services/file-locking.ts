import type { Db } from "@paperclipai/db";
import { fileLocks } from "@paperclipai/db";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { logger } from "../middleware/logger.js";

const DEFAULT_LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export function fileLockingService(db: Db) {
  return {
    /** Acquire an exclusive lock on a file path */
    async acquire(companyId: string, agentId: string, filePath: string, opts?: { durationMs?: number; reason?: string }) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (opts?.durationMs ?? DEFAULT_LOCK_DURATION_MS));

      // Check for existing non-expired lock
      const existing = await db
        .select()
        .from(fileLocks)
        .where(and(
          eq(fileLocks.companyId, companyId),
          eq(fileLocks.filePath, filePath),
          gt(fileLocks.expiresAt, now),
        ))
        .then(rows => rows[0] ?? null);

      if (existing) {
        if (existing.agentId === agentId) {
          // Renew existing lock
          const [updated] = await db.update(fileLocks).set({ expiresAt, reason: opts?.reason }).where(eq(fileLocks.id, existing.id)).returning();
          return { acquired: true, lock: updated, renewed: true };
        }
        return { acquired: false, lock: existing, renewed: false, holder: existing.agentId };
      }

      const [lock] = await db.insert(fileLocks).values({
        companyId, agentId, filePath,
        reason: opts?.reason ?? null,
        acquiredAt: now, expiresAt,
      }).returning();

      return { acquired: true, lock, renewed: false };
    },

    /** Release a file lock */
    async release(companyId: string, agentId: string, filePath: string) {
      const deleted = await db.delete(fileLocks)
        .where(and(
          eq(fileLocks.companyId, companyId),
          eq(fileLocks.agentId, agentId),
          eq(fileLocks.filePath, filePath),
        ))
        .returning();
      return deleted.length > 0;
    },

    /** Check who holds a lock on a file */
    async check(companyId: string, filePath: string) {
      const now = new Date();
      return db.select()
        .from(fileLocks)
        .where(and(
          eq(fileLocks.companyId, companyId),
          eq(fileLocks.filePath, filePath),
          gt(fileLocks.expiresAt, now),
        ))
        .then(rows => rows[0] ?? null);
    },

    /** List all active locks for a company */
    async listActive(companyId: string) {
      const now = new Date();
      return db.select()
        .from(fileLocks)
        .where(and(
          eq(fileLocks.companyId, companyId),
          gt(fileLocks.expiresAt, now),
        ));
    },

    /** Detect conflicts: check if multiple agents have recently modified the same file */
    async detectConflicts(companyId: string) {
      const { agentFileSnapshots } = await import("@paperclipai/db");
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const conflicts = await db
        .select({
          filePath: agentFileSnapshots.filePath,
          agentCount: sql<number>`count(DISTINCT ${agentFileSnapshots.agentId})::int`,
          agents: sql<string[]>`array_agg(DISTINCT ${agentFileSnapshots.agentId})`,
          editCount: sql<number>`count(*)::int`,
        })
        .from(agentFileSnapshots)
        .where(and(
          eq(agentFileSnapshots.companyId, companyId),
          gt(agentFileSnapshots.capturedAt, oneHourAgo),
        ))
        .groupBy(agentFileSnapshots.filePath)
        .having(sql`count(DISTINCT ${agentFileSnapshots.agentId}) > 1`);

      return conflicts;
    },

    /** Clean up expired locks */
    async cleanup() {
      const now = new Date();
      const deleted = await db.delete(fileLocks)
        .where(lt(fileLocks.expiresAt, now))
        .returning();
      if (deleted.length > 0) {
        logger.debug({ count: deleted.length }, "file-locking: cleaned up expired locks");
      }
      return deleted.length;
    },
  };
}
