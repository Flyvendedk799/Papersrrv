import type { Request } from "express";

/**
 * Middleware helper to extract audit context from request.
 * Used by routes that want to log audit events.
 */
export function getAuditContext(req: Request) {
  return {
    actorType: req.actor?.type ?? "unknown",
    actorId: req.actor?.type === "board" ? (req.actor?.userId ?? "unknown") : (req.actor?.agentId ?? "unknown"),
    ipAddress: req.ip || req.socket?.remoteAddress || undefined,
    userAgent: req.get("user-agent") || undefined,
    requestId: req.get("x-request-id") || undefined,
  };
}
