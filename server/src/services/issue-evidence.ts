/**
 * Issue-file evidence services (backlog 2.0 B1 / B3 / B4, 1.5 A1 / A2 / B2).
 *
 * Covers:
 *   - evidence-set CRUD (named curations per issue)
 *   - file-evidence attachments on comments (immutable refs)
 *   - ranked "relevance" listing for the issue detail page
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agentFileSnapshots,
  agents,
  commentFileEvidence,
  issueComments,
  issueEvidenceSetItems,
  issueEvidenceSets,
  issueSummaryFiles,
  heartbeatRuns,
} from "@paperclipai/db";
import type {
  CommentFileEvidence,
  IssueEvidenceSet,
  IssueEvidenceSetDetail,
  IssueEvidenceSetItem,
  IssueRelevantFile,
} from "@paperclipai/shared";

export function issueEvidenceService(db: Db) {
  return {
    /**
     * Ranked relevance for an issue: recency, edit operations,
     * summary-link presence, and mention frequency in issue comments.
     */
    async listRelevant(
      companyId: string,
      issueId: string,
      limit = 20,
    ): Promise<IssueRelevantFile[]> {
      // 1) Find runs bound to this issue via comments that reference runIds.
      //    Heuristic: heartbeat runs whose comments/description link to the
      //    issue aren't directly modeled here; instead, we use all snapshots
      //    from runs referenced in issue comments PLUS runs whose agent is
      //    currently checked out to this issue. Fallback: recent snapshots
      //    from the whole company (so small demos still produce signal).
      //
      //    Simpler approach: find snapshots for runs that share an agent
      //    with any comment on this issue, within the last 60 days.
      const recentWindowSql = sql`now() - interval '60 days'`;

      const commentRows = await db
        .select({ body: issueComments.body })
        .from(issueComments)
        .where(eq(issueComments.issueId, issueId));
      const allCommentBodies = commentRows.map((c) => c.body).join("\n");

      // Summary-linked snapshot ids (boost these)
      const summary = await db
        .select({ snapshotId: issueSummaryFiles.snapshotId })
        .from(issueSummaryFiles)
        .where(eq(issueSummaryFiles.issueId, issueId));
      const summarySnapIds = new Set(summary.map((s) => s.snapshotId));

      // Evidence-set item snapshot ids (also considered relevant)
      const setItemRows = await db
        .select({ snapshotId: issueEvidenceSetItems.snapshotId })
        .from(issueEvidenceSetItems)
        .innerJoin(issueEvidenceSets, eq(issueEvidenceSetItems.setId, issueEvidenceSets.id))
        .where(eq(issueEvidenceSets.issueId, issueId));
      const setSnapIds = new Set(setItemRows.map((r) => r.snapshotId));

      // Take the latest N snapshots for the company in the recent window.
      const rows = await db
        .select({
          id: agentFileSnapshots.id,
          filePath: agentFileSnapshots.filePath,
          contentHash: agentFileSnapshots.contentHash,
          operation: agentFileSnapshots.operation,
          agentId: agentFileSnapshots.agentId,
          runId: agentFileSnapshots.runId,
          capturedAt: agentFileSnapshots.capturedAt,
        })
        .from(agentFileSnapshots)
        .where(
          and(
            eq(agentFileSnapshots.companyId, companyId),
            sql`${agentFileSnapshots.capturedAt} >= ${recentWindowSql}`,
          ),
        )
        .orderBy(desc(agentFileSnapshots.capturedAt))
        .limit(200);

      // Resolve agent names in one query.
      const agentIds = [...new Set(rows.map((r) => r.agentId))];
      const agentRows = agentIds.length
        ? await db
            .select({ id: agents.id, name: agents.name })
            .from(agents)
            .where(inArray(agents.id, agentIds))
        : [];
      const agentNameMap = new Map(agentRows.map((a) => [a.id, a.name]));

      // Deduplicate by filePath, keep the latest snapshot per path.
      const latestByPath = new Map<string, typeof rows[number]>();
      for (const r of rows) {
        if (!latestByPath.has(r.filePath)) latestByPath.set(r.filePath, r);
      }

      const now = Date.now();
      const out: IssueRelevantFile[] = [];
      for (const [filePath, r] of latestByPath) {
        const ageMs = now - r.capturedAt.getTime();
        const recency = Math.max(0, 1 - ageMs / (60 * 24 * 3600 * 1000));
        const editOp = r.operation === "edit" || r.operation === "write";
        const summaryLinked = summarySnapIds.has(r.id);
        const inSet = setSnapIds.has(r.id);
        const base = filePath.split(/[\\/]/).pop() ?? filePath;
        const mentions = allCommentBodies
          ? ((): number => {
              try {
                const re = new RegExp(escapeRegex(base), "gi");
                return (allCommentBodies.match(re) ?? []).length;
              } catch { return 0; }
            })()
          : 0;

        // Score: weighted sum that favors actionable signals.
        const score =
          recency * 1.5 +
          (editOp ? 1.0 : 0) +
          (summaryLinked ? 2.0 : 0) +
          (inSet ? 1.5 : 0) +
          Math.min(mentions, 5) * 0.5;

        if (score <= 0) continue;

        out.push({
          filePath,
          contentHash: r.contentHash,
          snapshotId: r.id,
          operation: r.operation,
          agentId: r.agentId,
          agentName: agentNameMap.get(r.agentId) ?? null,
          runId: r.runId,
          capturedAt: r.capturedAt.toISOString(),
          score: Math.round(score * 1000) / 1000,
          signals: {
            recency: Math.round(recency * 1000) / 1000,
            editOperation: editOp,
            summaryLinked,
            mentions,
          },
        });
      }

      return out
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },

    // ─── Evidence sets (backlog 2.0 B4 / 1.5 A2) ────────────────────────

    async listEvidenceSets(companyId: string, issueId: string): Promise<IssueEvidenceSet[]> {
      const rows = await db
        .select({
          id: issueEvidenceSets.id,
          companyId: issueEvidenceSets.companyId,
          issueId: issueEvidenceSets.issueId,
          name: issueEvidenceSets.name,
          description: issueEvidenceSets.description,
          createdByUserId: issueEvidenceSets.createdByUserId,
          createdAt: issueEvidenceSets.createdAt,
          updatedAt: issueEvidenceSets.updatedAt,
          itemCount: sql<number>`(select count(*)::int from ${issueEvidenceSetItems} where ${issueEvidenceSetItems.setId} = ${issueEvidenceSets.id})`,
        })
        .from(issueEvidenceSets)
        .where(and(
          eq(issueEvidenceSets.companyId, companyId),
          eq(issueEvidenceSets.issueId, issueId),
        ))
        .orderBy(desc(issueEvidenceSets.createdAt));

      return rows.map((r) => ({
        id: r.id,
        companyId: r.companyId,
        issueId: r.issueId,
        name: r.name,
        description: r.description,
        createdByUserId: r.createdByUserId,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        itemCount: r.itemCount ?? 0,
      }));
    },

    async createEvidenceSet(params: {
      companyId: string;
      issueId: string;
      name: string;
      description?: string | null;
      createdByUserId?: string | null;
    }): Promise<IssueEvidenceSet> {
      const inserted = await db
        .insert(issueEvidenceSets)
        .values({
          companyId: params.companyId,
          issueId: params.issueId,
          name: params.name,
          description: params.description ?? null,
          createdByUserId: params.createdByUserId ?? null,
        })
        .returning()
        .then((rs) => rs[0]);
      return {
        id: inserted.id,
        companyId: inserted.companyId,
        issueId: inserted.issueId,
        name: inserted.name,
        description: inserted.description,
        createdByUserId: inserted.createdByUserId,
        createdAt: inserted.createdAt.toISOString(),
        updatedAt: inserted.updatedAt.toISOString(),
        itemCount: 0,
      };
    },

    async deleteEvidenceSet(companyId: string, setId: string): Promise<void> {
      await db
        .delete(issueEvidenceSets)
        .where(and(
          eq(issueEvidenceSets.companyId, companyId),
          eq(issueEvidenceSets.id, setId),
        ));
    },

    async getEvidenceSet(companyId: string, setId: string): Promise<IssueEvidenceSetDetail | null> {
      const set = await db
        .select()
        .from(issueEvidenceSets)
        .where(and(
          eq(issueEvidenceSets.companyId, companyId),
          eq(issueEvidenceSets.id, setId),
        ))
        .then((rs) => rs[0]);
      if (!set) return null;

      const items = await db
        .select({
          id: issueEvidenceSetItems.id,
          setId: issueEvidenceSetItems.setId,
          snapshotId: issueEvidenceSetItems.snapshotId,
          note: issueEvidenceSetItems.note,
          createdAt: issueEvidenceSetItems.createdAt,
          filePath: agentFileSnapshots.filePath,
          contentHash: agentFileSnapshots.contentHash,
        })
        .from(issueEvidenceSetItems)
        .innerJoin(agentFileSnapshots, eq(issueEvidenceSetItems.snapshotId, agentFileSnapshots.id))
        .where(eq(issueEvidenceSetItems.setId, setId))
        .orderBy(desc(issueEvidenceSetItems.createdAt));

      return {
        id: set.id,
        companyId: set.companyId,
        issueId: set.issueId,
        name: set.name,
        description: set.description,
        createdByUserId: set.createdByUserId,
        createdAt: set.createdAt.toISOString(),
        updatedAt: set.updatedAt.toISOString(),
        itemCount: items.length,
        items: items.map((r): IssueEvidenceSetItem => ({
          id: r.id,
          setId: r.setId,
          snapshotId: r.snapshotId,
          filePath: r.filePath,
          contentHash: r.contentHash,
          note: r.note,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    },

    async addItemToSet(setId: string, snapshotId: string, note?: string | null): Promise<IssueEvidenceSetItem | null> {
      const row = await db
        .insert(issueEvidenceSetItems)
        .values({ setId, snapshotId, note: note ?? null })
        .onConflictDoNothing()
        .returning()
        .then((rs) => rs[0]);
      if (!row) return null;
      const snap = await db
        .select({ filePath: agentFileSnapshots.filePath, contentHash: agentFileSnapshots.contentHash })
        .from(agentFileSnapshots)
        .where(eq(agentFileSnapshots.id, snapshotId))
        .then((rs) => rs[0]);
      return {
        id: row.id,
        setId: row.setId,
        snapshotId: row.snapshotId,
        filePath: snap?.filePath ?? "",
        contentHash: snap?.contentHash ?? null,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
      };
    },

    async removeItemFromSet(setId: string, itemId: string): Promise<void> {
      await db
        .delete(issueEvidenceSetItems)
        .where(and(
          eq(issueEvidenceSetItems.setId, setId),
          eq(issueEvidenceSetItems.id, itemId),
        ));
    },

    // ─── Comment file evidence (backlog 2.0 B3 / 1.5 B2) ────────────────

    async listCommentEvidence(issueId: string): Promise<CommentFileEvidence[]> {
      const rows = await db
        .select()
        .from(commentFileEvidence)
        .where(eq(commentFileEvidence.issueId, issueId))
        .orderBy(desc(commentFileEvidence.createdAt));
      return rows.map((r) => ({
        id: r.id,
        companyId: r.companyId,
        issueId: r.issueId,
        commentId: r.commentId,
        filePath: r.filePath,
        contentHash: r.contentHash,
        snapshotId: r.snapshotId,
        excerpt: r.excerpt,
        createdAt: r.createdAt.toISOString(),
      }));
    },

    async addCommentEvidence(params: {
      companyId: string;
      issueId: string;
      commentId: string;
      filePath: string;
      contentHash?: string | null;
      snapshotId?: string | null;
      excerpt?: string | null;
    }): Promise<CommentFileEvidence> {
      const row = await db
        .insert(commentFileEvidence)
        .values({
          companyId: params.companyId,
          issueId: params.issueId,
          commentId: params.commentId,
          filePath: params.filePath,
          contentHash: params.contentHash ?? null,
          snapshotId: params.snapshotId ?? null,
          excerpt: params.excerpt ?? null,
        })
        .returning()
        .then((rs) => rs[0]);
      return {
        id: row.id,
        companyId: row.companyId,
        issueId: row.issueId,
        commentId: row.commentId,
        filePath: row.filePath,
        contentHash: row.contentHash,
        snapshotId: row.snapshotId,
        excerpt: row.excerpt,
        createdAt: row.createdAt.toISOString(),
      };
    },

    async deleteCommentEvidence(evidenceId: string): Promise<void> {
      await db.delete(commentFileEvidence).where(eq(commentFileEvidence.id, evidenceId));
    },

    /** Best-effort: resolve a path + contentHash to a recent snapshotId (for evidence set writes from Files page). */
    async resolveSnapshotIdByHash(
      companyId: string,
      filePath: string,
      contentHash: string | null,
    ): Promise<string | null> {
      const conds = [
        eq(agentFileSnapshots.companyId, companyId),
        eq(agentFileSnapshots.filePath, filePath),
      ];
      if (contentHash) conds.push(eq(agentFileSnapshots.contentHash, contentHash));
      const row = await db
        .select({ id: agentFileSnapshots.id })
        .from(agentFileSnapshots)
        .where(and(...conds))
        .orderBy(desc(agentFileSnapshots.capturedAt))
        .limit(1)
        .then((rs) => rs[0]);
      return row?.id ?? null;
    },

    /**
     * Workspace artifact browser (backlog 1.md 3.2).
     * Exposes workflow artifact paths + metadata from indexed snapshots.
     */
    async listWorkflowArtifacts(companyId: string, limit = 200): Promise<IssueRelevantFile[]> {
      const rows = await db
        .select({
          id: agentFileSnapshots.id,
          filePath: agentFileSnapshots.filePath,
          contentHash: agentFileSnapshots.contentHash,
          operation: agentFileSnapshots.operation,
          agentId: agentFileSnapshots.agentId,
          runId: agentFileSnapshots.runId,
          capturedAt: agentFileSnapshots.capturedAt,
        })
        .from(agentFileSnapshots)
        .innerJoin(heartbeatRuns, eq(agentFileSnapshots.runId, heartbeatRuns.id))
        .where(and(
          eq(agentFileSnapshots.companyId, companyId),
          sql`${agentFileSnapshots.filePath} ILIKE '%workflow-artifacts%'`,
        ))
        .orderBy(desc(agentFileSnapshots.capturedAt))
        .limit(limit);

      const agentIds = [...new Set(rows.map((r) => r.agentId))];
      const agentRows = agentIds.length
        ? await db
            .select({ id: agents.id, name: agents.name })
            .from(agents)
            .where(inArray(agents.id, agentIds))
        : [];
      const agentNameMap = new Map(agentRows.map((a) => [a.id, a.name]));

      return rows.map((r) => ({
        filePath: r.filePath,
        contentHash: r.contentHash,
        snapshotId: r.id,
        operation: r.operation,
        agentId: r.agentId,
        agentName: agentNameMap.get(r.agentId) ?? null,
        runId: r.runId,
        capturedAt: r.capturedAt.toISOString(),
        score: 1,
        signals: { recency: 1, editOperation: false, summaryLinked: false, mentions: 0 },
      }));
    },
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
