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
import { backlogService, issueService, logActivity } from "../services/index.js";
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

  /**
   * Lookup items captured from a specific origin (backlog3.0 C2).
   *
   * Origin surfaces — Issue detail, run detail, workflow output panel,
   * chat threads — use this to render a "Sent to Backlog" indicator
   * that links back to the captured items. Registered before
   * `/items/:id` so `by-source` isn't swallowed by the param route.
   */
  router.get("/companies/:companyId/backlog/items/by-source", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const source = (req.query.source as string | undefined) || undefined;
    const sourceRefId = (req.query.sourceRefId as string | undefined) || undefined;
    const sourceRefType = (req.query.sourceRefType as string | undefined) || undefined;
    const items = await svc.findBySourceRef(companyId, {
      source: source as never,
      sourceRefId,
      sourceRefType,
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

  /**
   * Promote a backlog item to a first-class Issue (backlog3.0 C3).
   *
   * Always a deliberate single server call so partial failures don't leave
   * a promoted item pointing at a non-existent Issue. The backlog item is
   * *not* deleted — lineage is preserved via `promotedIssueId`.
   *
   * Accepts overrides for the Issue title/description/project/goal/priority
   * so the UI can show a pre-flight form and diverge from the backlog item
   * when helpful. Defaults carry over from the backlog item.
   */
  router.post("/companies/:companyId/backlog/items/:id/promote", async (req, res) => {
    const companyId = req.params.companyId as string;
    const id = req.params.id as string;
    assertCompanyAccess(req, companyId);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const item = await svc.getItem(companyId, id);
    if (!item) throw notFound("Backlog item not found");
    if (item.status === "promoted" && item.promotedIssueId) {
      const existing = await issueService(db);
      const linked = await existing.getById(item.promotedIssueId);
      if (linked) {
        res.json({ item, issue: linked });
        return;
      }
    }
    const actor = getActorInfo(req);
    const issues = issueService(db);
    const title = typeof body.title === "string" && body.title.trim() ? body.title : item.title;
    const description =
      typeof body.description === "string" ? body.description : item.body ?? undefined;
    const projectId =
      typeof body.projectId === "string"
        ? body.projectId
        : (item.projectId ?? undefined);
    const goalId =
      typeof body.goalId === "string" ? body.goalId : (item.goalId ?? undefined);
    const priority =
      typeof body.priority === "string" && body.priority
        ? (body.priority as string)
        : (item.priority ?? undefined);
    const assigneeAgentId =
      typeof body.assigneeAgentId === "string" ? body.assigneeAgentId : undefined;
    const assigneeUserId =
      typeof body.assigneeUserId === "string" ? body.assigneeUserId : undefined;
    const parentId = typeof body.parentId === "string" ? body.parentId : undefined;
    const labelIds = Array.isArray(body.labelIds)
      ? (body.labelIds as unknown[]).filter((v): v is string => typeof v === "string")
      : undefined;

    const issue = await issues.create(companyId, {
      title,
      description: description ?? null,
      projectId: projectId ?? null,
      goalId: goalId ?? null,
      priority: (priority as never) ?? null,
      assigneeAgentId: assigneeAgentId ?? null,
      assigneeUserId: assigneeUserId ?? null,
      parentId: parentId ?? null,
      createdByUserId: actor.actorType === "user" ? actor.actorId : null,
      createdByAgentId: actor.agentId,
      labelIds,
    } as never);

    const promoted = await svc.markPromoted(companyId, id, issue.id);

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "backlog_item.promoted",
      entityType: "backlog_item",
      entityId: promoted.id,
      details: { issueId: issue.id, issueIdentifier: issue.identifier ?? null },
    });
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.created",
      entityType: "issue",
      entityId: issue.id,
      details: {
        fromBacklogItemId: promoted.id,
        title: issue.title,
        via: "backlog_promotion",
      },
    });
    res.json({ item: promoted, issue });
  });

  /**
   * Promote a single backlog item to an Issue (backlog3.0 C3).
   *
   * Defaults carry title, body, project, goal, priority, and labels
   * from the item; the body may override any of these. On success we
   * log activity for both the backlog item (`promoted`) and the new
   * Issue (`created`, via the default identifier) so audit trails line
   * up on both sides.
   */
  router.post(
    "/companies/:companyId/backlog/items/:id/promote",
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const id = req.params.id as string;
      assertCompanyAccess(req, companyId);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const actor = getActorInfo(req);
      const result = await svc.promoteItem(
        companyId,
        id,
        body as never,
        {
          userId: actor.actorType === "user" ? actor.actorId : null,
          agentId: actor.agentId,
        },
      );
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "backlog_item.promoted",
        entityType: "backlog_item",
        entityId: result.item.id,
        details: {
          issueId: result.issue.id,
          identifier: result.issue.identifier,
        },
      });
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "issue.created",
        entityType: "issue",
        entityId: result.issue.id,
        details: {
          identifier: result.issue.identifier,
          fromBacklogItemId: result.item.id,
        },
      });
      res.status(201).json(result);
    },
  );

  /**
   * Bulk-promote many items (backlog3.0 C3).
   *
   * Each id is promoted independently; per-item failures surface in
   * `results` rather than aborting the batch. We emit activity only
   * for successful mutations, matching `bulkApply`.
   */
  router.post(
    "/companies/:companyId/backlog/items/bulk-promote",
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (!Array.isArray(body.ids)) throw badRequest("ids must be an array");
      const actor = getActorInfo(req);
      const result = await svc.bulkPromote(
        companyId,
        body as never,
        {
          userId: actor.actorType === "user" ? actor.actorId : null,
          agentId: actor.agentId,
        },
      );
      for (const entry of result.results) {
        if (entry.status !== "ok" || !entry.item || !entry.issue) continue;
        await logActivity(db, {
          companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          runId: actor.runId,
          action: "backlog_item.promoted",
          entityType: "backlog_item",
          entityId: entry.item.id,
          details: {
            bulk: true,
            issueId: entry.issue.id,
            identifier: entry.issue.identifier,
          },
        });
        await logActivity(db, {
          companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          runId: actor.runId,
          action: "issue.created",
          entityType: "issue",
          entityId: entry.issue.id,
          details: {
            bulk: true,
            identifier: entry.issue.identifier,
            fromBacklogItemId: entry.item.id,
          },
        });
      }
      res.json(result);
    },
  );

  /**
   * Bulk-promote many backlog items. Each item is promoted individually so
   * one bad input doesn't tear down the whole batch; the response shape
   * mirrors `/items/bulk` (per-entry `status`).
   */
  router.post("/companies/:companyId/backlog/items/bulk-promote", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawIds = Array.isArray(body.ids) ? body.ids : [];
    const ids = rawIds.filter((v): v is string => typeof v === "string");
    if (ids.length === 0) throw badRequest("ids is required");
    const overrides = (body.overrides ?? {}) as Record<string, unknown>;
    const actor = getActorInfo(req);
    const issues = issueService(db);

    const results: Array<{
      id: string;
      status: "ok" | "error";
      item?: unknown;
      issue?: unknown;
      error?: string;
    }> = [];
    let succeeded = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        const item = await svc.getItem(companyId, id);
        if (!item) {
          failed += 1;
          results.push({ id, status: "error", error: "not_found" });
          continue;
        }
        if (item.status === "promoted" && item.promotedIssueId) {
          const linked = await issues.getById(item.promotedIssueId);
          if (linked) {
            succeeded += 1;
            results.push({ id, status: "ok", item, issue: linked });
            continue;
          }
        }
        const title =
          typeof overrides.title === "string" && overrides.title.trim()
            ? (overrides.title as string)
            : item.title;
        const issue = await issues.create(companyId, {
          title,
          description:
            typeof overrides.description === "string"
              ? (overrides.description as string)
              : item.body ?? null,
          projectId:
            typeof overrides.projectId === "string"
              ? (overrides.projectId as string)
              : (item.projectId ?? null),
          goalId:
            typeof overrides.goalId === "string"
              ? (overrides.goalId as string)
              : (item.goalId ?? null),
          priority:
            typeof overrides.priority === "string"
              ? ((overrides.priority as string) as never)
              : ((item.priority ?? null) as never),
          assigneeAgentId:
            typeof overrides.assigneeAgentId === "string"
              ? (overrides.assigneeAgentId as string)
              : null,
          assigneeUserId:
            typeof overrides.assigneeUserId === "string"
              ? (overrides.assigneeUserId as string)
              : null,
          parentId:
            typeof overrides.parentId === "string"
              ? (overrides.parentId as string)
              : null,
          createdByUserId: actor.actorType === "user" ? actor.actorId : null,
          createdByAgentId: actor.agentId,
          labelIds: Array.isArray(overrides.labelIds)
            ? (overrides.labelIds as unknown[]).filter(
                (v): v is string => typeof v === "string",
              )
            : undefined,
        } as never);
        const promoted = await svc.markPromoted(companyId, id, issue.id);
        await logActivity(db, {
          companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          runId: actor.runId,
          action: "backlog_item.promoted",
          entityType: "backlog_item",
          entityId: promoted.id,
          details: { issueId: issue.id, issueIdentifier: issue.identifier ?? null, bulk: true },
        });
        await logActivity(db, {
          companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          runId: actor.runId,
          action: "issue.created",
          entityType: "issue",
          entityId: issue.id,
          details: { fromBacklogItemId: promoted.id, via: "backlog_promotion", bulk: true },
        });
        succeeded += 1;
        results.push({ id, status: "ok", item: promoted, issue });
      } catch (err) {
        failed += 1;
        results.push({ id, status: "error", error: (err as Error).message });
      }
    }
    res.json({ total: ids.length, succeeded, failed, results });
  });

  /**
   * Reverse flow: move an existing Issue to the Backlog (backlog3.0 C4).
   *
   * Creates a backlog item linked back to the Issue and flips the Issue's
   * status to `backlog`. The Issue itself is preserved (history, comments,
   * linked runs) so the round-trip is non-destructive and can be
   * "promoted" back into an active Issue later via the normal C3 flow.
   */
  /**
   * Reverse flow: move an Issue into the Backlog (backlog3.0 C4).
   *
   * Delegates to `svc.moveIssueToBacklog`, which handles dedup
   * against a prior move, label copy, and recording the Issue's
   * previous status on the backlog item's `sourceRef` so undo is
   * clean. The Issue itself is preserved — this is a status flip,
   * not a delete.
   */
  router.post(
    "/companies/:companyId/backlog/items/from-issue/:issueId",
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const issueId = req.params.issueId as string;
      assertCompanyAccess(req, companyId);
      const actor = getActorInfo(req);
      const result = await svc.moveIssueToBacklog(companyId, issueId, {
        userId: actor.actorType === "user" ? actor.actorId : null,
        agentId: actor.agentId,
      });
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "backlog_item.captured_from_issue",
        entityType: "backlog_item",
        entityId: result.item.id,
        details: {
          issueId,
          issueIdentifier: result.issue.identifier,
          previousStatus: result.issue.previousStatus,
        },
      });
      if (result.issue.previousStatus !== "backlog") {
        await logActivity(db, {
          companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          runId: actor.runId,
          action: "issue.moved_to_backlog",
          entityType: "issue",
          entityId: issueId,
          details: {
            backlogItemId: result.item.id,
            previousStatus: result.issue.previousStatus,
          },
        });
      }
      res.json({
        item: result.item,
        issue: {
          id: result.issue.id,
          identifier: result.issue.identifier,
          prevStatus: result.issue.previousStatus,
          status: result.issue.status,
        },
      });
    },
  );

  /**
   * Undo the reverse flow (backlog3.0 C4).
   *
   * Archives the backlog item and restores the linked Issue to the
   * status it had before the move. Safe to call even after the
   * Issue has been edited — we only touch its status.
   */
  router.post(
    "/companies/:companyId/backlog/items/:id/restore-issue",
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const id = req.params.id as string;
      assertCompanyAccess(req, companyId);
      const actor = getActorInfo(req);
      const result = await svc.restoreIssueFromBacklog(companyId, id);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "backlog_item.archived",
        entityType: "backlog_item",
        entityId: result.itemId,
        details: { reason: "restore_issue", issueId: result.issue.id },
      });
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "issue.restored_from_backlog",
        entityType: "issue",
        entityId: result.issue.id,
        details: { backlogItemId: result.itemId, status: result.issue.status },
      });
      res.json(result);
    },
  );

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

  /**
   * Backlog overview / insights strip (backlog3.0 B5).
   *
   * Read-only aggregates so we don't need to mirror every count into the
   * client — the strip stays accurate even when the user has filtered the
   * list view, because filters apply to `/items` only.
   */
  router.get("/companies/:companyId/backlog/overview", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const recentDays = req.query.recentDays
      ? Number(req.query.recentDays)
      : undefined;
    const staleDays = req.query.staleDays
      ? Number(req.query.staleDays)
      : undefined;
    const overview = await svc.overview(companyId, {
      recentDays: Number.isFinite(recentDays) ? recentDays : undefined,
      staleDays: Number.isFinite(staleDays) ? staleDays : undefined,
    });
    res.json(overview);
  });

  // ─── Comments (backlog3.0 D3) ────────────────────────────────────

  router.get(
    "/companies/:companyId/backlog/items/:id/comments",
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const id = req.params.id as string;
      assertCompanyAccess(req, companyId);
      const comments = await svc.listComments(companyId, id);
      res.json(comments);
    },
  );

  router.post(
    "/companies/:companyId/backlog/items/:id/comments",
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const id = req.params.id as string;
      assertCompanyAccess(req, companyId);
      const body = (req.body ?? {}) as { body?: unknown };
      if (typeof body.body !== "string") throw badRequest("body is required");
      const actor = getActorInfo(req);
      const comment = await svc.createComment(
        companyId,
        id,
        { body: body.body },
        {
          userId: actor.actorType === "user" ? actor.actorId : null,
          agentId: actor.agentId,
        },
      );
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "backlog_item.commented",
        entityType: "backlog_item",
        entityId: id,
        details: { commentId: comment.id },
      });
      res.status(201).json(comment);
    },
  );

  router.patch(
    "/companies/:companyId/backlog/comments/:id",
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const id = req.params.id as string;
      assertCompanyAccess(req, companyId);
      const body = (req.body ?? {}) as { body?: unknown };
      if (typeof body.body !== "string") throw badRequest("body is required");
      const actor = getActorInfo(req);
      const updated = await svc.updateComment(
        companyId,
        id,
        { body: body.body },
        {
          userId: actor.actorType === "user" ? actor.actorId : null,
          agentId: actor.agentId,
        },
      );
      res.json(updated);
    },
  );

  router.delete(
    "/companies/:companyId/backlog/comments/:id",
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const id = req.params.id as string;
      assertCompanyAccess(req, companyId);
      const actor = getActorInfo(req);
      await svc.deleteComment(companyId, id, {
        userId: actor.actorType === "user" ? actor.actorId : null,
        agentId: actor.agentId,
      });
      res.status(204).end();
    },
  );

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
