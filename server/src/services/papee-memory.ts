import type { Db } from "@paperclipai/db";
import { papeeMemory, and, eq, desc, sql } from "@paperclipai/db";

/**
 * Papee long-term memory service (PAPEE_TOOLS_PLAN.md §M.1–M.3).
 *
 * Three layers exist conceptually:
 *   - working  → in-RAM, current chat (handled by chat service)
 *   - session  → sessionStorage on the client
 *   - long     → this table
 *
 * This module owns the long layer: read/write/decay/prune.
 */

export type PapeeMemoryType =
  | "preference"
  | "relationship"
  | "event"
  | "goal"
  | "quirk"
  | "pet-peeve"
  | "nickname"
  | "shared-event";

export type PapeeMemoryCreatedBy = "stated" | "observed" | "inferred" | "outcome";

export interface RememberInput {
  companyId: string;
  userId: string | null;
  type: PapeeMemoryType;
  content: string;
  confidence?: number;
  createdBy?: PapeeMemoryCreatedBy;
  sourceMessageId?: string;
}

const MAX_ROWS_PER_USER = 200;
const REDACT_PATTERNS: RegExp[] = [
  /\b(?:[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g, // emails
  /\b(?:sk|pk|ghp|github_pat|xoxb)[-_][A-Za-z0-9_\-]{16,}\b/g, // common token shapes
  /\b[A-Fa-f0-9]{32,}\b/g, // long hex (likely tokens / hashes)
];

function redact(content: string): string {
  let out = content;
  for (const re of REDACT_PATTERNS) out = out.replace(re, "[REDACTED]");
  return out.slice(0, 600);
}

/**
 * In-process per-(companyId × userId) flag — set true on the first
 * write of a server session so the chat layer can surface a one-time
 * "noted that…" line on the next response (PAPEE_TOOLS_PLAN.md §M.11).
 */
const FIRST_WRITE_FLAG = new Set<string>();

export function consumeFirstWriteFlag(companyId: string, userId: string | null): boolean {
  const key = `${companyId}:${userId ?? "shared"}`;
  if (FIRST_WRITE_FLAG.has(key)) {
    FIRST_WRITE_FLAG.delete(key);
    return true;
  }
  return false;
}

export async function remember(db: Db, input: RememberInput) {
  const content = redact(input.content);
  const confidence = clampConfidence(input.confidence ?? (input.createdBy === "stated" ? 1 : 0.6));

  await db.insert(papeeMemory).values({
    companyId: input.companyId,
    userId: input.userId,
    type: input.type,
    content,
    confidence,
    createdBy: input.createdBy ?? "observed",
    sourceMessageId: input.sourceMessageId ?? null,
  });

  FIRST_WRITE_FLAG.add(`${input.companyId}:${input.userId ?? "shared"}`);
  await pruneIfOver(db, input.companyId, input.userId);
}

/* Decay scheduling is owned by the central job queue —
 * see server/src/services/job-registrations.ts ("papee-memory-decay")
 * and the schedule() call in server/src/index.ts. */

export async function forget(db: Db, opts: { companyId: string; userId: string | null; pattern?: string }) {
  if (opts.pattern && opts.pattern !== "all") {
    await db
      .delete(papeeMemory)
      .where(
        and(
          eq(papeeMemory.companyId, opts.companyId),
          opts.userId ? eq(papeeMemory.userId, opts.userId) : sql`${papeeMemory.userId} IS NULL`,
          sql`${papeeMemory.content} ILIKE ${"%" + opts.pattern + "%"}`,
        ),
      );
    return;
  }
  await db
    .delete(papeeMemory)
    .where(
      and(
        eq(papeeMemory.companyId, opts.companyId),
        opts.userId ? eq(papeeMemory.userId, opts.userId) : sql`${papeeMemory.userId} IS NULL`,
      ),
    );
}

export interface MemoryRow {
  id: string;
  type: string;
  content: string;
  confidence: number;
  createdBy: string;
  lastConfirmedAt: Date;
}

export async function recall(
  db: Db,
  opts: { companyId: string; userId: string | null; limit?: number },
): Promise<MemoryRow[]> {
  const limit = opts.limit ?? 15;
  const rows = await db
    .select()
    .from(papeeMemory)
    .where(
      and(
        eq(papeeMemory.companyId, opts.companyId),
        opts.userId ? eq(papeeMemory.userId, opts.userId) : sql`${papeeMemory.userId} IS NULL`,
      ),
    )
    .orderBy(desc(papeeMemory.confidence), desc(papeeMemory.lastConfirmedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    content: r.content,
    confidence: r.confidence,
    createdBy: r.createdBy,
    lastConfirmedAt: r.lastConfirmedAt,
  }));
}

/**
 * Build the compact memory injection block (M.3) for the system prompt.
 * Returns "" when there are no rows so the prompt stays clean.
 */
export async function buildMemoryInjection(
  db: Db,
  opts: { companyId: string; userId: string | null },
): Promise<string> {
  const rows = await recall(db, opts);
  if (rows.length === 0) return "";

  const byType = new Map<string, string[]>();
  for (const r of rows) {
    if (!byType.has(r.type)) byType.set(r.type, []);
    byType.get(r.type)!.push(r.content);
  }

  const order: PapeeMemoryType[] = [
    "nickname", "preference", "pet-peeve", "quirk",
    "relationship", "goal", "event", "shared-event",
  ];
  const lines: string[] = ["WHO YOU'RE TALKING TO:"];
  for (const t of order) {
    const items = byType.get(t);
    if (!items?.length) continue;
    lines.push(`- ${t}: ${items.slice(0, 3).join("; ")}`);
  }
  return lines.join("\n");
}

/** -0.05 / week decay; called from a cron job (not wired here). */
export async function decayConfidence(db: Db) {
  await db.execute(sql`
    UPDATE papee_memory
    SET confidence = GREATEST(0, confidence - 0.05 *
      (EXTRACT(EPOCH FROM (now() - last_confirmed_at)) / 604800))
    WHERE last_confirmed_at < now() - INTERVAL '7 days'
  `);
}

async function pruneIfOver(db: Db, companyId: string, userId: string | null) {
  const rows = await db
    .select({ id: papeeMemory.id, confidence: papeeMemory.confidence })
    .from(papeeMemory)
    .where(
      and(
        eq(papeeMemory.companyId, companyId),
        userId ? eq(papeeMemory.userId, userId) : sql`${papeeMemory.userId} IS NULL`,
      ),
    );
  if (rows.length <= MAX_ROWS_PER_USER) return;

  rows.sort((a, b) => a.confidence - b.confidence);
  const toDelete = rows.slice(0, rows.length - MAX_ROWS_PER_USER).map((r) => r.id);
  if (toDelete.length === 0) return;
  await db
    .delete(papeeMemory)
    .where(sql`${papeeMemory.id} = ANY(${toDelete})`);
}

function clampConfidence(c: number): number {
  if (c < 0) return 0;
  if (c > 1) return 1;
  return c;
}
