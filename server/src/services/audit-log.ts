import type { Db } from "@paperclipai/db";
import { auditLogEntries } from "@paperclipai/db";
import { and, eq, desc, gte, lte, sql } from "drizzle-orm";
import { logger } from "../middleware/logger.js";

export interface AuditLogInput {
  companyId: string;
  actorType: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  severity?: "info" | "warning" | "critical";
}

export function auditLogService(db: Db) {
  return {
    async log(input: AuditLogInput) {
      try {
        const [entry] = await db.insert(auditLogEntries).values({
          companyId: input.companyId,
          actorType: input.actorType,
          actorId: input.actorId,
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId ?? null,
          details: input.details ?? {},
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          requestId: input.requestId ?? null,
          severity: input.severity ?? "info",
        }).returning();
        return entry;
      } catch (err) {
        // Audit logging should never crash the app
        logger.error({ err, input }, "audit-log: failed to write entry");
        return null;
      }
    },

    async query(companyId: string, opts?: {
      action?: string;
      actorType?: string;
      actorId?: string;
      resourceType?: string;
      resourceId?: string;
      severity?: string;
      since?: Date;
      until?: Date;
      limit?: number;
    }) {
      const conditions = [eq(auditLogEntries.companyId, companyId)];
      if (opts?.action) conditions.push(eq(auditLogEntries.action, opts.action));
      if (opts?.actorType) conditions.push(eq(auditLogEntries.actorType, opts.actorType));
      if (opts?.actorId) conditions.push(eq(auditLogEntries.actorId, opts.actorId));
      if (opts?.resourceType) conditions.push(eq(auditLogEntries.resourceType, opts.resourceType));
      if (opts?.resourceId) conditions.push(eq(auditLogEntries.resourceId, opts.resourceId));
      if (opts?.severity) conditions.push(eq(auditLogEntries.severity, opts.severity));
      if (opts?.since) conditions.push(gte(auditLogEntries.createdAt, opts.since));
      if (opts?.until) conditions.push(lte(auditLogEntries.createdAt, opts.until));

      return db.select().from(auditLogEntries)
        .where(and(...conditions))
        .orderBy(desc(auditLogEntries.createdAt))
        .limit(opts?.limit ?? 100);
    },

    /** Export audit log as JSON for compliance */
    async exportForCompliance(companyId: string, since: Date, until: Date) {
      const entries = await db.select().from(auditLogEntries)
        .where(and(
          eq(auditLogEntries.companyId, companyId),
          gte(auditLogEntries.createdAt, since),
          lte(auditLogEntries.createdAt, until),
        ))
        .orderBy(auditLogEntries.createdAt);

      return {
        exportedAt: new Date().toISOString(),
        companyId,
        period: { since: since.toISOString(), until: until.toISOString() },
        totalEntries: entries.length,
        entries,
      };
    },

    /** Summary stats for audit dashboard */
    async stats(companyId: string, days = 30) {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const [totals] = await db.select({
        total: sql<number>`count(*)::int`,
        critical: sql<number>`count(*) FILTER (WHERE ${auditLogEntries.severity} = 'critical')::int`,
        warning: sql<number>`count(*) FILTER (WHERE ${auditLogEntries.severity} = 'warning')::int`,
        uniqueActors: sql<number>`count(DISTINCT ${auditLogEntries.actorId})::int`,
      })
        .from(auditLogEntries)
        .where(and(eq(auditLogEntries.companyId, companyId), gte(auditLogEntries.createdAt, since)));

      const byAction = await db.select({
        action: auditLogEntries.action,
        count: sql<number>`count(*)::int`,
      })
        .from(auditLogEntries)
        .where(and(eq(auditLogEntries.companyId, companyId), gte(auditLogEntries.createdAt, since)))
        .groupBy(auditLogEntries.action)
        .orderBy(sql`count(*) DESC`)
        .limit(20);

      return { period: { days, since: since.toISOString() }, ...totals, topActions: byAction };
    },
  };
}
