import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { agents as agentsTable, companies as companiesTable, costEvents, heartbeatRuns } from "@paperclipai/db";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { createCostEventSchema, updateBudgetSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { costService, companyService, agentService, logActivity } from "../services/index.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { logger } from "../middleware/logger.js";

export function costRoutes(db: Db) {
  const router = Router();
  const costs = costService(db);
  const companies = companyService(db);
  const agents = agentService(db);

  router.post("/companies/:companyId/cost-events", validate(createCostEventSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    if (req.actor.type === "agent" && req.actor.agentId !== req.body.agentId) {
      res.status(403).json({ error: "Agent can only report its own costs" });
      return;
    }

    const event = await costs.createEvent(companyId, {
      ...req.body,
      occurredAt: new Date(req.body.occurredAt),
    });

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "cost.reported",
      entityType: "cost_event",
      entityId: event.id,
      details: { costCents: event.costCents, model: event.model },
    });

    res.status(201).json(event);
  });

  function parseDateRange(query: Record<string, unknown>) {
    const from = query.from ? new Date(query.from as string) : undefined;
    const to = query.to ? new Date(query.to as string) : undefined;
    return (from || to) ? { from, to } : undefined;
  }

  router.get("/companies/:companyId/costs/summary", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const range = parseDateRange(req.query);
    const summary = await costs.summary(companyId, range);
    res.json(summary);
  });

  router.get("/companies/:companyId/costs/by-agent", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const range = parseDateRange(req.query);
    const rows = await costs.byAgent(companyId, range);
    res.json(rows);
  });

  router.get("/companies/:companyId/costs/by-project", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const range = parseDateRange(req.query);
    const rows = await costs.byProject(companyId, range);
    res.json(rows);
  });

  router.patch("/companies/:companyId/budgets", validate(updateBudgetSchema), async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    const company = await companies.update(companyId, { budgetMonthlyCents: req.body.budgetMonthlyCents });
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "company.budget_updated",
      entityType: "company",
      entityId: companyId,
      details: { budgetMonthlyCents: req.body.budgetMonthlyCents },
    });

    res.json(company);
  });

  router.patch("/agents/:agentId/budgets", validate(updateBudgetSchema), async (req, res) => {
    const agentId = req.params.agentId as string;
    const agent = await agents.getById(agentId);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    if (req.actor.type === "agent") {
      if (req.actor.agentId !== agentId) {
        res.status(403).json({ error: "Agent can only change its own budget" });
        return;
      }
    }

    const updated = await agents.update(agentId, { budgetMonthlyCents: req.body.budgetMonthlyCents });
    if (!updated) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: updated.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "agent.budget_updated",
      entityType: "agent",
      entityId: updated.id,
      details: { budgetMonthlyCents: updated.budgetMonthlyCents },
    });

    res.json(updated);
  });

  // Backfill cost_events from heartbeat_runs.usageJson for runs that have costUsd
  // but no corresponding cost_event (or cost_event with 0 cents).
  // This fixes historical data where costCents was rounded to 0.
  router.post("/companies/:companyId/costs/backfill", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    // Find all completed runs with costUsd in usageJson
    const runs = await db
      .select({
        id: heartbeatRuns.id,
        agentId: heartbeatRuns.agentId,
        costUsd: sql<number>`(${heartbeatRuns.usageJson} ->> 'costUsd')::numeric`,
        inputTokens: sql<number>`coalesce((${heartbeatRuns.usageJson} ->> 'inputTokens')::int, 0)`,
        outputTokens: sql<number>`coalesce((${heartbeatRuns.usageJson} ->> 'outputTokens')::int, 0)`,
        provider: sql<string>`coalesce(${heartbeatRuns.usageJson} ->> 'provider', 'unknown')`,
        model: sql<string>`coalesce(${heartbeatRuns.usageJson} ->> 'model', 'unknown')`,
        billingType: sql<string>`coalesce(${heartbeatRuns.usageJson} ->> 'billingType', 'unknown')`,
        finishedAt: heartbeatRuns.finishedAt,
      })
      .from(heartbeatRuns)
      .where(
        and(
          eq(heartbeatRuns.companyId, companyId),
          isNotNull(heartbeatRuns.usageJson),
          sql`(${heartbeatRuns.usageJson} ->> 'costUsd')::numeric > 0`,
        ),
      );

    // Get existing cost_events keyed by runId (via occurred_at matching)
    // Instead of complex matching, we'll recalculate totals from scratch
    let totalCentsBackfilled = 0;
    let eventsCreated = 0;

    for (const run of runs) {
      const costUsd = Number(run.costUsd);
      if (!costUsd || costUsd <= 0) continue;
      const costCents = Math.max(1, Math.ceil(costUsd * 100));

      // Check if a cost_event already exists for this agent at this timestamp
      const existing = await db
        .select({ id: costEvents.id, costCents: costEvents.costCents })
        .from(costEvents)
        .where(
          and(
            eq(costEvents.companyId, companyId),
            eq(costEvents.agentId, run.agentId),
            eq(costEvents.occurredAt, run.finishedAt!),
          ),
        )
        .then((rows) => rows[0] ?? null);

      if (existing) {
        // Update if it was rounded to 0
        if (existing.costCents === 0 && costCents > 0) {
          await db
            .update(costEvents)
            .set({ costCents })
            .where(eq(costEvents.id, existing.id));
          totalCentsBackfilled += costCents;
          eventsCreated++;
        }
      } else {
        // Create missing cost_event
        await db.insert(costEvents).values({
          companyId,
          agentId: run.agentId,
          provider: run.provider || "unknown",
          model: run.model || "unknown",
          inputTokens: Number(run.inputTokens) || 0,
          outputTokens: Number(run.outputTokens) || 0,
          costCents,
          occurredAt: run.finishedAt ?? new Date(),
        });
        totalCentsBackfilled += costCents;
        eventsCreated++;
      }
    }

    // Recalculate spentMonthlyCents for all agents in this company
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const agentTotals = await db
      .select({
        agentId: costEvents.agentId,
        total: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
      })
      .from(costEvents)
      .where(
        and(
          eq(costEvents.companyId, companyId),
          sql`${costEvents.occurredAt} >= ${monthStart}`,
        ),
      )
      .groupBy(costEvents.agentId);

    let companyTotal = 0;
    for (const { agentId, total } of agentTotals) {
      const t = Number(total);
      companyTotal += t;
      await db
        .update(agentsTable)
        .set({ spentMonthlyCents: t, updatedAt: now })
        .where(eq(agentsTable.id, agentId));
    }

    await db
      .update(companiesTable)
      .set({ spentMonthlyCents: companyTotal, updatedAt: now })
      .where(eq(companiesTable.id, companyId));

    logger.info(
      { companyId, eventsCreated, totalCentsBackfilled, companyTotal },
      "cost backfill completed",
    );

    res.json({
      runsScanned: runs.length,
      eventsCreatedOrUpdated: eventsCreated,
      totalCentsBackfilled,
      currentMonthSpendCents: companyTotal,
    });
  });

  return router;
}
