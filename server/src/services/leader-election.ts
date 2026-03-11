/**
 * Simple leader election using distributed locks.
 * Only the leader runs the heartbeat scheduler.
 * Single-instance: always leader. Multi-instance: lock-based.
 */
import { getLockService, lockKeys } from "./distributed-lock.js";
import { logger } from "../middleware/logger.js";

const LEADER_TTL_MS = 60_000; // 60s lease
const LEADER_RENEW_MS = 45_000; // renew every 45s

let isLeader = false;
let leaderTimer: ReturnType<typeof setInterval> | null = null;
let currentHandle: { key: string; token: string; expiresAt: number } | null = null;

export function amILeader(): boolean {
  return isLeader;
}

export async function startLeaderElection(onBecomeLeader: () => void, onLoseLeadership: () => void) {
  const lockService = getLockService();
  const key = lockKeys.heartbeatCoordinator();

  async function tryAcquire() {
    if (currentHandle) {
      // Try to renew
      await lockService.release(currentHandle);
    }
    const handle = await lockService.acquire(key, LEADER_TTL_MS);
    if (handle) {
      currentHandle = handle;
      if (!isLeader) {
        isLeader = true;
        logger.info("leader-election: acquired leadership");
        onBecomeLeader();
      }
    } else {
      if (isLeader) {
        isLeader = false;
        currentHandle = null;
        logger.info("leader-election: lost leadership");
        onLoseLeadership();
      }
    }
  }

  // Initial attempt
  await tryAcquire();

  // Periodic renewal/re-election
  leaderTimer = setInterval(() => {
    void tryAcquire().catch(err => {
      logger.error({ err }, "leader-election: error during election");
    });
  }, LEADER_RENEW_MS);

  return () => {
    if (leaderTimer) clearInterval(leaderTimer);
    if (currentHandle) {
      void lockService.release(currentHandle);
      currentHandle = null;
    }
    isLeader = false;
  };
}
