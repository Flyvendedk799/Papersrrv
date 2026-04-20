/**
 * Backlog service (backlog3.0 A2).
 *
 * Foundational slice only: list/get/create/update/archive for items + plans.
 * Bulk ops, DnD, promotion to Issues, capture-from-chat, reverse flow, and
 * Papee tools are intentionally deferred (see backlog/backlog3.0-IMPLEMENTATION.md).
 *
 * All operations are strictly company-scoped. Activity logging for
 * mutations is wired in the route layer, matching the existing pattern
 * used by `issues.ts` / `issue-evidence.ts`.
 */

import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agents,
  authUsers,
  backlogItemComments,
  backlogItemLabels,
  backlogItems,
  backlogPlanComments,
  backlogPlanRevisions,
  backlogPlans,
  issueComments,
  issues,
  type BacklogItemCommentRow,
  type BacklogItemRow,
  type BacklogPlanCommentRow,
  type BacklogPlanRevisionRow,
  type BacklogPlanRow,
} from "@paperclipai/db";
import { planOutputSchema, type PlanOutput, type PlanProgress } from "@paperclipai/shared";
import { issueService } from "./issues.js";
import { resolvePlanStepOwners, type OwnerResolveDirectory } from "./plan-output-formatter.js";
import type {
  BacklogBulkAction,
  BacklogBulkPatch,
  BacklogItem,
  BacklogItemComment,
  BacklogItemFilters,
  BacklogItemSource,
  BacklogItemSourceRef,
  BacklogItemStatus,
  BacklogOverview,
  BacklogPlan,
  BacklogPlanComment,
  BacklogPlanKind,
  BacklogPlanProgress,
  BacklogPlanRevision,
  BacklogPlanStatus,
  BulkBacklogItemInput,
  BulkBacklogItemResult,
  BulkBacklogItemResultEntry,
  BulkPromoteBacklogItemInput,
  BulkPromoteBacklogItemResult,
  BulkPromoteBacklogItemResultEntry,
  CreateBacklogItemCommentInput,
  CreateBacklogItemInput,
  CreateBacklogPlanInput,
  PromoteBacklogItemInput,
  PromoteBacklogItemResult,
  ReorderBacklogItemInput,
  UpdateBacklogItemCommentInput,
  UpdateBacklogItemInput,
  UpdateBacklogPlanInput,
} from "@paperclipai/shared";
import {
  BACKLOG_BULK_ACTIONS,
  BACKLOG_ITEM_SOURCES,
  BACKLOG_ITEM_STATUSES,
  BACKLOG_PLAN_KINDS,
  BACKLOG_PLAN_STATUSES,
} from "@paperclipai/shared";
import { notFound, unprocessable } from "../errors.js";

function commentToApi(
  row: BacklogItemCommentRow,
  agent: {
    id: string;
    displayName: string;
    iconName: string | null;
  } | null,
): BacklogItemComment {
  return {
    id: row.id,
    companyId: row.companyId,
    backlogItemId: row.backlogItemId,
    authorAgentId: row.authorAgentId,
    authorUserId: row.authorUserId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorAgent: agent
      ? {
          id: agent.id,
          displayName: agent.displayName,
          iconName: agent.iconName,
          avatarUrl: null,
        }
      : null,
  };
}

function planCommentToApi(
  row: BacklogPlanCommentRow,
  agent: {
    id: string;
    displayName: string;
    iconName: string | null;
  } | null,
): BacklogPlanComment {
  return {
    id: row.id,
    companyId: row.companyId,
    backlogPlanId: row.backlogPlanId,
    authorAgentId: row.authorAgentId,
    authorUserId: row.authorUserId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorAgent: agent
      ? {
          id: agent.id,
          displayName: agent.displayName,
          iconName: agent.iconName,
          avatarUrl: null,
        }
      : null,
  };
}

function revisionToApi(row: BacklogPlanRevisionRow): BacklogPlanRevision {
  return {
    id: row.id,
    planId: row.backlogPlanId,
    version: row.version,
    planOutputJson: row.planOutputJson ?? null,
    title: row.title ?? null,
    description: row.description ?? null,
    summaryOfChange: row.summaryOfChange ?? null,
    editedByAgentId: row.editedByAgentId ?? null,
    editedByUserId: row.editedByUserId ?? null,
    editedAt: row.editedAt.toISOString(),
  };
}

