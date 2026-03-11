import type { Request, Response, NextFunction, RequestHandler } from "express";

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory rate limiter (suitable for single-instance personal deployment)
// Replace with Redis-based limiter when scaling horizontally (Plan 1 Phase 9)
const stores = new Map<string, Map<string, RateLimitEntry>>();

function getStore(name: string): Map<string, RateLimitEntry> {
  let store = stores.get(name);
  if (!store) {
    store = new Map();
    stores.set(name, store);
  }
  return store;
}

function getClientKey(req: Request): string {
  // Use actor ID if available, otherwise IP
  const actor = (req as any).actor;
  if (actor?.userId) return `user:${actor.userId}`;
  if (actor?.agentId) return `agent:${actor.agentId}`;
  return `ip:${req.ip ?? req.socket.remoteAddress ?? "unknown"}`;
}

export function rateLimit(name: string, opts: RateLimitOptions): RequestHandler {
  const { windowMs, maxRequests, message } = opts;

  // Periodic cleanup of expired entries
  setInterval(() => {
    const store = getStore(name);
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }, Math.min(windowMs, 60_000));

  return (req: Request, res: Response, next: NextFunction) => {
    const store = getStore(name);
    const key = getClientKey(req);
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    // Set rate limit headers
    const remaining = Math.max(0, maxRequests - entry.count);
    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfter);
      res.status(429).json({
        error: message ?? "Too many requests, please try again later",
        retryAfterSec: retryAfter,
      });
      return;
    }

    next();
  };
}

// Pre-configured rate limiters for different endpoint classes
export const rateLimiters: Record<string, RequestHandler> = {
  /** General API: 200 requests per minute */
  general: rateLimit("general", { windowMs: 60_000, maxRequests: 200 }),

  /** Auth endpoints: 20 requests per minute */
  auth: rateLimit("auth", { windowMs: 60_000, maxRequests: 20, message: "Too many auth attempts" }),

  /** Write operations: 60 requests per minute */
  write: rateLimit("write", { windowMs: 60_000, maxRequests: 60 }),

  /** Expensive operations (backfill, generate): 5 per minute */
  expensive: rateLimit("expensive", { windowMs: 60_000, maxRequests: 5, message: "Rate limited: expensive operation" }),

  /** WebSocket connections: 10 per minute */
  websocket: rateLimit("websocket", { windowMs: 60_000, maxRequests: 10 }),
};
