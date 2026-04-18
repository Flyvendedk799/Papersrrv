/**
 * Canonical File Context (backlog 2.0 A1)
 *
 * A single shape used by Files, Issue, Run, and Activity surfaces to
 * represent "which file/version am I looking at and why".
 *
 * Deep links: /files?file=PATH&hash=HASH&runId=RUN&agentId=AGENT&issueId=ISSUE&source=SRC
 *
 * All fields are optional except filePath/source when building a link;
 * consumers MUST degrade gracefully when fields are missing (see
 * backlog 2.0 "Content immutability invariant" + "Shared edge coverage").
 */

export type FileContextSource =
  | "files"
  | "issue"
  | "run"
  | "activity"
  | "comment"
  | "papee"
  | "workflow"
  | "unknown";

export interface FileContext {
  companyId?: string;
  filePath: string;
  /** Content-addressed version (sha). Preferred over runId for stability. */
  contentHash?: string | null;
  /** Specific snapshot row id (optional, used for summary linking etc). */
  snapshotId?: string | null;
  runId?: string | null;
  agentId?: string | null;
  issueId?: string | null;
  source: FileContextSource;
  /** Optional preset hint for Files page (e.g. "run-focused", "markdown"). */
  preset?: string | null;
}

export function buildFilesHref(ctx: FileContext, opts?: { includeFile?: boolean }): string {
  const params = new URLSearchParams();
  if (opts?.includeFile !== false) params.set("file", ctx.filePath);
  if (ctx.contentHash) params.set("hash", ctx.contentHash);
  if (ctx.runId) params.set("runId", ctx.runId);
  if (ctx.agentId) params.set("agentId", ctx.agentId);
  if (ctx.issueId) params.set("issueId", ctx.issueId);
  if (ctx.source && ctx.source !== "unknown") params.set("source", ctx.source);
  if (ctx.preset) params.set("preset", ctx.preset);
  const qs = params.toString();
  return `/files${qs ? `?${qs}` : ""}`;
}

export function parseFileContextFromSearch(
  search: URLSearchParams,
): Partial<FileContext> {
  const filePath = search.get("file") ?? undefined;
  const contentHash = search.get("hash") ?? undefined;
  const runId = search.get("runId") ?? undefined;
  const agentId = search.get("agentId") ?? undefined;
  const issueId = search.get("issueId") ?? undefined;
  const source = (search.get("source") ?? undefined) as FileContextSource | undefined;
  const preset = search.get("preset") ?? undefined;
  return {
    filePath: filePath ?? "",
    contentHash: contentHash ?? null,
    runId: runId ?? null,
    agentId: agentId ?? null,
    issueId: issueId ?? null,
    source: (source ?? "unknown") as FileContextSource,
    preset: preset ?? null,
  };
}

/**
 * Small helper used by activity rows, comment attachments, and
 * assistant actions to construct a safe deep link even when some
 * identifiers are unavailable.
 */
export function filesLinkFor(
  input: Omit<FileContext, "source"> & { source?: FileContextSource },
): string {
  return buildFilesHref({ source: "unknown", ...input });
}

/** Pull ctx from an activity event's details payload when possible. */
export function fileContextFromActivity(ev: {
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown> | null;
}): FileContext | null {
  if (!ev.action.startsWith("file.")) return null;
  const details = (ev.details ?? {}) as Record<string, unknown>;
  const filePath = typeof details.filePath === "string" ? details.filePath : undefined;
  if (!filePath) return null;
  return {
    filePath,
    contentHash: typeof details.contentHash === "string" ? details.contentHash : null,
    snapshotId: typeof details.snapshotId === "string" ? details.snapshotId : null,
    runId: typeof details.runId === "string" ? details.runId : null,
    agentId: typeof details.agentId === "string" ? details.agentId : null,
    issueId: typeof details.issueId === "string" ? details.issueId : null,
    source: "activity",
  };
}
