/**
 * Distributed lock service — in-memory locks with Redis Redlock upgrade path.
 *
 * Currently uses in-memory Map (suitable for single-instance personal deployment).
 * To upgrade for horizontal scaling (Phase 9):
 *   1. `pnpm add redlock ioredis`
 *   2. Replace InMemoryLockService with RedlockService
 *   3. Configure REDIS_URL in environment
 *
 * Used by:
 *   - Agent start locks (prevent concurrent starts of same agent)
 *   - Heartbeat coordinator (leader election for multi-instance)
 *   - Workflow execution (prevent double-execution of steps)
 */

import { logger } from "../middleware/logger.js";

export interface LockService {
  acquire(key: string, ttlMs?: number): Promise<LockHandle | null>;
  release(handle: LockHandle): Promise<void>;
  /** Convenience: run fn while holding lock */
  withLock<T>(key: string, fn: () => Promise<T>, ttlMs?: number): Promise<T | null>;
}

export interface LockHandle {
  key: string;
  token: string;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 30_000; // 30 seconds

class InMemoryLockService implements LockService {
  private locks = new Map<string, { token: string; expiresAt: number }>();

  async acquire(key: string, ttlMs = DEFAULT_TTL_MS): Promise<LockHandle | null> {
    const now = Date.now();
    const existing = this.locks.get(key);

    // If lock exists and hasn't expired, fail
    if (existing && existing.expiresAt > now) {
      return null;
    }

    // Acquire lock
    const token = `${now}-${Math.random().toString(36).slice(2)}`;
    const expiresAt = now + ttlMs;
    this.locks.set(key, { token, expiresAt });
    return { key, token, expiresAt };
  }

  async release(handle: LockHandle): Promise<void> {
    const existing = this.locks.get(handle.key);
    // Only release if we still own the lock
    if (existing?.token === handle.token) {
      this.locks.delete(handle.key);
    }
  }

  async withLock<T>(key: string, fn: () => Promise<T>, ttlMs = DEFAULT_TTL_MS): Promise<T | null> {
    const handle = await this.acquire(key, ttlMs);
    if (!handle) {
      logger.debug({ key }, "lock: failed to acquire");
      return null;
    }
    try {
      return await fn();
    } finally {
      await this.release(handle);
    }
  }
}

// ── Redis Redlock placeholder ────────────────────────────────────────────────
// Uncomment when Redis is available:
//
// import Redlock from "redlock";
// import Redis from "ioredis";
//
// class RedlockService implements LockService {
//   private redlock: Redlock;
//   constructor(redisUrl: string) {
//     const client = new Redis(redisUrl);
//     this.redlock = new Redlock([client], { retryCount: 3 });
//   }
//   async acquire(key: string, ttlMs = DEFAULT_TTL_MS) {
//     try {
//       const lock = await this.redlock.acquire([`lock:${key}`], ttlMs);
//       return { key, token: lock.value, expiresAt: Date.now() + ttlMs };
//     } catch { return null; }
//   }
//   async release(handle: LockHandle) {
//     try { await this.redlock.release({ ... }); } catch {}
//   }
//   async withLock<T>(key: string, fn: () => Promise<T>, ttlMs?) { ... }
// }

// ── Lock key helpers ─────────────────────────────────────────────────────────

export const lockKeys = {
  agentStart: (agentId: string) => `agent:start:${agentId}`,
  workflowStep: (stepRunId: string) => `workflow:step:${stepRunId}`,
  heartbeatCoordinator: () => `heartbeat:coordinator`,
};

// ── Singleton ────────────────────────────────────────────────────────────────

let _lockService: LockService | null = null;

export function getLockService(): LockService {
  if (!_lockService) {
    // Future: check process.env.REDIS_URL and use RedlockService if available
    _lockService = new InMemoryLockService();
    logger.info("locks: initialized in-memory locks (upgrade to Redis Redlock for multi-instance)");
  }
  return _lockService;
}
