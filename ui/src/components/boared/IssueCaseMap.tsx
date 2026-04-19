/**
 * IssueCaseMap — ambitious 2D “case intelligence” surface:
 *   lineage → anchor issue → breakdown pipeline → unified motion (comments + runs)
 *   with metrics, progress semantics, and explicit paths into the rest of the page.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ChevronRight,
  Clock,
  GitBranch,
  Layers,
  ListTree,
  MessageSquare,
  Orbit,
  Play,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import type { Issue, IssueComment, Agent } from "@paperclipai/shared";
import type { RunForIssue } from "../../api/activity";
import { cn, relativeTime } from "../../lib/utils";
import { statusColor } from "../issueScene/colors";
import { StatusIcon } from "../StatusIcon";
import { Identity } from "../Identity";
import { PriorityIcon } from "../PriorityIcon";
import { Button } from "@/components/ui/button";

const DONE_STATUSES = new Set(["done", "cancelled"]);

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function isDone(issue: Issue) {
  return DONE_STATUSES.has(issue.status);
}

function priorityRank(p: string | undefined) {
  if (!p) return 4;
  return PRIORITY_ORDER[p] ?? 4;
}

function sortChildIssues(children: Issue[]) {
  return [...children].sort((a, b) => {
    const ad = isDone(a);
    const bd = isDone(b);
    if (ad !== bd) return ad ? 1 : -1;
    const pr = priorityRank(a.priority) - priorityRank(b.priority);
    if (pr !== 0) return pr;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export interface IssueCaseMapProps {
  issue: Issue;
  childIssues: Issue[];
  comments?: IssueComment[];
  linkedRuns?: RunForIssue[];
  agentMap: Map<string, Agent>;
  /** Jump the issue detail tabs (Comments, Sub-issues, Activity). */
  onFocusTab?: (tab: "comments" | "subissues" | "activity") => void;
  className?: string;
}

type TimelineEntry =
  | {
      kind: "comment";
      id: string;
      at: number;
      body: string;
      authorLabel: string;
    }
  | {
      kind: "run";
      id: string;
      at: number;
      status: string;
      agentLabel: string;
      live: boolean;
    };

function isLiveRunStatus(s: string) {
  return s === "running" || s === "in_progress" || s === "queued";
}

