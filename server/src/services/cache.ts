/**
 * Cache service — in-memory LRU cache with optional Redis upgrade path.
 *
 * Currently uses a simple Map with TTL-based expiration.
 * To upgrade to Redis (Phase 3 / Phase 9):
 *   1. `pnpm add ioredis`
 *   2. Replace InMemoryCache with RedisCache
 *   3. Configure REDIS_URL in environment
 *
 * All consumers use the same CacheService interface, so the switch is transparent.
 */

import { logger } from "../middleware/logger.js";

export interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSec?: number): Promise<void>;
  del(key: string): Promise<void>;
  delByPrefix(prefix: string): Promise<void>;
  has(key: string): Promise<boolean>;
}

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const DEFAULT_TTL_SEC = 300; // 5 minutes
const MAX_ENTRIES = 10_000;

/** In-memory TTL cache with size limit */
class InMemoryCache implements CacheService {
  private store = new Map<string, CacheEntry>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    // Periodic cleanup every 60 seconds
    this.cleanupInterval = setInterval(() => this.evictExpired(), 60_000);
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSec = DEFAULT_TTL_SEC): Promise<void> {
    // Evict oldest if at capacity
    if (this.store.size >= MAX_ENTRIES) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSec * 1000,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async delByPrefix(prefix: string): Promise<void> {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  async has(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  private evictExpired() {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        evicted++;
      }
    }
    if (evicted > 0) {
      logger.debug({ evicted, remaining: this.store.size }, "cache: evicted expired entries");
    }
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

// ── Redis cache placeholder ──────────────────────────────────────────────────
// Uncomment and configure when Redis is available:
//
// import Redis from "ioredis";
//
// class RedisCache implements CacheService {
//   private client: Redis;
//   constructor(url: string) { this.client = new Redis(url); }
//   async get<T>(key: string) {
//     const raw = await this.client.get(key);
//     return raw ? JSON.parse(raw) as T : null;
//   }
//   async set<T>(key: string, value: T, ttlSec = DEFAULT_TTL_SEC) {
//     await this.client.set(key, JSON.stringify(value), "EX", ttlSec);
//   }
//   async del(key: string) { await this.client.del(key); }
//   async delByPrefix(prefix: string) {
//     const keys = await this.client.keys(`${prefix}*`);
//     if (keys.length) await this.client.del(...keys);
//   }
//   async has(key: string) { return (await this.client.exists(key)) > 0; }
// }

// ── Cache key helpers ────────────────────────────────────────────────────────

export const cacheKeys = {
  agentConfig: (agentId: string) => `agent:config:${agentId}`,
  companySettings: (companyId: string) => `company:settings:${companyId}`,
  adapterModels: (companyId: string, adapterType: string) => `adapter:models:${companyId}:${adapterType}`,
  fileContent: (hash: string) => `file:content:${hash}`,
  workflowDef: (workflowId: string) => `workflow:def:${workflowId}`,
  dashboardSummary: (companyId: string) => `dashboard:${companyId}`,
};

// ── Singleton ────────────────────────────────────────────────────────────────

let _cache: CacheService | null = null;

export function getCache(): CacheService {
  if (!_cache) {
    // Future: check process.env.REDIS_URL and use RedisCache if available
    _cache = new InMemoryCache();
    logger.info("cache: initialized in-memory cache (upgrade to Redis for multi-instance)");
  }
  return _cache;
}
