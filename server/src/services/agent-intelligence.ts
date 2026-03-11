import type { Db } from "@paperclipai/db";
import { agentCapabilities, agentTaskOutcomes, agents } from "@paperclipai/db";
import { and, eq, desc, sql, ne } from "drizzle-orm";
import { logger } from "../middleware/logger.js";

export function agentIntelligenceService(db: Db) {
  return {
    // ── Capabilities ─────────────────────────────────────────────────────
    async setCapability(agentId: string, companyId: string, capability: string, proficiency?: string) {
      const [result] = await db.insert(agentCapabilities)
        .values({ agentId, companyId, capability, proficiency: proficiency ?? "moderate" })
        .onConflictDoUpdate({
          target: [agentCapabilities.agentId, agentCapabilities.capability],
          set: { proficiency: proficiency ?? "moderate", updatedAt: new Date() },
        })
        .returning();
      return result;
    },

    async getCapabilities(agentId: string) {
      return db.select().from(agentCapabilities)
        .where(eq(agentCapabilities.agentId, agentId));
    },

    async findAgentsByCapability(companyId: string, capability: string) {
      return db.select({
        agentId: agentCapabilities.agentId,
        agentName: agents.name,
        capability: agentCapabilities.capability,
        proficiency: agentCapabilities.proficiency,
      })
        .from(agentCapabilities)
        .innerJoin(agents, eq(agentCapabilities.agentId, agents.id))
        .where(and(
          eq(agentCapabilities.companyId, companyId),
          eq(agentCapabilities.capability, capability),
          ne(agents.status, "terminated"),
        ))
        .orderBy(sql`CASE ${agentCapabilities.proficiency} WHEN 'expert' THEN 0 WHEN 'moderate' THEN 1 WHEN 'beginner' THEN 2 ELSE 3 END`);
    },

    async removeCapability(agentId: string, capability: string) {
      await db.delete(agentCapabilities)
        .where(and(eq(agentCapabilities.agentId, agentId), eq(agentCapabilities.capability, capability)));
    },

    // ── Task Outcomes (Learning) ─────────────────────────────────────────
    async recordOutcome(input: {
      companyId: string;
      agentId: string;
      issueId?: string;
      runId?: string;
      taskType: string;
      outcome: string;
      durationMs?: number;
      costCents?: number;
      labels?: string[];
      metadata?: Record<string, unknown>;
    }) {
      const [record] = await db.insert(agentTaskOutcomes).values({
        companyId: input.companyId,
        agentId: input.agentId,
        issueId: input.issueId ?? null,
        runId: input.runId ?? null,
        taskType: input.taskType,
        outcome: input.outcome,
        durationMs: input.durationMs ?? null,
        costCents: input.costCents ?? null,
        labels: input.labels ?? [],
        metadata: input.metadata ?? {},
      }).returning();
      return record;
    },

    async getAgentStats(agentId: string) {
      const stats = await db.select({
        taskType: agentTaskOutcomes.taskType,
        total: sql<number>`count(*)::int`,
        succeeded: sql<number>`count(*) FILTER (WHERE ${agentTaskOutcomes.outcome} = 'succeeded')::int`,
        failed: sql<number>`count(*) FILTER (WHERE ${agentTaskOutcomes.outcome} = 'failed')::int`,
        avgDurationMs: sql<number>`avg(${agentTaskOutcomes.durationMs})::int`,
        avgCostCents: sql<number>`avg(${agentTaskOutcomes.costCents})::int`,
      })
        .from(agentTaskOutcomes)
        .where(eq(agentTaskOutcomes.agentId, agentId))
        .groupBy(agentTaskOutcomes.taskType);
      return stats;
    },

    /** Auto-routing: find best agent for a task type based on historical success rate */
    async suggestAgent(companyId: string, taskType: string): Promise<{ agentId: string; agentName: string; successRate: number; totalTasks: number } | null> {
      const candidates = await db.select({
        agentId: agentTaskOutcomes.agentId,
        agentName: agents.name,
        total: sql<number>`count(*)::int`,
        succeeded: sql<number>`count(*) FILTER (WHERE ${agentTaskOutcomes.outcome} = 'succeeded')::int`,
        successRate: sql<number>`(count(*) FILTER (WHERE ${agentTaskOutcomes.outcome} = 'succeeded')::float / NULLIF(count(*), 0) * 100)::int`,
      })
        .from(agentTaskOutcomes)
        .innerJoin(agents, eq(agentTaskOutcomes.agentId, agents.id))
        .where(and(
          eq(agentTaskOutcomes.companyId, companyId),
          eq(agentTaskOutcomes.taskType, taskType),
          ne(agents.status, "terminated"),
        ))
        .groupBy(agentTaskOutcomes.agentId, agents.name)
        .having(sql`count(*) >= 3`) // minimum 3 tasks for reliable stats
        .orderBy(sql`count(*) FILTER (WHERE ${agentTaskOutcomes.outcome} = 'succeeded')::float / NULLIF(count(*), 0) DESC`)
        .limit(1);

      if (candidates.length === 0) return null;
      const best = candidates[0];
      return { agentId: best.agentId, agentName: best.agentName, successRate: best.successRate, totalTasks: best.total };
    },

    /** Get leaderboard of agents by success rate for a company */
    async leaderboard(companyId: string) {
      return db.select({
        agentId: agentTaskOutcomes.agentId,
        agentName: agents.name,
        totalTasks: sql<number>`count(*)::int`,
        succeeded: sql<number>`count(*) FILTER (WHERE ${agentTaskOutcomes.outcome} = 'succeeded')::int`,
        failed: sql<number>`count(*) FILTER (WHERE ${agentTaskOutcomes.outcome} = 'failed')::int`,
        successRate: sql<number>`COALESCE((count(*) FILTER (WHERE ${agentTaskOutcomes.outcome} = 'succeeded')::float / NULLIF(count(*), 0) * 100)::int, 0)`,
        avgDurationMs: sql<number>`avg(${agentTaskOutcomes.durationMs})::int`,
        totalCostCents: sql<number>`COALESCE(sum(${agentTaskOutcomes.costCents}), 0)::int`,
      })
        .from(agentTaskOutcomes)
        .innerJoin(agents, eq(agentTaskOutcomes.agentId, agents.id))
        .where(eq(agentTaskOutcomes.companyId, companyId))
        .groupBy(agentTaskOutcomes.agentId, agents.name)
        .orderBy(sql`count(*) FILTER (WHERE ${agentTaskOutcomes.outcome} = 'succeeded')::float / NULLIF(count(*), 0) DESC`);
    },
  };
}
