/**
 * Backlog routes (backlog3.0 A2 / B1).
 *
 * Foundational slice only — list/get/create/update/archive for items
 * and plans. Everything else (bulk ops, promotion, Papee tools, reverse
 * flow, capture-from-chat, workflow-output capture) is explicitly
 * deferred; see `backlog/backlog3.0-IMPLEMENTATION.md` for the full
 * decision log.
 *
 * Conventions:
 *   - All routes are company-scoped at the path level.
 *   - Company access is asserted via `assertCompanyAccess`.
 *   - Mutations emit an `activity_log` row (see `logActivity`).
 *   - Errors flow through the existing `HttpError` contract
 *     (400 / 401 / 403 / 404 / 409 / 422 / 500).
 */

import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { backlogService, logActivity } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { badRequest, notFound } from "../errors.js";

export function backlogRoutes(db: Db) {
  const router = Router();
  const svc = backlogService(db);

  // ─── Items ──────────────────────────────────────────────────────────

  router.get("/companies/:companyId/backlog/items", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const items = await svc.listItems(companyId, {
      status: req.query.status as never,
      source: req.query.source as never,
      projectId: (req.query.projectId as string | undefined) || undefined,
      goalId: (req.query.goalId as string | undefined) || undefined,
      planId:
        req.query.planId === "none"
          ? null
          : ((req.query.planId as string | undefined) || undefined),
      q: (req.query.q as string | undefined) || undefined,
      includeArchived:
        req.query.includeArchived === "true" || req.query.includeArchived === "1",
    });
    res.json(items);
  });

  router.get("/companies/:companyId/backlog/items/:id", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);
    const item = await svc.getItem(companyId, id);
    if (!item) throw notFound("Backlog item not found");
    res.json(item);
  });

  router.post("/companies/:companyId/backlog/items", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.title !== "string" || !body.title.trim()) {
      throw badRequest("title is required");
    }
    const actor = getActorInfo(req);
    const item = await svc.createItem(
      companyId,
      body as never,
      { userId: actor.actorType === "user" ? actor.actorId : null, agentId: actor.agentId },
    );
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "backlog_item.created",
      entityType: "backlog_item",
      entityId: item.id,
      details: { title: item.title, status: item.status, source: item.source, planId: item.planId },
    });
    res.status(201).json(item);
  });

  router.patch("/companies/:companyId/backlog/items/:id", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);
    const existing = await svc.getItem(companyId, id);
    if (!existing) throw notFound("Backlog item not found");
    const body = (req.body ?? {}) as Record<string, unknown>;
    const updated = await svc.updateItem(companyId, id, body as never);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "backlog_item.updated",
      entityType: "backlog_item",
      entityId: updated.id,
      details: { patch: body },
    });
    res.json(updated);
  });

  router.post("/companies/:companyId/backlog/items/:id/reorder", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);
    const existing = await svc.getItem(companyId, id);
    if (!existing) throw notFound("Backlog item not found");
    const body = (req.body ?? {}) as Record<string, unknown>;
    const updated = await svc.reorderItem(companyId, id, {
      prevId: (body.prevId as string | null | undefined) ?? null,
      nextId: (body.nextId as string | null | undefined) ?? null,
      planId: body.planId === undefined ? undefined : (body.planId as string | null),
      status: body.status as never,
    });
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "backlog_item.reordered",
      entityType: "backlog_item",
      entityId: updated.id,
      details: {
        prevId: body.prevId ?? null,
        nextId: body.nextId ?? null,
        planId: updated.planId,
        status: updated.status,
      },
    });
    res.json(updated);
  });

  /**
   * Bulk apply (backlog3.0 B4).
   *
   * Atomic per-item: each id is processed independently; partial failures
   * are surfaced via per-id results. We emit one activity row per
   * successfully-mutated item so the per-entity audit trail stays
   * intact (matching single-item endpoints), with a `bulk` flag in
   * `details` so reviewers can correlate the batch.
   */
  router.post("/companies/:companyId/backlog/items/bulk", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!Array.isArray(body.ids)) throw badRequest("ids must be an array");
    if (typeof body.action !== "string") throw badRequest("action is required");
    const result = await svc.bulkApply(companyId, body as never);
    const actor = getActorInfo(req);
    const action =
      result.action === "archive" ? "backlog_item.archived" : "backlog_item.updated";
    const patch = (body.patch as Record<string, unknown> | undefined) ?? null;
    for (const entry of result.results) {
      if (entry.status !== "ok") continue;
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action,
        entityType: "backlog_item",
        entityId: entry.id,
        details: {
          bulk: true,
          bulkAction: result.action,
          patch,
        },
      });
    }
    res.json(result);
  });

  router.post("/companies/:companyId/backlog/items/:id/archive", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);
    const existing = await svc.getItem(companyId, id);
    if (!existing) throw notFound("Backlog item not found");
    const archived = await svc.archiveItem(companyId, id);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "backlog_item.archived",
      entityType: "backlog_item",
      entityId: archived.id,
      details: { previousStatus: existing.status },
    });
    res.json(archived);
  });

  // ─── Plans ──────────────────────────────────────────────────────────

  router.get("/companies/:companyId/backlog/plans", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const includeArchived =
      req.query.includeArchived === "true" || req.query.includeArchived === "1";
    const plans = await svc.listPlans(companyId, includeArchived);
    res.json(plans);
  });

  router.get("/companies/:companyId/backlog/plans/:id", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);
    const plan = await svc.getPlan(companyId, id);
    if (!plan) throw notFound("Backlog plan not found");
    res.json(plan);
  });

  router.post("/companies/:companyId/backlog/plans", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.title !== "string" || !body.title.trim()) {
      throw badRequest("title is required");
    }
    const actor = getActorInfo(req);
    const plan = await svc.createPlan(
      companyId,
      body as never,
      { userId: actor.actorType === "user" ? actor.actorId : null, agentId: actor.agentId },
    );
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "backlog_plan.created",
      entityType: "backlog_plan",
      entityId: plan.id,
      details: { title: plan.title, kind: plan.kind, status: plan.status },
    });
    res.status(201).json(plan);
  });

  router.patch("/companies/:companyId/backlog/plans/:id", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);
    const existing = await svc.getPlan(companyId, id);
    if (!existing) throw notFound("Backlog plan not found");
    const body = (req.body ?? {}) as Record<string, unknown>;
    const updated = await svc.updatePlan(companyId, id, body as never);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "backlog_plan.updated",
      entityType: "backlog_plan",
      entityId: updated.id,
      details: { patch: body },
    });
    res.json(updated);
  });

  router.post("/companies/:companyId/backlog/plans/:id/archive", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);
    const existing = await svc.getPlan(companyId, id);
    if (!existing) throw notFound("Backlog plan not found");
    const archived = await svc.archivePlan(companyId, id);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "backlog_plan.archived",
      entityType: "backlog_plan",
      entityId: archived.id,
      details: { previousStatus: existing.status },
    });
    res.json(archived);
  });

  return router;
}
