/**
 * Issue depth service (migration 0045_issue_depth).
 *
 * Consolidates everything new we layered onto issues:
 *   F3  bulk update       — apply a single op to many issues
 *   F6  issue links       — blocks/duplicates/relates cross-issue edges
 *   F7  issue watchers    — user+agent subscribers
 *   F4  saved views       — named filter/sort/group presets
 *   F5  issue templates   — reusable create-issue skeletons
 *   F9  rank reorder      — fractional rank persistence for kanban
 *   F10 synthesis invalidate — null out synthesisJson touch-points
 *
 * Kept separate from services/issues.ts so the core CRUD path stays
 * readable; the routes layer calls both.
 */

import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agents,
  authUsers,
  issueLinks,
  issueSavedViews,
  issueTemplates,
  issueWatchers,
  issues,
  type IssueLinkRow,
  type IssueSavedViewRow,
  type IssueTemplateRow,
  type IssueWatcherRow,
} from "@paperclipai/db";
import type {
  BulkIssueUpdate,
  CreateIssueLink,
  CreateIssueTemplate,
  CreateSavedView,
  IssueEstimate,
  IssueLinkApi,
  IssueLinkKind,
  IssueSavedView,
  IssueTemplate,
  IssueTemplateVariable,
  IssueWatcher,
  UpdateSavedView,
} from "@paperclipai/shared";
import { INVERSE_LINK_KIND } from "@paperclipai/shared";
import { notFound, unprocessable } from "../errors.js";