export function IssueCaseMap({
  issue,
  childIssues,
  comments = [],
  linkedRuns = [],
  agentMap,
  onFocusTab,
  className,
}: IssueCaseMapProps) {
  const ancestors = issue.ancestors ?? [];
  const doneCount = childIssues.filter(isDone).length;
  const total = childIssues.length;
  const openCount = total - doneCount;
  const progressPct = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  const sortedChildren = useMemo(() => sortChildIssues(childIssues), [childIssues]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ch of childIssues) {
      const s = ch.status ?? "unknown";
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  }, [childIssues]);

  const mergedTimeline = useMemo((): TimelineEntry[] => {
    const items: TimelineEntry[] = [];
    for (const c of comments) {
      const at = new Date(c.createdAt).getTime();
      let authorLabel = "—";
      if (c.authorAgentId) {
        authorLabel = agentMap.get(c.authorAgentId)?.name ?? c.authorAgentId.slice(0, 8);
      } else if (c.authorUserId) {
        authorLabel = c.authorUserId === "local-board" ? "Board" : "Member";
      }
      items.push({
        kind: "comment",
        id: c.id,
        at,
        body: (c.body ?? "").replace(/\n+/g, " ").trim(),
        authorLabel,
      });
    }
    for (const r of linkedRuns) {
      const at = new Date(r.startedAt ?? r.createdAt ?? 0).getTime();
      items.push({
        kind: "run",
        id: r.runId,
        at,
        status: r.status ?? "",
        agentLabel: agentMap.get(r.agentId)?.name ?? r.agentId.slice(0, 8),
        live: isLiveRunStatus(r.status ?? ""),
      });
    }
    return items.sort((a, b) => b.at - a.at).slice(0, 10);
  }, [comments, linkedRuns, agentMap]);

  const liveRunCount = linkedRuns.filter((r) => isLiveRunStatus(r.status ?? "")).length;

  const resolutionHint =
    issue.status === "done"
      ? "This matter is closed."
      : total === 0
        ? "Add sub-issues to break the problem into checkable pieces."
        : doneCount === total
          ? "All sub-matters are cleared — good candidate to close the parent."
          : `${openCount} sub-matter${openCount === 1 ? "" : "s"} still open.`;

  const accent = statusColor(issue.status);

  const nextActions = useMemo(() => {
    const actions: { label: string; tab?: "comments" | "subissues" | "activity"; hint: string }[] = [];
    if (issue.status !== "done" && issue.status !== "cancelled") {
      if (total === 0) {
        actions.push({
          label: "Split into sub-issues",
          tab: "subissues",
          hint: "Decompose the problem so progress is visible here and in reports.",
        });
      } else if (openCount > 0) {
        actions.push({
          label: `Triage ${openCount} open sub-matter${openCount === 1 ? "" : "s"}`,
          tab: "subissues",
          hint: "Drive the breakdown to done or adjust scope.",
        });
      }
      if (comments.length === 0 && linkedRuns.length === 0) {
        actions.push({
          label: "Start the thread",
          tab: "comments",
          hint: "Notes and decisions show up in the motion stream below.",
        });
      }
      if (liveRunCount > 0) {
        actions.push({
          label: "Watch live runs",
          tab: "activity",
          hint: `${liveRunCount} run${liveRunCount === 1 ? "" : "s"} in flight.`,
        });
      }
    }
    return actions.slice(0, 3);
  }, [
    issue.status,
    total,
    openCount,
    comments.length,
    linkedRuns.length,
    liveRunCount,
  ]);

  const assigneeName = issue.assigneeAgentId
    ? agentMap.get(issue.assigneeAgentId)?.name
    : null;

  return (
    <section
      id="issue-case-map"
      aria-label="Issue structure and path to resolution"
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-sm",
        className,
      )}
    >
      {/* Header */}
      <div className="relative border-b border-border bg-gradient-to-br from-primary/[0.06] via-card to-card px-4 py-4 sm:px-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_100%_0%,hsl(var(--primary)/0.12),transparent_55%)]" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg border border-border bg-background/80 shadow-xs">
                <Sparkles className="size-4 text-primary" aria-hidden />
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Case intelligence
                </h2>
                <p className="text-sm font-medium text-foreground">How this issue fits the work graph</p>
              </div>
            </div>
            <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
              Lineage, breakdown, and recent motion — one place to see structure before you dive into description and
              tabs.
            </p>
          </div>
          <dl className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-2 text-right sm:text-left">
            <div>
              <dt className="text-[0.65rem] font-mono uppercase tracking-wider text-muted-foreground">Age</dt>
              <dd className="flex items-center justify-end gap-1 text-sm font-medium tabular-nums sm:justify-start">
                <Clock className="size-3.5 text-muted-foreground" aria-hidden />
                {relativeTime(issue.createdAt as unknown as string)}
              </dd>
            </div>
            <div>
              <dt className="text-[0.65rem] font-mono uppercase tracking-wider text-muted-foreground">Breakdown</dt>
              <dd className="text-sm font-medium tabular-nums">
                {total === 0 ? "—" : `${doneCount}/${total}`}
                {total > 0 && (
                  <span className="ml-1 text-muted-foreground">({progressPct}%)</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[0.65rem] font-mono uppercase tracking-wider text-muted-foreground">Thread</dt>
              <dd className="text-sm font-medium tabular-nums">{comments.length}</dd>
            </div>
            <div>
              <dt className="text-[0.65rem] font-mono uppercase tracking-wider text-muted-foreground">Runs</dt>
              <dd className="text-sm font-medium tabular-nums">
                {linkedRuns.length}
                {liveRunCount > 0 && (
                  <span className="ml-1 text-cyan-600 dark:text-cyan-400">· {liveRunCount} live</span>
                )}
              </dd>
            </div>
          </dl>
        </div>

        {/* Phase rail */}
        <div className="relative mt-4 flex flex-col gap-2 border-t border-border/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="absolute left-4 right-4 top-[2.15rem] hidden h-px bg-gradient-to-r from-transparent via-border to-transparent sm:block" />
          {[
            { label: "Upstream", icon: GitBranch, active: ancestors.length > 0, hint: "Parent chain" },
            { label: "Anchor", icon: Target, active: true, hint: "This issue" },
            { label: "Breakdown", icon: Layers, active: total > 0, hint: "Sub-matters" },
            { label: "Motion", icon: Zap, active: mergedTimeline.length > 0, hint: "Comments & runs" },
          ].map(({ label, icon: Icon, active, hint }) => (
            <div
              key={label}
              className="relative z-[1] flex items-center gap-2 rounded-md border border-transparent bg-background/60 px-2 py-1.5 sm:flex-1 sm:flex-col sm:items-center sm:text-center"
            >
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full border shadow-xs",
                  active ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted/40 text-muted-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 sm:px-1">
                <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground">{label}</div>
                <div className="text-[0.6rem] text-muted-foreground">{hint}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-6 p-4 sm:p-5">
        {/* Upstream timeline */}
        {ancestors.length > 0 && (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <GitBranch className="size-4 text-muted-foreground" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upstream</span>
            </div>
            <ol className="relative ms-2 border-s border-border ps-4 space-y-3">
              {[...ancestors].reverse().map((a) => (
                <li key={a.id} className="relative">
                  <span className="absolute -start-[calc(0.25rem+1px)] top-1.5 size-2 rounded-full bg-border ring-4 ring-card" />
                  <Link
                    to={`/issues/${a.identifier ?? a.id}`}
                    className="group block rounded-md border border-transparent py-0.5 transition-colors hover:border-border hover:bg-muted/30"
                  >
                    <div className="font-mono text-[0.65rem] text-muted-foreground">
                      {a.identifier ?? a.id.slice(0, 8)}
                    </div>
                    <div className="text-sm font-medium leading-snug text-foreground group-hover:underline decoration-dotted underline-offset-2">
                      {a.title}
                    </div>
                  </Link>
                </li>
              ))}
              <li className="relative text-xs font-mono uppercase tracking-wider text-primary">
                <span className="absolute -start-[calc(0.25rem+1px)] top-1 size-2 rounded-full bg-primary ring-4 ring-card" />
                You are here
              </li>
            </ol>
          </div>
        )}

        {/* Anchor issue */}
        <div
          className="rounded-xl border-2 p-4 sm:p-5"
          style={{ borderColor: `${accent}99` }}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Orbit className="size-4 text-muted-foreground" aria-hidden />
                <span className="font-mono text-sm text-foreground">{issue.identifier ?? issue.id.slice(0, 8)}</span>
                <span
                  className="rounded-md border px-2 py-0.5 text-[0.65rem] font-mono uppercase tracking-wider"
                  style={{
                    borderColor: accent,
                    color: accent,
                    background: `${accent}14`,
                  }}
                >
                  {(issue.status ?? "").replace(/_/g, " ")}
                </span>
                <PriorityIcon priority={issue.priority} className="shrink-0" />
              </div>
              <h3 className="text-lg font-semibold leading-snug tracking-tight sm:text-xl">{issue.title}</h3>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {assigneeName ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="font-mono uppercase tracking-wider">Owner</span>
                    <Identity name={assigneeName} size="sm" />
                  </span>
                ) : (
                  <span>Unassigned</span>
                )}
                <span className="hidden sm:inline text-border">|</span>
                <span>
                  Updated {relativeTime(issue.updatedAt as unknown as string)}
                </span>
              </div>
            </div>
            <div
              className="flex shrink-0 items-center gap-2 self-start rounded-lg border border-border/80 bg-muted/20 px-3 py-2"
              title="Status"
            >
              <span className="relative flex h-3 w-3">
                {issue.status !== "done" && issue.status !== "cancelled" && (
                  <span
                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40"
                    style={{ background: accent }}
                  />
                )}
                <span className="relative inline-flex h-3 w-3 rounded-full" style={{ background: accent }} />
              </span>
              <span className="text-xs font-medium text-foreground">
                {issue.status === "done" || issue.status === "cancelled" ? "Closed" : "In flight"}
              </span>
            </div>
          </div>
          <p className="mt-4 border-t border-dashed border-border pt-4 text-sm leading-relaxed text-muted-foreground">
            {resolutionHint}
          </p>

          {/* Pipeline bar */}
          {total > 0 && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-[0.65rem] font-mono uppercase tracking-wider text-muted-foreground">
                <span>Resolution pipeline</span>
                <span>
                  {doneCount} done · {openCount} open
                </span>
              </div>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                {Object.entries(statusCounts).map(([st, n]) => {
                  const w = (n / total) * 100;
                  if (w <= 0) return null;
                  const c = statusColor(st);
                  return (
                    <div
                      key={st}
                      className="h-full transition-all"
                      style={{ width: `${w}%`, background: c }}
                      title={`${st}: ${n}`}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.6rem] text-muted-foreground">
                {Object.entries(statusCounts).map(([st, n]) => (
                  <span key={st} className="inline-flex items-center gap-1">
                    <span className="size-1.5 rounded-full" style={{ background: statusColor(st) }} />
                    {(st ?? "").replace(/_/g, " ")} ({n})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sub-matters */}
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ListTree className="size-4 text-muted-foreground" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sub-matters</span>
              <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-[0.65rem] text-muted-foreground">
                {total} total
              </span>
            </div>
            {onFocusTab && (
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onFocusTab("subissues")}>
                Open tab
                <ArrowRight className="ms-1 size-3" />
              </Button>
            )}
          </div>
          {sortedChildren.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/10 px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                No sub-issues yet. Split this issue into concrete, checkable pieces — they roll up here and in reporting.
              </p>
              {onFocusTab && (
                <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => onFocusTab("subissues")}>
                  Go to Sub-issues tab
                </Button>
              )}
            </div>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {sortedChildren.map((ch) => {
                const agentName = ch.assigneeAgentId ? agentMap.get(ch.assigneeAgentId)?.name : null;
                const done = isDone(ch);
                return (
                  <li key={ch.id}>
                    <Link
                      to={`/issues/${ch.identifier ?? ch.id}`}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-all",
                        done
                          ? "border-border/60 bg-muted/15 opacity-90 hover:opacity-100"
                          : "border-border bg-background/60 hover:border-primary/25 hover:bg-accent/20",
                      )}
                    >
                      <div className="pt-0.5 shrink-0" aria-hidden>
                        <StatusIcon status={ch.status} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[0.65rem] text-muted-foreground">
                            {ch.identifier ?? ch.id.slice(0, 8)}
                          </span>
                          <PriorityIcon priority={ch.priority} className="scale-90" />
                        </div>
                        <div className="text-sm font-medium leading-snug">{ch.title}</div>
                        {agentName && (
                          <div className="mt-1.5">
                            <Identity name={agentName} size="sm" />
                          </div>
                        )}
                      </div>
                      <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground/50" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Unified motion */}
        <div className="rounded-lg border border-border bg-muted/5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Zap className="size-4 text-amber-500 dark:text-amber-400" aria-hidden />
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-foreground">Motion</div>
                <div className="text-[0.65rem] text-muted-foreground">Comments and runs, newest first</div>
              </div>
            </div>
            {onFocusTab && (
              <div className="flex flex-wrap gap-1">
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onFocusTab("comments")}>
                  Comments
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onFocusTab("activity")}>
                  Activity
                </Button>
              </div>
            )}
          </div>
          {mergedTimeline.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No comments or runs yet — when they land, they interleave here so you see how the case evolved.
            </p>
          ) : (
            <ol className="divide-y divide-border">
              {mergedTimeline.map((item) => (
                <li key={`${item.kind}-${item.id}`} className="flex gap-3 px-4 py-3">
                  <div
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border",
                      item.kind === "comment"
                        ? "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        : item.kind === "run" && item.live
                          ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
                          : "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
                    )}
                  >
                    {item.kind === "comment" ? (
                      <MessageSquare className="size-4" aria-hidden />
                    ) : (
                      <Play className="size-4" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[0.7rem] font-medium text-foreground">
                        {item.kind === "comment" ? (
                          <>
                            <span className="text-muted-foreground">Note · </span>
                            {item.authorLabel}
                          </>
                        ) : (
                          <>
                            <span className="text-muted-foreground">Run · </span>
                            {item.agentLabel}
                            {item.live && (
                              <span className="ms-1.5 inline-flex items-center gap-1 text-cyan-600 dark:text-cyan-400">
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
                                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400" />
                                </span>
                                live
                              </span>
                            )}
                          </>
                        )}
                      </span>
                      <time
                        className="shrink-0 font-mono text-[0.65rem] text-muted-foreground tabular-nums"
                        dateTime={new Date(item.at).toISOString()}
                      >
                        {relativeTime(new Date(item.at).toISOString())}
                      </time>
                    </div>
                    {item.kind === "comment" ? (
                      <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-foreground/90">{item.body || "—"}</p>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Status <span className="font-mono text-foreground/90">{(item.status ?? "").replace(/_/g, " ")}</span>
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Next actions */}
        {nextActions.length > 0 && onFocusTab && (
          <div className="rounded-lg border border-dashed border-primary/25 bg-primary/[0.04] px-4 py-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground">
              <Target className="size-3.5 text-primary" aria-hidden />
              Suggested next steps
            </div>
            <ul className="space-y-2">
              {nextActions.map((a) => (
                <li key={a.label} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-medium text-foreground">{a.label}</div>
                    <div className="text-xs text-muted-foreground">{a.hint}</div>
                  </div>
                  {a.tab && (
                    <Button type="button" size="sm" variant="secondary" className="shrink-0" onClick={() => onFocusTab(a.tab!)}>
                      Go
                      <ArrowRight className="ms-1 size-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
