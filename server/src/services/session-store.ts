/**
 * Session store abstraction — in-memory with Redis upgrade path.
 * Used for authenticated mode session management across multiple instances.
 * Currently in-memory (single-instance). Upgrade to Redis for horizontal scaling.
 */
import { logger } from "../middleware/logger.js";

export interface SessionStore {
  get(sessionId: string): Promise<Record<string, unknown> | null>;
  set(sessionId: string, data: Record<string, unknown>, ttlSec?: number): Promise<void>;
  del(sessionId: string): Promise<void>;
  touch(sessionId: string, ttlSec?: number): Promise<void>;
}

const DEFAULT_SESSION_TTL_SEC = 86400; // 24 hours

class InMemorySessionStore implements SessionStore {
  private sessions = new Map<string, { data: Record<string, unknown>; expiresAt: number }>();
  private cleanup: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanup = setInterval(() => this.evictExpired(), 60_000);
  }

  async get(sessionId: string) {
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.sessions.delete(sessionId);
      return null;
    }
    return entry.data;
  }

  async set(sessionId: string, data: Record<string, unknown>, ttlSec = DEFAULT_SESSION_TTL_SEC) {
    this.sessions.set(sessionId, { data, expiresAt: Date.now() + ttlSec * 1000 });
  }

  async del(sessionId: string) {
    this.sessions.delete(sessionId);
  }

  async touch(sessionId: string, ttlSec = DEFAULT_SESSION_TTL_SEC) {
    const entry = this.sessions.get(sessionId);
    if (entry) entry.expiresAt = Date.now() + ttlSec * 1000;
  }

  private evictExpired() {
    const now = Date.now();
    for (const [key, entry] of this.sessions) {
      if (now > entry.expiresAt) this.sessions.delete(key);
    }
  }

  destroy() {
    clearInterval(this.cleanup);
    this.sessions.clear();
  }
}

// Redis session store placeholder - uncomment when Redis is available:
// import Redis from "ioredis";
// class RedisSessionStore implements SessionStore {
//   private client: Redis;
//   constructor(url: string) { this.client = new Redis(url); }
//   async get(id: string) { const r = await this.client.get(`sess:${id}`); return r ? JSON.parse(r) : null; }
//   async set(id: string, data: Record<string, unknown>, ttl = DEFAULT_SESSION_TTL_SEC) {
//     await this.client.set(`sess:${id}`, JSON.stringify(data), "EX", ttl);
//   }
//   async del(id: string) { await this.client.del(`sess:${id}`); }
//   async touch(id: string, ttl = DEFAULT_SESSION_TTL_SEC) { await this.client.expire(`sess:${id}`, ttl); }
// }

let _store: SessionStore | null = null;

export function getSessionStore(): SessionStore {
  if (!_store) {
    _store = new InMemorySessionStore();
    logger.info("session-store: initialized in-memory (upgrade to Redis for multi-instance)");
  }
  return _store;
}