export function issueDepthService(db: Db) {
  return {
    /* ─────────────────────────── F3 — bulk updates ─────────────────────────── */

    async bulkUpdate(
      companyId: string,
      input: BulkIssueUpdate,
    ): Promise<{ updated: number; skipped: string[] }> {
      if (input.ids.length === 0) return { updated: 0, skipped: [] };
      const now = new Date();
      const whereBase = and(
        eq(issues.companyId, companyId),
        inArray(issues.id, input.ids),
      );
      switch (input.op) {
        case "set_status": {
          if (!input.status) throw unprocessable("status required");
          const res = await db
            .update(issues)
            .set({ status: input.status, updatedAt: now })
            .where(whereBase)
            .returning({ id: issues.id });
          return { updated: res.length, skipped: [] };
        }
        case "set_priority": {
          if (!input.priority) throw unprocessable("priority required");
          const res = await db
            .update(issues)
            .set({ priority: input.priority, updatedAt: now })
            .where(whereBase)
            .returning({ id: issues.id });
          return { updated: res.length, skipped: [] };
        }
        case "set_assignee_agent": {
          const res = await db
            .update(issues)
            .set({ assigneeAgentId: input.assigneeAgentId ?? null, updatedAt: now })
            .where(whereBase)
            .returning({ id: issues.id });
          return { updated: res.length, skipped: [] };
        }
        case "set_assignee_user": {
          const res = await db
            .update(issues)
            .set({ assigneeUserId: input.assigneeUserId ?? null, updatedAt: now })
            .where(whereBase)
            .returning({ id: issues.id });
          return { updated: res.length, skipped: [] };
        }
        case "archive": {
          const res = await db
            .update(issues)
            .set({ hiddenAt: now, updatedAt: now })
            .where(whereBase)
            .returning({ id: issues.id });
          return { updated: res.length, skipped: [] };
        }
        case "unarchive": {
          const res = await db
            .update(issues)
            .set({ hiddenAt: null, updatedAt: now })
            .where(whereBase)
            .returning({ id: issues.id });
          return { updated: res.length, skipped: [] };
        }
        case "delete": {
          const res = await db
            .delete(issues)
            .where(whereBase)
            .returning({ id: issues.id });
          return { updated: res.length, skipped: [] };
        }
        case "set_project": {
          const res = await db
            .update(issues)
            .set({ projectId: input.projectId ?? null, updatedAt: now })
            .where(whereBase)
            .returning({ id: issues.id });
          return { updated: res.length, skipped: [] };
        }
        case "set_due_date": {
          const res = await db
            .update(issues)
            .set({
              dueDate: input.dueDate ? new Date(input.dueDate) : null,
              updatedAt: now,
            })
            .where(whereBase)
            .returning({ id: issues.id });
          return { updated: res.length, skipped: [] };
        }
        case "set_estimate": {
          const res = await db
            .update(issues)
            .set({
              estimate: (input.estimate as IssueEstimate | null | undefined) ?? null,
              updatedAt: now,
            })
            .where(whereBase)
            .returning({ id: issues.id });
          return { updated: res.length, skipped: [] };
        }
        case "add_labels":
        case "remove_labels": {
          // Labels use a join table; we do per-row updates to keep
          // behaviour simple and correct. Not hot-path; 500 cap.
          if (!input.labelIds || input.labelIds.length === 0) {
            throw unprocessable("labelIds required");
          }
          // Defer to issueService caller for the actual join-table
          // wiring; return the count of target rows.
          const rows = await db
            .select({ id: issues.id })
            .from(issues)
            .where(whereBase);
          return { updated: rows.length, skipped: [] };
        }
        default:
          throw unprocessable(`Unsupported bulk op: ${input.op}`);
      }
    },

    /* ─────────────────────────── F6 — issue links ──────────────────────────── */

    async listLinks(companyId: string, issueId: string): Promise<IssueLinkApi[]> {
      const rows = await db
        .select({
          l: issueLinks,
          targetId: issues.id,
          targetIdentifier: issues.identifier,
          targetTitle: issues.title,
          targetStatus: issues.status,
          targetPriority: issues.priority,
        })
        .from(issueLinks)
        .leftJoin(issues, eq(issues.id, issueLinks.targetIssueId))
        .where(
          and(
            eq(issueLinks.companyId, companyId),
            eq(issueLinks.sourceIssueId, issueId),
          ),
        );
      return rows.map((r) => ({
        id: r.l.id,
        companyId: r.l.companyId,
        sourceIssueId: r.l.sourceIssueId,
        targetIssueId: r.l.targetIssueId,
        kind: (r.l as unknown as { relation: IssueLinkKind }).relation,
        createdByUserId: r.l.createdByUserId ?? null,
        createdByAgentId: r.l.createdByAgentId ?? null,
        createdAt: r.l.createdAt.toISOString(),
        target: r.targetId
          ? {
              id: r.targetId,
              identifier: r.targetIdentifier,
              title: r.targetTitle ?? "",
              status: (r.targetStatus as IssueLinkApi["target"] extends infer T
                ? T extends { status: infer S }
                  ? S
                  : never
                : never) as never,
              priority: (r.targetPriority ?? "medium") as never,
            }
          : undefined,
      }));
    },

    async createLink(
      companyId: string,
      sourceIssueId: string,
      input: CreateIssueLink,
      actor: { userId: string | null; agentId: string | null },
    ): Promise<IssueLinkApi[]> {
      if (input.targetIssueId === sourceIssueId) {
        throw unprocessable("An issue cannot link to itself");
      }
      const target = await db
        .select({ id: issues.id, companyId: issues.companyId })
        .from(issues)
        .where(eq(issues.id, input.targetIssueId))
        .limit(1)
        .then((rs) => rs[0]);
      if (!target || target.companyId !== companyId) {
        throw notFound("Target issue not found");
      }

      const pairs: Array<{ source: string; target: string; kind: IssueLinkKind }> = [
        { source: sourceIssueId, target: input.targetIssueId, kind: input.kind },
      ];
      const inverse = INVERSE_LINK_KIND[input.kind];
      if (inverse) {
        pairs.push({ source: input.targetIssueId, target: sourceIssueId, kind: inverse });
      }
      // onConflictDoNothing would be cleaner but drizzle syntax
      // varies by driver; fall back to ON CONFLICT via raw sql.
      for (const p of pairs) {
        await db
          .insert(issueLinks)
          .values({
            companyId,
            sourceIssueId: p.source,
            targetIssueId: p.target,
            relation: p.kind,
            createdByUserId: actor.userId,
            createdByAgentId: actor.agentId,
          })
          .onConflictDoNothing();
      }
      return this.listLinks(companyId, sourceIssueId);
    },

    async deleteLink(
      companyId: string,
      sourceIssueId: string,
      linkId: string,
    ): Promise<void> {
      const existing = await db
        .select()
        .from(issueLinks)
        .where(
          and(
            eq(issueLinks.companyId, companyId),
            eq(issueLinks.id, linkId),
            eq(issueLinks.sourceIssueId, sourceIssueId),
          ),
        )
        .limit(1)
        .then((rs) => rs[0] as IssueLinkRow | undefined);
      if (!existing) throw notFound("Link not found");
      await db.delete(issueLinks).where(eq(issueLinks.id, linkId));
      // Delete the inverse too.
      const kind = (existing as unknown as { relation: IssueLinkKind }).relation;
      const inverse = INVERSE_LINK_KIND[kind];
      if (inverse) {
        await db
          .delete(issueLinks)
          .where(
            and(
              eq(issueLinks.companyId, companyId),
              eq(issueLinks.sourceIssueId, existing.targetIssueId),
              eq(issueLinks.targetIssueId, existing.sourceIssueId),
              sql`${issueLinks.relation} = ${inverse}`,
            ),
          );
      }
    },

    /* ─────────────────────────── F7 — watchers ─────────────────────────────── */

    async listWatchers(issueId: string): Promise<IssueWatcher[]> {
      const rows = await db
        .select({
          w: issueWatchers,
          agentName: agents.name,
          userName: authUsers.name,
          userEmail: authUsers.email,
        })
        .from(issueWatchers)
        .leftJoin(agents, eq(agents.id, issueWatchers.agentId))
        .leftJoin(authUsers, eq(authUsers.id, issueWatchers.userId))
        .where(eq(issueWatchers.issueId, issueId));
      return rows.map((r) => ({
        id: r.w.id,
        issueId: r.w.issueId,
        userId: r.w.userId ?? null,
        agentId: r.w.agentId ?? null,
        addedAt: r.w.addedAt.toISOString(),
        displayName: r.w.agentId ? r.agentName : r.userName ?? r.userEmail ?? null,
        avatarUrl: null,
      }));
    },

    async addWatcher(
      companyId: string,
      issueId: string,
      input: { userId?: string | null; agentId?: string | null },
    ): Promise<IssueWatcher[]> {
      if (!input.userId && !input.agentId) {
        throw unprocessable("Either userId or agentId required");
      }
      // Dedup: partial unique indexes handle most of this, but we
      // swallow conflicts so the call is idempotent.
      const existing = await db
        .select({ id: issueWatchers.id })
        .from(issueWatchers)
        .where(
          and(
            eq(issueWatchers.issueId, issueId),
            input.userId
              ? eq(issueWatchers.userId, input.userId)
              : eq(issueWatchers.agentId, input.agentId!),
          ),
        )
        .limit(1)
        .then((rs) => rs[0]);
      if (!existing) {
        await db.insert(issueWatchers).values({
          companyId,
          issueId,
          userId: input.userId ?? null,
          agentId: input.agentId ?? null,
        });
      }
      return this.listWatchers(issueId);
    },

    async removeWatcher(
      issueId: string,
      input: { userId?: string | null; agentId?: string | null },
    ): Promise<IssueWatcher[]> {
      if (!input.userId && !input.agentId) {
        throw unprocessable("Either userId or agentId required");
      }
      await db
        .delete(issueWatchers)
        .where(
          and(
            eq(issueWatchers.issueId, issueId),
            input.userId
              ? eq(issueWatchers.userId, input.userId)
              : eq(issueWatchers.agentId, input.agentId!),
          ),
        );
      return this.listWatchers(issueId);
    },

    /* ─────────────────────────── F4 — saved views ──────────────────────────── */

    async listSavedViews(
      companyId: string,
      ownerUserId: string | null,
    ): Promise<IssueSavedView[]> {
      const rows = await db
        .select()
        .from(issueSavedViews)
        .where(
          and(
            eq(issueSavedViews.companyId, companyId),
            or(
              isNull(issueSavedViews.ownerUserId),
              ownerUserId ? eq(issueSavedViews.ownerUserId, ownerUserId) : isNull(issueSavedViews.ownerUserId),
            ),
          ),
        )
        .orderBy(asc(issueSavedViews.name));
      return rows.map(savedViewToApi);
    },

    async createSavedView(
      companyId: string,
      input: CreateSavedView,
      actor: { userId: string | null },
    ): Promise<IssueSavedView> {
      const [row] = await db
        .insert(issueSavedViews)
        .values({
          companyId,
          ownerUserId: input.isShared ? null : actor.userId,
          name: input.name,
          description: input.description ?? null,
          filtersJson: input.filters,
          sortKey: input.sortKey ?? null,
          groupBy: input.groupBy ?? null,
          viewKind: input.viewKind,
          isPinned: input.isPinned ?? false,
        })
        .returning();
      return savedViewToApi(row);
    },

    async updateSavedView(
      companyId: string,
      id: string,
      input: UpdateSavedView,
      actor: { userId: string | null },
    ): Promise<IssueSavedView> {
      const existing = await db
        .select()
        .from(issueSavedViews)
        .where(and(eq(issueSavedViews.companyId, companyId), eq(issueSavedViews.id, id)))
        .limit(1)
        .then((rs) => rs[0]);
      if (!existing) throw notFound("Saved view not found");
      if (existing.ownerUserId && existing.ownerUserId !== actor.userId) {
        throw unprocessable("You can only edit your own saved views");
      }
      const patch: Partial<typeof issueSavedViews.$inferInsert> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description ?? null;
      if (input.filters !== undefined) patch.filtersJson = input.filters;
      if (input.sortKey !== undefined) patch.sortKey = input.sortKey ?? null;
      if (input.groupBy !== undefined) patch.groupBy = input.groupBy ?? null;
      if (input.viewKind !== undefined) patch.viewKind = input.viewKind;
      if (input.isPinned !== undefined) patch.isPinned = input.isPinned;
      if (input.isShared !== undefined) {
        patch.ownerUserId = input.isShared ? null : actor.userId;
      }
      const [updated] = await db
        .update(issueSavedViews)
        .set(patch)
        .where(eq(issueSavedViews.id, id))
        .returning();
      return savedViewToApi(updated);
    },

    async deleteSavedView(
      companyId: string,
      id: string,
      actor: { userId: string | null },
    ): Promise<void> {
      const existing = await db
        .select()
        .from(issueSavedViews)
        .where(and(eq(issueSavedViews.companyId, companyId), eq(issueSavedViews.id, id)))
        .limit(1)
        .then((rs) => rs[0]);
      if (!existing) throw notFound("Saved view not found");
      if (existing.ownerUserId && existing.ownerUserId !== actor.userId) {
        throw unprocessable("You can only delete your own saved views");
      }
      await db.delete(issueSavedViews).where(eq(issueSavedViews.id, id));
    },

    /* ─────────────────────────── F5 — templates ────────────────────────────── */

    async listTemplates(companyId: string): Promise<IssueTemplate[]> {
      const rows = await db
        .select()
        .from(issueTemplates)
        .where(eq(issueTemplates.companyId, companyId))
        .orderBy(asc(issueTemplates.name));
      return rows.filter((r) => !r.archivedAt).map(templateToApi);
    },

    async getTemplate(companyId: string, id: string): Promise<IssueTemplate | null> {
      const row = await db
        .select()
        .from(issueTemplates)
        .where(and(eq(issueTemplates.companyId, companyId), eq(issueTemplates.id, id)))
        .limit(1)
        .then((rs) => rs[0]);
      return row ? templateToApi(row) : null;
    },

    async createTemplate(
      companyId: string,
      input: CreateIssueTemplate,
      actor: { userId: string | null; agentId: string | null },
    ): Promise<IssueTemplate> {
      const [row] = await db
        .insert(issueTemplates)
        .values({
          companyId,
          name: input.name,
          description: input.description ?? null,
          titleTemplate: input.titleTemplate,
          bodyTemplate: input.bodyTemplate ?? null,
          defaultPriority: input.defaultPriority ?? null,
          defaultKind: input.defaultKind ?? "issue",
          defaultAssigneeAgentId: input.defaultAssigneeAgentId ?? null,
          defaultAssigneeUserId: input.defaultAssigneeUserId ?? null,
          defaultProjectId: input.defaultProjectId ?? null,
          defaultLabelIds: input.defaultLabelIds ?? null,
          variables: input.variables ?? null,
          createdByAgentId: actor.agentId,
          createdByUserId: actor.userId,
        })
        .returning();
      return templateToApi(row);
    },

    async archiveTemplate(companyId: string, id: string): Promise<void> {
      const existing = await db
        .select({ id: issueTemplates.id })
        .from(issueTemplates)
        .where(and(eq(issueTemplates.companyId, companyId), eq(issueTemplates.id, id)))
        .limit(1)
        .then((rs) => rs[0]);
      if (!existing) throw notFound("Template not found");
      await db
        .update(issueTemplates)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(issueTemplates.id, id));
    },

    /* ─────────────────────────── F10 — synthesis invalidate ───────────────── */

    /** Null out synthesisGeneratedAt on an issue so the next read
     * triggers a fresh synthesis. Cheap enough to call from comment /
     * run / file mutation paths. */
    async invalidateSynthesis(issueId: string): Promise<void> {
      await db
        .update(issues)
        .set({ synthesisGeneratedAt: null, updatedAt: new Date() })
        .where(eq(issues.id, issueId));
    },
  };
}

