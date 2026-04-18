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
  backlogItems,
  backlogPlans,
  type BacklogItemRow,
  type BacklogPlanRow,
} from "@paperclipai/db";
import type {
  BacklogItem,
  BacklogItemFilters,
  BacklogItemSource,
  BacklogItemSourceRef,
  BacklogItemStatus,
  BacklogPlan,
  BacklogPlanKind,
  BacklogPlanStatus,
  CreateBacklogItemInput,
  CreateBacklogPlanInput,
  ReorderBacklogItemInput,
  UpdateBacklogItemInput,
  UpdateBacklogPlanInput,
} from "@paperclipai/shared";
import {
  BACKLOG_ITEM_SOURCES,
  BACKLOG_ITEM_STATUSES,
  BACKLOG_PLAN_KINDS,
  BACKLOG_PLAN_STATUSES,
} from "@paperclipai/shared";
import { notFound, unprocessable } from "../errors.js";

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
     * Soft delete. Sets `deletedAt` and transitions status to `archived`
     * so the item stays queryable for lineage + reverse flows.
     */
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