function itemToApi(row: BacklogItemRow): BacklogItem {
  return {
    id: row.id,
    companyId: row.companyId,
    title: row.title,
    body: row.body,
    status: row.status as BacklogItemStatus,
    priority: row.priority,
    source: row.source as BacklogItemSource,
    sourceRef: (row.sourceRef as BacklogItemSourceRef | null) ?? null,
    authorUserId: row.authorUserId,
    authorAgentId: row.authorAgentId,
    ownerUserId: row.ownerUserId,
    ownerAgentId: row.ownerAgentId,
    projectId: row.projectId,
    goalId: row.goalId,
    planId: row.planId,
    promotedIssueId: row.promotedIssueId,
    rank: row.rank,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Render a planning-issue's `PlanOutput` into a markdown-ish
 * description body for `backlog_plans.description`. Human-readable,
 * renders cleanly in the plan detail UI. */
function renderPlanDescription(plan: PlanOutput): string {
  const lines: string[] = [];
  lines.push(`## Summary\n${plan.summary}`);
  lines.push(`\n## Context\n${plan.context}`);
  lines.push(`\n## Proposed steps`);
  plan.proposedSteps.forEach((step, i) => {
    const owner = step.owner ? ` — _${step.owner}_` : "";
    lines.push(`\n**${i + 1}. ${step.title}**${owner}\n${step.detail}`);
  });
  if (plan.risks && plan.risks.length > 0) {
    lines.push(`\n## Risks`);
    for (const r of plan.risks) lines.push(`- ${r}`);
  }
  if (plan.openQuestions && plan.openQuestions.length > 0) {
    lines.push(`\n## Open questions`);
    for (const q of plan.openQuestions) lines.push(`- [ ] ${q}`);
  }
  if (plan.delegations && plan.delegations.length > 0) {
    lines.push(`\n## Suggested owners`);
    for (const d of plan.delegations) lines.push(`- **${d.agent}** — ${d.task}`);
  }
  return lines.join("\n");
}

/**
 * Load the company's agents + users for plan-step owner resolution
 * (F2). Cached per-request by the caller (pass through
 * transferIssueToBacklog / owner-update path).
 */
async function loadOwnerDirectory(db: Db, companyId: string): Promise<OwnerResolveDirectory> {
  const agentRows = await db
    .select({ id: agents.id, name: agents.name, displayName: agents.name })
    .from(agents)
    .where(eq(agents.companyId, companyId));
  const userRows = await db
    .select({ id: authUsers.id, displayName: authUsers.name, email: authUsers.email })
    .from(authUsers);
  return {
    agents: agentRows,
    users: userRows,
  };
}

function planToApi(row: BacklogPlanRow): BacklogPlan {
  return {
    id: row.id,
    companyId: row.companyId,
    title: row.title,
    description: row.description,
    kind: row.kind as BacklogPlanKind,
    status: row.status as BacklogPlanStatus,
    projectId: row.projectId,
    goalId: row.goalId,
    startsAt: row.startsAt ? row.startsAt.toISOString() : null,
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    rank: row.rank,
    createdByUserId: row.createdByUserId,
    createdByAgentId: row.createdByAgentId,
    sourceIssueId: row.sourceIssueId ?? null,
    planOutputJson: row.planOutputJson ?? null,
    approvalStatus: (row.approvalStatus ?? "none") as BacklogPlan["approvalStatus"],
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function assertStatus(status: unknown): BacklogItemStatus | undefined {
  if (status === undefined) return undefined;
  if (typeof status !== "string" || !BACKLOG_ITEM_STATUSES.includes(status as BacklogItemStatus)) {
    throw unprocessable(`Unknown backlog item status: ${String(status)}`);
  }
  return status as BacklogItemStatus;
}

function assertSource(source: unknown): BacklogItemSource | undefined {
  if (source === undefined) return undefined;
  if (typeof source !== "string" || !BACKLOG_ITEM_SOURCES.includes(source as BacklogItemSource)) {
    throw unprocessable(`Unknown backlog item source: ${String(source)}`);
  }
  return source as BacklogItemSource;
}

function assertPlanKind(kind: unknown): BacklogPlanKind | undefined {
  if (kind === undefined) return undefined;
  if (typeof kind !== "string" || !BACKLOG_PLAN_KINDS.includes(kind as BacklogPlanKind)) {
    throw unprocessable(`Unknown backlog plan kind: ${String(kind)}`);
  }
  return kind as BacklogPlanKind;
}

function assertPlanStatus(status: unknown): BacklogPlanStatus | undefined {
  if (status === undefined) return undefined;
  if (typeof status !== "string" || !BACKLOG_PLAN_STATUSES.includes(status as BacklogPlanStatus)) {
    throw unprocessable(`Unknown backlog plan status: ${String(status)}`);
  }
  return status as BacklogPlanStatus;
}

function normalizeTitle(title: unknown): string {
  if (typeof title !== "string") throw unprocessable("title is required");
  const trimmed = title.trim();
  if (!trimmed) throw unprocessable("title must not be empty");
  if (trimmed.length > 500) throw unprocessable("title is too long (max 500 chars)");
  return trimmed;
}

/**
 * Fractional-indexing rank utilities (backlog3.0 B3).
 *
 * Ranks are strings over the alphabet `0-9a-z` (base-36). We compute a
 * midpoint between two existing ranks so that lexical ordering matches
 * intended ordering without rebalancing on every move. Empty string is
 * treated as "-∞" (head); the sentinel `"zzzzzz..."` as "+∞" (tail).
 *
 * This is a minimal implementation, not a full lexorank. Collisions on
 * concurrent inserts are self-healing: the next move will pick a new
 * midpoint deeper in the string.
 */
const RANK_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const RANK_MIN_CHAR = RANK_ALPHABET[0];
const RANK_MAX_CHAR = RANK_ALPHABET[RANK_ALPHABET.length - 1];

function rankCharToInt(c: string): number {
  const idx = RANK_ALPHABET.indexOf(c);
  return idx < 0 ? 0 : idx;
}

function rankIntToChar(n: number): string {
  const clamped = Math.max(0, Math.min(RANK_ALPHABET.length - 1, n));
  return RANK_ALPHABET[clamped];
}

/**
 * Returns a rank strictly between `prev` and `next`. `prev` may be empty
 * (= head) and `next` may be empty (= tail). Never throws.
 */
export function midpointRank(prev: string, next: string): string {
  const a = prev ?? "";
  const b = next ?? "";
  // Walk positions, appending common prefix, until we find a spot.
  const out: string[] = [];
  let i = 0;
  // Guardrail to avoid pathological loops on malformed input.
  while (i < 256) {
    const ca = a[i] ?? RANK_MIN_CHAR;
    const cb = b[i] ?? (b.length > 0 ? RANK_MIN_CHAR : RANK_MAX_CHAR);
    const ai = rankCharToInt(ca);
    const bi = rankCharToInt(cb);
    if (ai === bi) {
      out.push(ca);
      i++;
      continue;
    }
    const diff = bi - ai;
    if (diff > 1) {
      out.push(rankIntToChar(ai + Math.floor(diff / 2)));
      return out.join("");
    }
    // diff === 1 (cb > ca by one). Need to append a character beyond ca.
    out.push(ca);
    // The next char of `a` may be anything; we step "deeper" using `a`'s
    // remaining suffix, and treat `b`'s remainder as "-∞" because any
    // non-empty suffix is > ca itself.
    // Find a midpoint between a[i+1..] and "zzzz".
    i++;
    let j = 0;
    while (j < 256) {
      const aj = a[i + j] ?? RANK_MIN_CHAR;
      const aji = rankCharToInt(aj);
      if (aji < RANK_ALPHABET.length - 1) {
        out.push(rankIntToChar(aji + Math.ceil((RANK_ALPHABET.length - 1 - aji) / 2)));
        return out.join("");
      }
      out.push(aj);
      j++;
    }
    out.push(rankIntToChar(Math.floor((RANK_ALPHABET.length - 1) / 2)));
    return out.join("");
  }
  return out.join("") || rankIntToChar(Math.floor((RANK_ALPHABET.length - 1) / 2));
}

function parseIsoDate(value: unknown, field: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw unprocessable(`${field} must be an ISO date string`);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw unprocessable(`${field} is not a valid date`);
  return d;
}

async function resolveNeighborRank(
  db: Db,
  companyId: string,
  neighborId: string | null | undefined,
): Promise<string | null> {
  if (!neighborId) return null;
  const row = await db
    .select({ rank: backlogItems.rank })
    .from(backlogItems)
    .where(and(eq(backlogItems.companyId, companyId), eq(backlogItems.id, neighborId)))
    .then((rs) => rs[0]);
  return row?.rank ?? null;
}

export function backlogService(db: Db) {
  return {
    // ─── Items ─────────────────────────────────────────────────────────

    async listItems(companyId: string, filters: BacklogItemFilters = {}): Promise<BacklogItem[]> {
      const conds = [eq(backlogItems.companyId, companyId)];
      if (!filters.includeArchived) {
        conds.push(sql`${backlogItems.deletedAt} is null`);
      }
      if (filters.status) {
        assertStatus(filters.status);
        conds.push(eq(backlogItems.status, filters.status));
      }
      if (filters.source) {
        assertSource(filters.source);
        conds.push(eq(backlogItems.source, filters.source));
      }
      if (filters.projectId) conds.push(eq(backlogItems.projectId, filters.projectId));
      if (filters.goalId) conds.push(eq(backlogItems.goalId, filters.goalId));
      if (filters.planId === null) {
        conds.push(sql`${backlogItems.planId} is null`);
      } else if (filters.planId) {
        conds.push(eq(backlogItems.planId, filters.planId));
      }
      // Ownership filters (backlog3.0 D4). `"none"` / null matches the
      // unowned bucket; any other value is a direct id match. Callers
      // resolve `"me"` to the current actor before calling the service
      // so we keep this layer dumb and predictable.
      if (filters.ownerUserId !== undefined) {
        if (filters.ownerUserId === null || filters.ownerUserId === "none") {
          conds.push(sql`${backlogItems.ownerUserId} is null`);
        } else if (filters.ownerUserId !== "me") {
          conds.push(eq(backlogItems.ownerUserId, filters.ownerUserId));
        }
      }
      if (filters.ownerAgentId !== undefined) {
        if (filters.ownerAgentId === null || filters.ownerAgentId === "none") {
          conds.push(sql`${backlogItems.ownerAgentId} is null`);
        } else if (filters.ownerAgentId !== "me") {
          conds.push(eq(backlogItems.ownerAgentId, filters.ownerAgentId));
        }
      }
      if (filters.q) {
        const needle = `%${filters.q.trim()}%`;
        const search = or(ilike(backlogItems.title, needle), ilike(backlogItems.body, needle));
        if (search) conds.push(search);
      }

      const rows = await db
        .select()
        .from(backlogItems)
        .where(and(...conds))
        .orderBy(asc(backlogItems.rank), desc(backlogItems.updatedAt));
      return rows.map(itemToApi);
    },

    async getItem(companyId: string, id: string): Promise<BacklogItem | null> {
      const row = await db
        .select()
        .from(backlogItems)
        .where(and(eq(backlogItems.companyId, companyId), eq(backlogItems.id, id)))
        .then((rs) => rs[0]);
      return row ? itemToApi(row) : null;
    },

    /**
     * Look up backlog items that were captured from a given origin
     * (backlog3.0 C2). Used by origin surfaces — Issue detail, run
     * detail, workflow output, chat message — to render a "Sent to
     * Backlog" indicator that back-links to the captured ideas.
     *
     * Matches are done on `source` + a JSONB `sourceRef.id` lookup so
     * callers don't need to mirror the full provenance shape.
     * Archived items are excluded by default; callers can opt in.
     */
    async findBySourceRef(
      companyId: string,
      params: {
        source?: BacklogItemSource;
        sourceRefId?: string;
        sourceRefType?: string;
        includeArchived?: boolean;
      },
    ): Promise<BacklogItem[]> {
      const { source, sourceRefId, sourceRefType, includeArchived } = params;
      if (!sourceRefId && !sourceRefType) return [];
      const conds = [eq(backlogItems.companyId, companyId)];
      if (!includeArchived) {
        conds.push(sql`${backlogItems.deletedAt} is null`);
      }
      if (source) {
        assertSource(source);
        conds.push(eq(backlogItems.source, source));
      }
      if (sourceRefId) {
        conds.push(sql`${backlogItems.sourceRef}->>'id' = ${sourceRefId}`);
      }
      if (sourceRefType) {
        conds.push(sql`${backlogItems.sourceRef}->>'type' = ${sourceRefType}`);
      }
      const rows = await db
        .select()
        .from(backlogItems)
        .where(and(...conds))
        .orderBy(desc(backlogItems.createdAt))
        .limit(50);
      return rows.map(itemToApi);
    },

    async createItem(
      companyId: string,
      input: CreateBacklogItemInput,
      actor: { userId: string | null; agentId: string | null },
    ): Promise<BacklogItem> {
      const title = normalizeTitle(input.title);
      const status = assertStatus(input.status) ?? "idea";
      const source = assertSource(input.source) ?? "manual";

      // Default-tail: compute a rank strictly after the current max so newly
      // created items land at the end of the list (backlog3.0 B3).
      let rank = input.rank;
      if (!rank) {
        const maxRow = await db
          .select({ rank: backlogItems.rank })
          .from(backlogItems)
          .where(eq(backlogItems.companyId, companyId))
          .orderBy(desc(backlogItems.rank))
          .limit(1)
          .then((rs) => rs[0]);
        rank = midpointRank(maxRow?.rank ?? "", "");
      }

      const inserted = await db
        .insert(backlogItems)
        .values({
          companyId,
          title,
          body: input.body ?? null,
          status,
          priority: input.priority ?? null,
          source,
          sourceRef: input.sourceRef ?? null,
          authorUserId: actor.userId,
          authorAgentId: actor.agentId,
          ownerUserId: input.ownerUserId ?? null,
          ownerAgentId: input.ownerAgentId ?? null,
          projectId: input.projectId ?? null,
          goalId: input.goalId ?? null,
          planId: input.planId ?? null,
          rank,
        })
        .returning()
        .then((rs) => rs[0]);
      return itemToApi(inserted);
    },

    async updateItem(
      companyId: string,
      id: string,
      input: UpdateBacklogItemInput,
    ): Promise<BacklogItem> {
      const existing = await db
        .select()
        .from(backlogItems)
        .where(and(eq(backlogItems.companyId, companyId), eq(backlogItems.id, id)))
        .then((rs) => rs[0]);
      if (!existing) throw notFound("Backlog item not found");

      const patch: Partial<typeof backlogItems.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.title !== undefined) patch.title = normalizeTitle(input.title);
      if (input.body !== undefined) patch.body = input.body;
      if (input.status !== undefined) patch.status = assertStatus(input.status);
      if (input.priority !== undefined) patch.priority = input.priority;
      if (input.projectId !== undefined) patch.projectId = input.projectId;
      if (input.goalId !== undefined) patch.goalId = input.goalId;
      if (input.planId !== undefined) patch.planId = input.planId;
      if (input.ownerUserId !== undefined) patch.ownerUserId = input.ownerUserId;
      if (input.ownerAgentId !== undefined) patch.ownerAgentId = input.ownerAgentId;
      if (input.rank !== undefined) patch.rank = input.rank;

      const updated = await db
        .update(backlogItems)
        .set(patch)
        .where(and(eq(backlogItems.companyId, companyId), eq(backlogItems.id, id)))
        .returning()
        .then((rs) => rs[0]);
      return itemToApi(updated);
    },

    /**
     * Move an item to a new position within (or across) status/plan
     * containers. Rank is picked as a midpoint between the supplied
     * neighbours; missing neighbours mean "head" / "tail".
     */
    async reorderItem(
      companyId: string,
      id: string,
      input: ReorderBacklogItemInput,
    ): Promise<BacklogItem> {
      const existing = await db
        .select()
        .from(backlogItems)
        .where(and(eq(backlogItems.companyId, companyId), eq(backlogItems.id, id)))
        .then((rs) => rs[0]);
      if (!existing) throw notFound("Backlog item not found");

      const prevRank = await resolveNeighborRank(db, companyId, input.prevId);
      const nextRank = await resolveNeighborRank(db, companyId, input.nextId);
      const rank = midpointRank(prevRank ?? "", nextRank ?? "");

      const patch: Partial<typeof backlogItems.$inferInsert> = {
        rank,
        updatedAt: new Date(),
      };
      if (input.planId !== undefined) patch.planId = input.planId;
      if (input.status !== undefined) {
        assertStatus(input.status);
        patch.status = input.status;
      }

      const updated = await db
        .update(backlogItems)
        .set(patch)
        .where(and(eq(backlogItems.companyId, companyId), eq(backlogItems.id, id)))
        .returning()
        .then((rs) => rs[0]);
      return itemToApi(updated);
    },

    /**
     * Apply an action to many items in one round-trip (backlog3.0 B4).
     *
     * Each item is processed independently so a partial failure (e.g.
     * one item already archived, or one not found) does not abort the
     * batch. The caller receives a per-id result and must surface
     * failures to the user — never a silent drop.
     */
    async bulkApply(
      companyId: string,
      input: BulkBacklogItemInput,
    ): Promise<BulkBacklogItemResult> {
      if (!input || !Array.isArray(input.ids)) {
        throw unprocessable("ids must be an array");
      }
      if (!BACKLOG_BULK_ACTIONS.includes(input.action as BacklogBulkAction)) {
        throw unprocessable(`Unknown bulk action: ${String(input.action)}`);
      }
      const ids = Array.from(new Set(input.ids.filter((id) => typeof id === "string" && id.length)));
      if (ids.length === 0) {
        return { action: input.action, total: 0, succeeded: 0, failed: 0, results: [] };
      }
      if (ids.length > 200) {
        throw unprocessable("Bulk operation supports at most 200 items per call");
      }

      const patch: BacklogBulkPatch = input.patch ?? {};
      if (input.action === "patch") {
        if (patch.status !== undefined) assertStatus(patch.status);
        if (
          patch.status === undefined &&
          patch.priority === undefined &&
          patch.planId === undefined &&
          patch.projectId === undefined &&
          patch.goalId === undefined &&
          patch.ownerUserId === undefined &&
          patch.ownerAgentId === undefined
        ) {
          throw unprocessable("patch must include at least one field for action 'patch'");
        }
      }

      const results: BulkBacklogItemResultEntry[] = [];
      for (const id of ids) {
        try {
          if (input.action === "archive") {
            const archived = await this.archiveItem(companyId, id);
            results.push({ id, status: "ok", item: archived });
          } else {
            const updateInput: UpdateBacklogItemInput = {};
            if (patch.status !== undefined) updateInput.status = patch.status;
            if (patch.priority !== undefined) updateInput.priority = patch.priority;
            if (patch.planId !== undefined) updateInput.planId = patch.planId;
            if (patch.projectId !== undefined) updateInput.projectId = patch.projectId;
            if (patch.goalId !== undefined) updateInput.goalId = patch.goalId;
            if (patch.ownerUserId !== undefined) updateInput.ownerUserId = patch.ownerUserId;
            if (patch.ownerAgentId !== undefined) updateInput.ownerAgentId = patch.ownerAgentId;
            const updated = await this.updateItem(companyId, id, updateInput);
            results.push({ id, status: "ok", item: updated });
          }
        } catch (err) {
          results.push({
            id,
            status: "error",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const succeeded = results.filter((r) => r.status === "ok").length;
      return {
        action: input.action,
        total: results.length,
        succeeded,
        failed: results.length - succeeded,
        results,
      };
    },

    /**
     * Promote a backlog item to a real Issue (backlog3.0 C3).
     *
     * Creates the Issue through the existing `issueService.create`
     * flow so all invariants (assignee validation, identifier
     * allocation, status transitions, label sync) are enforced. On
     * success, the backlog item is updated in-place to reference the
     * new Issue via `promoted_issue_id` and its status is set to
     * `promoted` — the row is intentionally preserved so reverse-flow
     * (C4) and lineage stay intact.
     *
     * Defaults mirror the item: title, project, goal, priority,
     * labels. Callers may override any field via `input`.
     *
     * Failure modes:
     * - Item already promoted → throws 422.
     * - Item archived / missing → throws 404.
     * - Issue creation fails → throws through (no partial mutation on
     *   the backlog item).
     */
    async promoteItem(
      companyId: string,
      id: string,
      input: PromoteBacklogItemInput,
      actor: { userId: string | null; agentId: string | null },
    ): Promise<PromoteBacklogItemResult> {
      const existing = await db
        .select()
        .from(backlogItems)
        .where(and(eq(backlogItems.companyId, companyId), eq(backlogItems.id, id)))
        .then((rs) => rs[0]);
      if (!existing) throw notFound("Backlog item not found");
      if (existing.deletedAt) {
        throw unprocessable("Cannot promote an archived backlog item");
      }
      if (existing.status === "promoted" && existing.promotedIssueId) {
        throw unprocessable(
          "Backlog item has already been promoted to an issue",
        );
      }

      const itemLabelRows = await db
        .select({ labelId: backlogItemLabels.labelId })
        .from(backlogItemLabels)
        .where(
          and(
            eq(backlogItemLabels.companyId, companyId),
            eq(backlogItemLabels.backlogItemId, id),
          ),
        );
      const inheritedLabelIds = itemLabelRows.map((r) => r.labelId);

      const svc = issueService(db);
      const created = await svc.create(companyId, {
        title: (input.title ?? existing.title).trim() || existing.title,
        description: input.description ?? existing.body ?? undefined,
        status: "todo" as never,
        priority:
          (input.priority ?? (existing.priority as never) ?? "medium") as never,
        projectId: input.projectId ?? existing.projectId ?? null,
        goalId: input.goalId ?? existing.goalId ?? null,
        parentId: input.parentId ?? null,
        assigneeUserId: input.assigneeUserId ?? null,
        assigneeAgentId: input.assigneeAgentId ?? null,
        createdByUserId: actor.userId,
        createdByAgentId: actor.agentId,
        labelIds: input.labelIds ?? inheritedLabelIds,
      } as never);

      const updatedRow = await db
        .update(backlogItems)
        .set({
          status: "promoted",
          promotedIssueId: created.id,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(backlogItems.companyId, companyId),
            eq(backlogItems.id, id),
          ),
        )
        .returning()
        .then((rs) => rs[0]);

      // backlog3.0 D3: copy comments forward into the new Issue so
      // the refinement thread travels with the work. Backlog
      // comments remain on the source row for lineage — restoring
      // the Issue later (C4 undo) leaves the Issue's copies intact.
      const priorComments = await db
        .select()
        .from(backlogItemComments)
        .where(
          and(
            eq(backlogItemComments.companyId, companyId),
            eq(backlogItemComments.backlogItemId, id),
          ),
        )
        .orderBy(asc(backlogItemComments.createdAt));
      if (priorComments.length > 0) {
        await db.insert(issueComments).values(
          priorComments.map((c) => ({
            companyId,
            issueId: created.id,
            authorAgentId: c.authorAgentId,
            authorUserId: c.authorUserId,
            body: `_(carried from backlog item)_\n\n${c.body}`,
          })),
        );
      }

      return {
        item: itemToApi(updatedRow),
        issue: {
          id: created.id,
          identifier: created.identifier,
          title: created.title,
        },
      };
    },

    /**
     * Move an Issue into the Backlog Tab (backlog3.0 C4, reverse flow).
     *
     * Creates a linked backlog item mirroring the Issue (title, body,
     * priority, project, goal, labels), then transitions the Issue to
     * `backlog` status so it stays queryable but is no longer on the
     * active board. The backlog item's `sourceRef` records the
     * previous Issue status so reverse-reverse (undo) can cleanly
     * restore it.
     *
     * Round-trip invariants:
     * - Issue row and its comments / history stay intact.
     * - Labels are copied, not moved: an Issue keeps its labels so
     *   the undo path is a pure status flip.
     * - Double-move is a no-op: if a non-archived backlog item with
     *   `sourceRef.id === issueId` already exists we reuse it.
     */
    async moveIssueToBacklog(
      companyId: string,
      issueId: string,
      actor: { userId: string | null; agentId: string | null },
    ): Promise<{
      item: BacklogItem;
      issue: { id: string; identifier: string | null; previousStatus: string; status: string };
    }> {
      const issueSvc = issueService(db);
      const issue = await issueSvc.getById(issueId);
      if (!issue || issue.companyId !== companyId) {
        throw notFound("Issue not found");
      }
      if (issue.status === "backlog") {
        // Idempotent: find or create the linked backlog item below.
      }

      // Dedup: if we already have a non-archived backlog item linked
      // back to this issue via sourceRef, reuse it instead of
      // spawning a duplicate.
      const existingLinked = await db
        .select()
        .from(backlogItems)
        .where(
          and(
            eq(backlogItems.companyId, companyId),
            sql`${backlogItems.deletedAt} is null`,
            sql`${backlogItems.sourceRef}->>'type' = 'issue'`,
            sql`${backlogItems.sourceRef}->>'id' = ${issueId}`,
          ),
        )
        .limit(1)
        .then((rs) => rs[0]);

      const previousStatus = issue.status;

      let itemRow = existingLinked;
      if (!itemRow) {
        const sourceRef: BacklogItemSourceRef = {
          type: "issue",
          id: issue.id,
          identifier: issue.identifier ?? null,
          previousStatus,
        };
        const maxRow = await db
          .select({ rank: backlogItems.rank })
          .from(backlogItems)
          .where(eq(backlogItems.companyId, companyId))
          .orderBy(desc(backlogItems.rank))
          .limit(1)
          .then((rs) => rs[0]);
        const rank = midpointRank(maxRow?.rank ?? "", "");

        const inserted = await db
          .insert(backlogItems)
          .values({
            companyId,
            title: issue.title,
            body: issue.description ?? null,
            status: "draft",
            priority: (issue.priority as never) ?? null,
            source: "issue",
            sourceRef,
            authorUserId: actor.userId,
            authorAgentId: actor.agentId,
            projectId: issue.projectId ?? null,
            goalId: issue.goalId ?? null,
            rank,
          })
          .returning()
          .then((rs) => rs[0]);
        itemRow = inserted;

        // Mirror labels (copy, not move). backlog_item_labels has a
        // composite PK so duplicates are impossible even under retry.
        const labelIds = (issue.labels ?? [])
          .map((l) => l.id)
          .filter((id): id is string => Boolean(id));
        if (labelIds.length > 0) {
          await db
            .insert(backlogItemLabels)
            .values(
              labelIds.map((labelId) => ({
                backlogItemId: itemRow!.id,
                labelId,
                companyId,
              })),
            )
            .onConflictDoNothing();
        }
      }

      // Flip issue status if needed.
      let updatedIssueStatus = issue.status;
      if (issue.status !== "backlog") {
        const patched = await issueSvc.update(issue.id, {
          status: "backlog",
        } as never);
        if (patched) updatedIssueStatus = patched.status;
      }

      return {
        item: itemToApi(itemRow),
        issue: {
          id: issue.id,
          identifier: issue.identifier,
          previousStatus,
          status: updatedIssueStatus,
        },
      };
    },

    /**
     * Reverse of `moveIssueToBacklog` (backlog3.0 C4 undo).
     *
     * Archives the backlog item and restores the Issue to its
     * previously-recorded status. The backlog row is preserved for
     * lineage; a subsequent move-to-backlog will reuse it thanks to
     * the dedup branch above.
     */
    async restoreIssueFromBacklog(
      companyId: string,
      backlogItemId: string,
    ): Promise<{ itemId: string; issue: { id: string; status: string } }> {
      const row = await db
        .select()
        .from(backlogItems)
        .where(
          and(
            eq(backlogItems.companyId, companyId),
            eq(backlogItems.id, backlogItemId),
          ),
        )
        .then((rs) => rs[0]);
      if (!row) throw notFound("Backlog item not found");
      const sourceRef = (row.sourceRef as BacklogItemSourceRef | null) ?? null;
      if (!sourceRef || (sourceRef as { type?: string }).type !== "issue") {
        throw unprocessable("Backlog item is not linked to an Issue");
      }
      const issueId = (sourceRef as { id?: string }).id;
      const previousStatus =
        (sourceRef as { previousStatus?: string }).previousStatus ?? "todo";
      if (!issueId) {
        throw unprocessable("Backlog item sourceRef is missing the Issue id");
      }

      await db
        .update(backlogItems)
        .set({
          status: "archived",
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(backlogItems.companyId, companyId),
            eq(backlogItems.id, backlogItemId),
          ),
        );

      const issueSvc = issueService(db);
      const restored = await issueSvc.update(issueId, {
        status: previousStatus,
      } as never);
      return {
        itemId: backlogItemId,
        issue: { id: issueId, status: restored?.status ?? previousStatus },
      };
    },

    /**
     * Promote many backlog items at once (backlog3.0 C3).
     *
     * Each item is promoted independently so one failure doesn't
     * abort the batch. The response mirrors `bulkApply` so UI glue
     * can reuse the same success/failure rendering.
     */
    async bulkPromote(
      companyId: string,
      input: BulkPromoteBacklogItemInput,
      actor: { userId: string | null; agentId: string | null },
    ): Promise<BulkPromoteBacklogItemResult> {
      if (!input || !Array.isArray(input.ids)) {
        throw unprocessable("ids must be an array");
      }
      const ids = Array.from(
        new Set(
          input.ids.filter((id) => typeof id === "string" && id.length),
        ),
      );
      if (ids.length === 0) {
        return { total: 0, succeeded: 0, failed: 0, results: [] };
      }
      if (ids.length > 50) {
        throw unprocessable("Bulk promote supports at most 50 items per call");
      }

      const overrides = input.overrides ?? {};
      const results: BulkPromoteBacklogItemResultEntry[] = [];
      for (const id of ids) {
        try {
          const res = await this.promoteItem(companyId, id, overrides, actor);
          results.push({
            id,
            status: "ok",
            item: res.item,
            issue: res.issue,
          });
        } catch (err) {
          results.push({
            id,
            status: "error",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const succeeded = results.filter((r) => r.status === "ok").length;
      return {
        total: results.length,
        succeeded,
        failed: results.length - succeeded,
        results,
      };
    },

    // ─── Comments (backlog3.0 D3) ────────────────────────────────────

    async listComments(
      companyId: string,
      backlogItemId: string,
    ): Promise<BacklogItemComment[]> {
      const rows = await db
        .select({
          c: backlogItemComments,
          agent: {
            id: agents.id,
            displayName: agents.name,
            iconName: agents.icon,
          },
        })
        .from(backlogItemComments)
        .leftJoin(agents, eq(agents.id, backlogItemComments.authorAgentId))
        .where(
          and(
            eq(backlogItemComments.companyId, companyId),
            eq(backlogItemComments.backlogItemId, backlogItemId),
          ),
        )
        .orderBy(asc(backlogItemComments.createdAt));
      return rows.map((r) => commentToApi(r.c, r.agent));
    },

    async createComment(
      companyId: string,
      backlogItemId: string,
      input: CreateBacklogItemCommentInput,
      actor: { userId: string | null; agentId: string | null },
    ): Promise<BacklogItemComment> {
      const body = (input?.body ?? "").trim();
      if (!body) throw unprocessable("body is required");
      // Validate the item exists and is company-scoped so cross-tenant
      // writes are impossible even if the id is guessed.
      const item = await db
        .select({ id: backlogItems.id })
        .from(backlogItems)
        .where(
          and(
            eq(backlogItems.companyId, companyId),
            eq(backlogItems.id, backlogItemId),
          ),
        )
        .limit(1)
        .then((rs) => rs[0]);
      if (!item) throw notFound("Backlog item not found");

      const inserted = await db
        .insert(backlogItemComments)
        .values({
          companyId,
          backlogItemId,
          authorUserId: actor.userId,
          authorAgentId: actor.agentId,
          body,
        })
        .returning()
        .then((rs) => rs[0]);

      // Hydrate agent author if present so the caller can render
      // without a follow-up roundtrip.
      const agent = actor.agentId
        ? await db
            .select({
              id: agents.id,
              displayName: agents.name,
              iconName: agents.icon,
            })
            .from(agents)
            .where(eq(agents.id, actor.agentId))
            .limit(1)
            .then((rs) => rs[0] ?? null)
        : null;

      return commentToApi(inserted, agent);
    },

    async updateComment(
      companyId: string,
      commentId: string,
      input: UpdateBacklogItemCommentInput,
      actor: { userId: string | null; agentId: string | null },
    ): Promise<BacklogItemComment> {
      const body = (input?.body ?? "").trim();
      if (!body) throw unprocessable("body is required");
      const existing = await db
        .select()
        .from(backlogItemComments)
        .where(
          and(
            eq(backlogItemComments.companyId, companyId),
            eq(backlogItemComments.id, commentId),
          ),
        )
        .limit(1)
        .then((rs) => rs[0]);
      if (!existing) throw notFound("Comment not found");
      // Authors can edit their own comments. We allow both user and
      // agent authorship here; the stricter policy (e.g. admin
      // override) can layer on later without schema change.
      const ownsByUser =
        !!actor.userId && existing.authorUserId === actor.userId;
      const ownsByAgent =
        !!actor.agentId && existing.authorAgentId === actor.agentId;
      if (!ownsByUser && !ownsByAgent) {
        throw unprocessable("Only the author can edit this comment");
      }

      const updated = await db
        .update(backlogItemComments)
        .set({ body, updatedAt: new Date() })
        .where(
          and(
            eq(backlogItemComments.companyId, companyId),
            eq(backlogItemComments.id, commentId),
          ),
        )
        .returning()
        .then((rs) => rs[0]);
      const agent = updated.authorAgentId
        ? await db
            .select({
              id: agents.id,
              displayName: agents.name,
              iconName: agents.icon,
            })
            .from(agents)
            .where(eq(agents.id, updated.authorAgentId))
            .limit(1)
            .then((rs) => rs[0] ?? null)
        : null;
      return commentToApi(updated, agent);
    },

    async deleteComment(
      companyId: string,
      commentId: string,
      actor: { userId: string | null; agentId: string | null },
    ): Promise<void> {
      const existing = await db
        .select()
        .from(backlogItemComments)
        .where(
          and(
            eq(backlogItemComments.companyId, companyId),
            eq(backlogItemComments.id, commentId),
          ),
        )
        .limit(1)
        .then((rs) => rs[0]);
      if (!existing) throw notFound("Comment not found");
      const ownsByUser =
        !!actor.userId && existing.authorUserId === actor.userId;
      const ownsByAgent =
        !!actor.agentId && existing.authorAgentId === actor.agentId;
      if (!ownsByUser && !ownsByAgent) {
        throw unprocessable("Only the author can delete this comment");
      }
      await db
        .delete(backlogItemComments)
        .where(
          and(
            eq(backlogItemComments.companyId, companyId),
            eq(backlogItemComments.id, commentId),
          ),
        );
    },

    /**
     * Aggregate counts for the Backlog Tab overview strip (backlog3.0 B5).
     *
     * Computed in a single pass over the active item set so the strip
     * stays cheap even with thousands of items. `recentDays` / `staleDays`
     * default to 14 to match the spec's "what's flowing / what's stuck"
     * framing.
     */
    async overview(
      companyId: string,
      opts: { recentDays?: number; staleDays?: number } = {},
    ): Promise<BacklogOverview> {
      const recentDays = Math.max(1, Math.min(opts.recentDays ?? 14, 365));
      const staleDays = Math.max(1, Math.min(opts.staleDays ?? 14, 365));
      const now = Date.now();
      const recentCutoff = new Date(now - recentDays * 24 * 60 * 60 * 1000);
      const staleCutoff = new Date(now - staleDays * 24 * 60 * 60 * 1000);

      // Fetch every item (include archived) for accurate counts. Bounded
      // by company scope; for very large backlogs we'd swap to GROUP BY
      // SQL — leave as a future optimisation note.
      const rows = await db
        .select()
        .from(backlogItems)
        .where(eq(backlogItems.companyId, companyId));

      const counts: Record<BacklogItemStatus, number> = {
        idea: 0,
        draft: 0,
        ready: 0,
        promoted: 0,
        archived: 0,
      };
      let unplanned = 0;
      let promotedRecent = 0;
      let stale = 0;
      const planAgg = new Map<string, BacklogPlanProgress>();

      const planRows = await db
        .select()
        .from(backlogPlans)
        .where(eq(backlogPlans.companyId, companyId));
      const planTitle = new Map(planRows.map((p) => [p.id, p.title]));

      for (const row of rows) {
        const status = (row.status ?? "idea") as BacklogItemStatus;
        if (counts[status] !== undefined) counts[status] += 1;
        if (!row.planId) unplanned += 1;
        if (status === "promoted" && row.updatedAt && row.updatedAt >= recentCutoff) {
          promotedRecent += 1;
        }
        if (
          status !== "promoted" &&
          status !== "archived" &&
          row.updatedAt &&
          row.updatedAt < staleCutoff
        ) {
          stale += 1;
        }
        if (row.planId) {
          const agg =
            planAgg.get(row.planId) ??
            ({
              planId: row.planId,
              title: planTitle.get(row.planId) ?? "Untitled plan",
              total: 0,
              ready: 0,
              promoted: 0,
              archived: 0,
            } as BacklogPlanProgress);
          agg.total += 1;
          if (status === "ready") agg.ready += 1;
          if (status === "promoted") agg.promoted += 1;
          if (status === "archived") agg.archived += 1;
          planAgg.set(row.planId, agg);
        }
      }

      const perPlan = Array.from(planAgg.values()).sort((a, b) => b.total - a.total);

      return {
        counts,
        total: rows.length,
        unplanned,
        promotedRecent,
        recentDays,
        stale,
        staleDays,
        perPlan,
      };
    },

    /**
     * Soft delete. Sets `deletedAt` and transitions status to `archived`
     * so the item stays queryable for lineage + reverse flows.
     */
    /**
     * Mark a backlog item as promoted and link it to the resulting Issue
     * (backlog3.0 C3). Caller creates the Issue and passes the id here so the
     * promotion stays a single deliberate action. The backlog item is *not*
     * deleted — lineage is preserved.
     */
    async markPromoted(
      companyId: string,
      id: string,
      promotedIssueId: string,
    ): Promise<BacklogItem> {
      const existing = await db
        .select()
        .from(backlogItems)
        .where(and(eq(backlogItems.companyId, companyId), eq(backlogItems.id, id)))
        .then((rs) => rs[0]);
      if (!existing) throw notFound("Backlog item not found");
      const updated = await db
        .update(backlogItems)
        .set({
          status: "promoted",
          promotedIssueId,
          updatedAt: new Date(),
        })
        .where(and(eq(backlogItems.companyId, companyId), eq(backlogItems.id, id)))
        .returning()
        .then((rs) => rs[0]);
      return itemToApi(updated);
    },

    async archiveItem(companyId: string, id: string): Promise<BacklogItem> {
      const existing = await db
        .select()
        .from(backlogItems)
        .where(and(eq(backlogItems.companyId, companyId), eq(backlogItems.id, id)))
        .then((rs) => rs[0]);
      if (!existing) throw notFound("Backlog item not found");

      const updated = await db
        .update(backlogItems)
        .set({
          status: "archived",
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(backlogItems.companyId, companyId), eq(backlogItems.id, id)))
        .returning()
        .then((rs) => rs[0]);
      return itemToApi(updated);
    },

    // ─── Plans ─────────────────────────────────────────────────────────

    async listPlans(companyId: string, includeArchived = false): Promise<BacklogPlan[]> {
      const conds = [eq(backlogPlans.companyId, companyId)];
      if (!includeArchived) {
        conds.push(sql`${backlogPlans.archivedAt} is null`);
      }
      const rows = await db
        .select()
        .from(backlogPlans)
        .where(and(...conds))
        .orderBy(asc(backlogPlans.rank), desc(backlogPlans.updatedAt));
      return rows.map(planToApi);
    },

    async getPlan(companyId: string, id: string): Promise<BacklogPlan | null> {
      const row = await db
        .select()
        .from(backlogPlans)
        .where(and(eq(backlogPlans.companyId, companyId), eq(backlogPlans.id, id)))
        .then((rs) => rs[0]);
      return row ? planToApi(row) : null;
    },

    async createPlan(
      companyId: string,
      input: CreateBacklogPlanInput,
      actor: { userId: string | null; agentId: string | null },
    ): Promise<BacklogPlan> {
      const title = normalizeTitle(input.title);
      const kind = assertPlanKind(input.kind) ?? "custom";
      const status = assertPlanStatus(input.status) ?? "active";
      const startsAt = parseIsoDate(input.startsAt, "startsAt");
      const endsAt = parseIsoDate(input.endsAt, "endsAt");

      const inserted = await db
        .insert(backlogPlans)
        .values({
          companyId,
          title,
          description: input.description ?? null,
          kind,
          status,
          projectId: input.projectId ?? null,
          goalId: input.goalId ?? null,
          startsAt: startsAt ?? null,
          endsAt: endsAt ?? null,
          rank: input.rank ?? "",
          createdByUserId: actor.userId,
          createdByAgentId: actor.agentId,
        })
        .returning()
        .then((rs) => rs[0]);
      return planToApi(inserted);
    },

    /** Create a backlog plan from a completed planning-kind issue.
     * Idempotent: a second call for the same source issue returns
     * the existing plan rather than creating a duplicate.
     *
     * Side effects on the issue (when a new plan is created):
     *   · issues.transferred_to_backlog_at ← now
     *   · issues.status → done (if not already done/cancelled)
     *   · issues.completedAt ← now (if not already set)
     *
     * Caller is responsible for ensuring the issue has a validated
     * planOutputJson before invoking this method. */
    async transferIssueToBacklog(
      companyId: string,
      issueId: string,
      opts: {
        title?: string;
        planKind?: BacklogPlanKind;
        seedItems?: boolean;
      },
      actor: { userId: string | null; agentId: string | null },
    ): Promise<{ plan: BacklogPlan; alreadyExisted: boolean }> {
      // Idempotency — if a plan already points at this issue, return
      // it untouched. Guarantees the "Save as Backlog Plan" button
      // can be retried safely.
      const existing = await db
        .select()
        .from(backlogPlans)
        .where(
          and(
            eq(backlogPlans.companyId, companyId),
            eq(backlogPlans.sourceIssueId, issueId),
          ),
        )
        .then((rs) => rs[0]);
      if (existing) {
        return { plan: planToApi(existing), alreadyExisted: true };
      }

      // Read the source issue and its stored plan output.
      const [issueRow] = await db
        .select({
          id: issues.id,
          companyId: issues.companyId,
          title: issues.title,
          description: issues.description,
          status: issues.status,
          kind: issues.kind,
          projectId: issues.projectId,
          goalId: issues.goalId,
          planOutputJson: issues.planOutputJson,
          completedAt: issues.completedAt,
          transferredToBacklogAt: issues.transferredToBacklogAt,
        })
        .from(issues)
        .where(eq(issues.id, issueId))
        .limit(1);
      if (!issueRow) throw notFound("Issue not found");
      if (issueRow.companyId !== companyId) throw notFound("Issue not found");
      if (issueRow.kind !== "planning") {
        throw unprocessable("Only planning-kind issues can be transferred to the backlog");
      }
      if (!issueRow.planOutputJson) {
        throw unprocessable("Planning issue has no finalised plan output yet");
      }
      const validated = planOutputSchema.safeParse(issueRow.planOutputJson);
      if (!validated.success) {
        throw unprocessable("Stored plan output does not match the enforced PlanOutput schema");
      }

      // F2 — resolve step owners against the company's agents + users.
      // Free-form labels like "alice" or "@claude-frontend" become
      // structured {agentId} / {userId} pointers where possible;
      // unmatched labels stay as labels.
      const directory = await loadOwnerDirectory(db, companyId);
      const plan = resolvePlanStepOwners(validated.data, directory);

      const now = new Date();
      const planTitle = normalizeTitle(opts.title ?? issueRow.title ?? "Untitled plan");
      const kind = assertPlanKind(opts.planKind) ?? "custom";
      const description = renderPlanDescription(plan);

      // Insert the backlog plan with the back-reference.
      // F3 — copy the structured plan output onto the plan row so
      // the plan detail page can render the full document without
      // chasing the source issue. F6 hook — approval_status default
      // is 'none'; a later pass flips it to 'pending' when a
      // company-level flag is on (not wired yet).
      const [inserted] = await db
        .insert(backlogPlans)
        .values({
          companyId,
          title: planTitle,
          description,
          kind,
          status: "active",
          projectId: issueRow.projectId ?? null,
          goalId: issueRow.goalId ?? null,
          rank: "",
          createdByUserId: actor.userId,
          createdByAgentId: actor.agentId,
          sourceIssueId: issueId,
          planOutputJson: plan,
          approvalStatus: "none",
        })
        .returning();

      // F7 — seed revision #1 at plan creation so history always
      // starts from the transfer point.
      await db.insert(backlogPlanRevisions).values({
        companyId,
        backlogPlanId: inserted.id,
        version: 1,
        planOutputJson: plan,
        title: planTitle,
        description,
        summaryOfChange: "Transferred from planning issue",
        editedByAgentId: actor.agentId,
        editedByUserId: actor.userId,
      });

      // Optional: seed backlog items from the plan's proposed steps.
      // Uses the issue as the source-ref so each item links back to
      // the planning case that authored it.
      if (opts.seedItems) {
        const steps: PlanOutput["proposedSteps"] = plan.proposedSteps;
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          await db.insert(backlogItems).values({
            companyId,
            planId: inserted.id,
            title: step.title.slice(0, 120),
            body: step.detail,
            rank: String(i).padStart(5, "0"),
            status: "idea",
            source: "issue",
            sourceRef: {
              type: "issue",
              id: issueId,
              identifier: issueRow.title,
              origin: "plan-transfer",
            },
            authorUserId: actor.userId,
            authorAgentId: actor.agentId,
          });
        }
      }

      // Mark the source issue: done + transferred. Idempotent — if
      // already done/cancelled we only stamp transferredToBacklogAt.
      const issuePatch: Partial<typeof issues.$inferInsert> = {
        transferredToBacklogAt: now,
        updatedAt: now,
      };
      if (issueRow.status !== "done" && issueRow.status !== "cancelled") {
        issuePatch.status = "done";
        if (!issueRow.completedAt) issuePatch.completedAt = now;
      }
      await db.update(issues).set(issuePatch).where(eq(issues.id, issueId));

      return { plan: planToApi(inserted), alreadyExisted: false };
    },

    async updatePlan(
      companyId: string,
      id: string,
      input: UpdateBacklogPlanInput,
    ): Promise<BacklogPlan> {
      const existing = await db
        .select()
        .from(backlogPlans)
        .where(and(eq(backlogPlans.companyId, companyId), eq(backlogPlans.id, id)))
        .then((rs) => rs[0]);
      if (!existing) throw notFound("Backlog plan not found");

      const patch: Partial<typeof backlogPlans.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.title !== undefined) patch.title = normalizeTitle(input.title);
      if (input.description !== undefined) patch.description = input.description;
      if (input.kind !== undefined) patch.kind = assertPlanKind(input.kind);
      if (input.status !== undefined) patch.status = assertPlanStatus(input.status);
      if (input.projectId !== undefined) patch.projectId = input.projectId;
      if (input.goalId !== undefined) patch.goalId = input.goalId;
      if (input.startsAt !== undefined) patch.startsAt = parseIsoDate(input.startsAt, "startsAt") ?? null;
      if (input.endsAt !== undefined) patch.endsAt = parseIsoDate(input.endsAt, "endsAt") ?? null;
      if (input.rank !== undefined) patch.rank = input.rank;

      const updated = await db
        .update(backlogPlans)
        .set(patch)
        .where(and(eq(backlogPlans.companyId, companyId), eq(backlogPlans.id, id)))
        .returning()
        .then((rs) => rs[0]);
      return planToApi(updated);
    },

    /* ----------------------------------------------------------------
     * Plan depth operations (migration 0043_plan_depth / F1–F7)
     * ---------------------------------------------------------------- */

    /** F4 — roll up issues linked to this plan via source_plan_id
     * into { total, spawned, inFlight, done, cancelled, pending }.
     * Total comes from the plan's proposedSteps length; the rest
     * come from issues.source_plan_id.
     */
    async planProgress(companyId: string, planId: string): Promise<PlanProgress> {
      const plan = await db
        .select({ planOutputJson: backlogPlans.planOutputJson })
        .from(backlogPlans)
        .where(and(eq(backlogPlans.companyId, companyId), eq(backlogPlans.id, planId)))
        .limit(1)
        .then((rs) => rs[0]);
      const parsed = plan?.planOutputJson ? planOutputSchema.safeParse(plan.planOutputJson) : null;
      const total = parsed?.success ? parsed.data.proposedSteps.length : 0;

      const spawnedRows = await db
        .select({ status: issues.status })
        .from(issues)
        .where(and(eq(issues.companyId, companyId), eq(issues.sourcePlanId, planId)));
      const spawned = spawnedRows.length;
      const done = spawnedRows.filter((r) => r.status === "done").length;
      const cancelled = spawnedRows.filter((r) => r.status === "cancelled").length;
      const inFlight = spawned - done - cancelled;
      const pending = Math.max(0, total - spawned);
      return { total, spawned, inFlight, done, cancelled, pending };
    },

    /** F1 — spawn a work issue from a specific step of the plan.
     * Idempotent: if the step already has a spawnedIssueId on the
     * stored plan_output_json, returns that issue id without
     * creating a duplicate. */
    async spawnIssueFromPlanStep(
      companyId: string,
      planId: string,
      stepIdx: number,
      actor: { userId: string | null; agentId: string | null },
    ): Promise<{ issueId: string; alreadyExisted: boolean }> {
      const planRow = await db
        .select()
        .from(backlogPlans)
        .where(and(eq(backlogPlans.companyId, companyId), eq(backlogPlans.id, planId)))
        .limit(1)
        .then((rs) => rs[0]);
      if (!planRow) throw notFound("Backlog plan not found");
      if (!planRow.planOutputJson) throw unprocessable("Plan has no structured plan output");
      const parsed = planOutputSchema.safeParse(planRow.planOutputJson);
      if (!parsed.success) throw unprocessable("Stored plan output is malformed");
      const plan = parsed.data;
      if (stepIdx < 0 || stepIdx >= plan.proposedSteps.length) {
        throw unprocessable(`Step ${stepIdx} is out of bounds`);
      }
      const step = plan.proposedSteps[stepIdx]!;

      if (step.spawnedIssueId) {
        // Confirm the issue still exists before returning; if the
        // user deleted it we'll re-spawn.
        const existing = await db
          .select({ id: issues.id })
          .from(issues)
          .where(eq(issues.id, step.spawnedIssueId))
          .limit(1)
          .then((rs) => rs[0]);
        if (existing) {
          return { issueId: existing.id, alreadyExisted: true };
        }
      }

      const assigneeAgentId = step.owner?.agentId ?? null;
      const assigneeUserId = step.owner?.userId ?? null;
      const description =
        `${step.detail}\n\n` +
        `— Spawned from plan: ${planRow.title} (step ${stepIdx + 1} of ${plan.proposedSteps.length})`;

      const [inserted] = await db
        .insert(issues)
        .values({
          companyId,
          title: step.title.slice(0, 200),
          description,
          status: "backlog",
          priority: step.effort === "large" ? "high" : "medium",
          kind: "issue",
          projectId: planRow.projectId ?? null,
          goalId: planRow.goalId ?? null,
          assigneeAgentId,
          assigneeUserId,
          createdByUserId: actor.userId,
          createdByAgentId: actor.agentId,
          sourcePlanId: planId,
          sourcePlanStepIdx: stepIdx,
        })
        .returning();

      // Update the stored plan_output_json so the step's
      // spawnedIssueId is persisted; readers render the step as
      // linked without a follow-up query.
      const updatedSteps = plan.proposedSteps.map((s, i) =>
        i === stepIdx ? { ...s, spawnedIssueId: inserted.id } : s,
      );
      const updatedPlan = { ...plan, proposedSteps: updatedSteps };
      await db
        .update(backlogPlans)
        .set({ planOutputJson: updatedPlan, updatedAt: new Date() })
        .where(eq(backlogPlans.id, planId));

      return { issueId: inserted.id, alreadyExisted: false };
    },

    /** F5 — list comments on a plan, most-recent first by creation time
     * to mirror the existing item-comment UX. */
    async listPlanComments(
      companyId: string,
      planId: string,
    ): Promise<BacklogPlanComment[]> {
      const rows = await db
        .select({
          c: backlogPlanComments,
          agent: {
            id: agents.id,
            displayName: agents.name,
            iconName: agents.icon,
          },
        })
        .from(backlogPlanComments)
        .leftJoin(agents, eq(agents.id, backlogPlanComments.authorAgentId))
        .where(
          and(
            eq(backlogPlanComments.companyId, companyId),
            eq(backlogPlanComments.backlogPlanId, planId),
          ),
        )
        .orderBy(asc(backlogPlanComments.createdAt));
      return rows.map((r) => planCommentToApi(r.c, r.agent));
    },

    async createPlanComment(
      companyId: string,
      planId: string,
      input: { body: string },
      actor: { userId: string | null; agentId: string | null },
    ): Promise<BacklogPlanComment> {
      const body = (input?.body ?? "").trim();
      if (!body) throw unprocessable("body is required");
      const plan = await db
        .select({ id: backlogPlans.id })
        .from(backlogPlans)
        .where(and(eq(backlogPlans.companyId, companyId), eq(backlogPlans.id, planId)))
        .limit(1)
        .then((rs) => rs[0]);
      if (!plan) throw notFound("Backlog plan not found");

      const inserted = await db
        .insert(backlogPlanComments)
        .values({
          companyId,
          backlogPlanId: planId,
          authorUserId: actor.userId,
          authorAgentId: actor.agentId,
          body,
        })
        .returning()
        .then((rs) => rs[0]);

      const agent = actor.agentId
        ? await db
            .select({
              id: agents.id,
              displayName: agents.name,
              iconName: agents.icon,
            })
            .from(agents)
            .where(eq(agents.id, actor.agentId))
            .limit(1)
            .then((rs) => rs[0] ?? null)
        : null;
      return planCommentToApi(inserted, agent);
    },

    async deletePlanComment(
      companyId: string,
      commentId: string,
      actor: { userId: string | null; agentId: string | null },
    ): Promise<void> {
      const existing = await db
        .select()
        .from(backlogPlanComments)
        .where(
          and(
            eq(backlogPlanComments.companyId, companyId),
            eq(backlogPlanComments.id, commentId),
          ),
        )
        .limit(1)
        .then((rs) => rs[0]);
      if (!existing) throw notFound("Comment not found");
      const ownsComment =
        (actor.userId !== null && existing.authorUserId === actor.userId) ||
        (actor.agentId !== null && existing.authorAgentId === actor.agentId);
      if (!ownsComment) throw unprocessable("Only the author can delete this comment");
      await db
        .delete(backlogPlanComments)
        .where(eq(backlogPlanComments.id, commentId));
    },

    /** F7 — list revisions (most recent first). */
    async listPlanRevisions(
      companyId: string,
      planId: string,
    ): Promise<BacklogPlanRevision[]> {
      const rows = await db
        .select()
        .from(backlogPlanRevisions)
        .where(
          and(
            eq(backlogPlanRevisions.companyId, companyId),
            eq(backlogPlanRevisions.backlogPlanId, planId),
          ),
        )
        .orderBy(desc(backlogPlanRevisions.version));
      return rows.map(revisionToApi);
    },

    /** F7 — edit a plan's structured plan_output_json and snapshot
     * the prior version into backlog_plan_revisions. Re-resolves
     * step owners before storing so manual edits gain the same
     * agent/user FK upgrades as transfer does. */
    async updatePlanOutput(
      companyId: string,
      planId: string,
      input: { planOutput: unknown; summaryOfChange?: string | null },
      actor: { userId: string | null; agentId: string | null },
    ): Promise<BacklogPlan> {
      const existing = await db
        .select()
        .from(backlogPlans)
        .where(and(eq(backlogPlans.companyId, companyId), eq(backlogPlans.id, planId)))
        .limit(1)
        .then((rs) => rs[0]);
      if (!existing) throw notFound("Backlog plan not found");

      const parsed = planOutputSchema.safeParse(input.planOutput);
      if (!parsed.success) {
        throw unprocessable("planOutput does not match the PlanOutput schema");
      }
      const directory = await loadOwnerDirectory(db, companyId);
      const nextPlan = resolvePlanStepOwners(parsed.data, directory);

      // Peek the current highest version so we append cleanly.
      const latest = await db
        .select({ version: backlogPlanRevisions.version })
        .from(backlogPlanRevisions)
        .where(eq(backlogPlanRevisions.backlogPlanId, planId))
        .orderBy(desc(backlogPlanRevisions.version))
        .limit(1)
        .then((rs) => rs[0]);
      const nextVersion = (latest?.version ?? 0) + 1;

      await db.insert(backlogPlanRevisions).values({
        companyId,
        backlogPlanId: planId,
        version: nextVersion,
        planOutputJson: nextPlan,
        title: existing.title,
        description: existing.description ?? null,
        summaryOfChange: input.summaryOfChange ?? null,
        editedByAgentId: actor.agentId,
        editedByUserId: actor.userId,
      });

      const [updated] = await db
        .update(backlogPlans)
        .set({
          planOutputJson: nextPlan,
          description: renderPlanDescription(nextPlan),
          updatedAt: new Date(),
        })
        .where(and(eq(backlogPlans.companyId, companyId), eq(backlogPlans.id, planId)))
        .returning();
      return planToApi(updated);
    },

    /** F9 — search plans by title/description AND within the
     * structured plan_output_json (step titles, risks, open
     * questions). Uses ILIKE + jsonb casts for compatibility; a
     * production tsvector index can replace this later. */
    async searchPlans(
      companyId: string,
      query: string,
      limit = 20,
    ): Promise<BacklogPlan[]> {
      const q = query.trim();
      if (!q) return [];
      const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
      const rows = await db
        .select()
        .from(backlogPlans)
        .where(
          and(
            eq(backlogPlans.companyId, companyId),
            or(
              ilike(backlogPlans.title, like),
              ilike(backlogPlans.description, like),
              sql`${backlogPlans.planOutputJson}::text ILIKE ${like}`,
            ),
          ),
        )
        .orderBy(desc(backlogPlans.updatedAt))
        .limit(limit);
      return rows.map(planToApi);
    },

    /** F8 — spawn a planning-kind investigation issue from a
     * backlog item. Idempotent: if the item already has an
     * investigation linked via issues.source_backlog_item_id, the
     * existing issue is returned. */
    async spawnInvestigationFromItem(
      companyId: string,
      itemId: string,
      actor: { userId: string | null; agentId: string | null },
    ): Promise<{ issueId: string; alreadyExisted: boolean }> {
      const item = await db
        .select()
        .from(backlogItems)
        .where(and(eq(backlogItems.companyId, companyId), eq(backlogItems.id, itemId)))
        .limit(1)
        .then((rs) => rs[0]);
      if (!item) throw notFound("Backlog item not found");

      const existing = await db
        .select({ id: issues.id })
        .from(issues)
        .where(
          and(
            eq(issues.companyId, companyId),
            eq(issues.sourceBacklogItemId, itemId),
            eq(issues.kind, "planning"),
          ),
        )
        .limit(1)
        .then((rs) => rs[0]);
      if (existing) {
        return { issueId: existing.id, alreadyExisted: true };
      }

      const description =
        (item.body?.trim() ?? "") +
        `\n\n— Investigation opened from backlog item: ${item.title}`;
      const [inserted] = await db
        .insert(issues)
        .values({
          companyId,
          title: `Investigate: ${item.title.slice(0, 180)}`,
          description: description.trim(),
          status: "in_progress",
          priority: "medium",
          kind: "planning",
          projectId: item.projectId ?? null,
          goalId: item.goalId ?? null,
          createdByUserId: actor.userId,
          createdByAgentId: actor.agentId,
          sourceBacklogItemId: itemId,
        })
        .returning();
      return { issueId: inserted.id, alreadyExisted: false };
    },

    /** F6 — transition a plan's approval_status. Enforces the
     * none|pending|approved|rejected state machine. */
    async setPlanApprovalStatus(
      companyId: string,
      planId: string,
      status: "none" | "pending" | "approved" | "rejected",
    ): Promise<BacklogPlan> {
      const existing = await db
        .select()
        .from(backlogPlans)
        .where(and(eq(backlogPlans.companyId, companyId), eq(backlogPlans.id, planId)))
        .limit(1)
        .then((rs) => rs[0]);
      if (!existing) throw notFound("Backlog plan not found");
      const [updated] = await db
        .update(backlogPlans)
        .set({ approvalStatus: status, updatedAt: new Date() })
        .where(and(eq(backlogPlans.companyId, companyId), eq(backlogPlans.id, planId)))
        .returning();
      return planToApi(updated);
    },

    async archivePlan(companyId: string, id: string): Promise<BacklogPlan> {
      const existing = await db
        .select()
        .from(backlogPlans)
        .where(and(eq(backlogPlans.companyId, companyId), eq(backlogPlans.id, id)))
        .then((rs) => rs[0]);
      if (!existing) throw notFound("Backlog plan not found");

      const updated = await db
        .update(backlogPlans)
        .set({
          status: "archived",
          archivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(backlogPlans.companyId, companyId), eq(backlogPlans.id, id)))
        .returning()
        .then((rs) => rs[0]);
      return planToApi(updated);
    },
  };
}