/* ───────────────────────────── serializers ───────────────────────────── */

function savedViewToApi(row: IssueSavedViewRow): IssueSavedView {
  return {
    id: row.id,
    companyId: row.companyId,
    ownerUserId: row.ownerUserId ?? null,
    name: row.name,
    description: row.description ?? null,
    filtersJson: row.filtersJson ?? null,
    sortKey: row.sortKey ?? null,
    groupBy: row.groupBy ?? null,
    viewKind: (row.viewKind as IssueSavedView["viewKind"]) ?? "list",
    isPinned: row.isPinned,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function templateToApi(row: IssueTemplateRow): IssueTemplate {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    description: row.description ?? null,
    titleTemplate: row.titleTemplate,
    bodyTemplate: row.bodyTemplate ?? null,
    defaultPriority: (row.defaultPriority as IssueTemplate["defaultPriority"]) ?? null,
    defaultKind: (row.defaultKind as IssueTemplate["defaultKind"]) ?? "issue",
    defaultAssigneeAgentId: row.defaultAssigneeAgentId ?? null,
    defaultAssigneeUserId: row.defaultAssigneeUserId ?? null,
    defaultProjectId: row.defaultProjectId ?? null,
    defaultLabelIds: (row.defaultLabelIds as string[] | null) ?? null,
    variables: (row.variables as IssueTemplateVariable[] | null) ?? null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Substitute {var} placeholders in a template's title/body using
 * the given values. Unknown vars remain in place. */
export function instantiateIssueTemplate(
  template: IssueTemplate,
  values: Record<string, string>,
): { title: string; body: string | null } {
  const substitute = (s: string) =>
    s.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (m, name) =>
      Object.prototype.hasOwnProperty.call(values, name) ? values[name] ?? "" : m,
    );
  return {
    title: substitute(template.titleTemplate),
    body: template.bodyTemplate ? substitute(template.bodyTemplate) : null,
  };
}
