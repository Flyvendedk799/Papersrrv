/**
 * Issue handoff checklist service (backlog 1.5 B3).
 */

import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  issueHandoffChecklists,
  HANDOFF_DEFAULT_ITEMS,
  type HandoffChecklistItem,
} from "@paperclipai/db";
import type { HandoffChecklist, HandoffEnforcement } from "@paperclipai/shared";

function toApi(row: typeof issueHandoffChecklists.$inferSelect): HandoffChecklist {
  return {
    id: row.id,
    companyId: row.companyId,
    issueId: row.issueId,
    enforcement: (row.enforcement as HandoffEnforcement) ?? "advisory",
    items: (row.items as HandoffChecklistItem[]) ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function handoffChecklistService(db: Db) {
  return {
    async getOrInit(companyId: string, issueId: string): Promise<HandoffChecklist> {
      const existing = await db
        .select()
        .from(issueHandoffChecklists)
        .where(and(
          eq(issueHandoffChecklists.companyId, companyId),
          eq(issueHandoffChecklists.issueId, issueId),
        ))
        .then((rs) => rs[0]);
      if (existing) return toApi(existing);

      const inserted = await db
        .insert(issueHandoffChecklists)
        .values({
          companyId,
          issueId,
          enforcement: "advisory",
          items: HANDOFF_DEFAULT_ITEMS,
        })
        .returning()
        .then((rs) => rs[0]);
      return toApi(inserted);
    },

    async update(
      companyId: string,
      issueId: string,
      patch: { enforcement?: HandoffEnforcement; items?: HandoffChecklistItem[]; userId?: string | null },
    ): Promise<HandoffChecklist> {
      const existing = await this.getOrInit(companyId, issueId);
      const next = {
        enforcement: patch.enforcement ?? existing.enforcement,
        items: patch.items ?? existing.items,
        lastUpdatedByUserId: patch.userId ?? null,
        updatedAt: new Date(),
      };
      const updated = await db
        .update(issueHandoffChecklists)
        .set(next)
        .where(and(
          eq(issueHandoffChecklists.companyId, companyId),
          eq(issueHandoffChecklists.issueId, issueId),
        ))
        .returning()
        .then((rs) => rs[0]);
      return toApi(updated);
    },

    /** Used by issue transition guard: returns true if closing is allowed. */
    async canClose(companyId: string, issueId: string): Promise<{ allowed: boolean; reason?: string }> {
      const row = await db
        .select()
        .from(issueHandoffChecklists)
        .where(and(
          eq(issueHandoffChecklists.companyId, companyId),
          eq(issueHandoffChecklists.issueId, issueId),
        ))
        .then((rs) => rs[0]);
      if (!row) return { allowed: true };
      if (row.enforcement !== "required") return { allowed: true };
      const items = (row.items as HandoffChecklistItem[]) ?? [];
      const unresolved = items.filter((i) => !i.checked);
      if (unresolved.length === 0) return { allowed: true };
      return {
        allowed: false,
        reason: `Handoff checklist incomplete: ${unresolved.map((i) => i.label).join(", ")}`,
      };
    },
  };
}
