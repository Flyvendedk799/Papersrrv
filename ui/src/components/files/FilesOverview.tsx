/**
 * FilesOverview — landing surface for the Files tab.
 *
 * Replaces the "wall of filters then a flat list" UX with lanes that
 * tell a story:
 *
 *   - HOT          what's moving fast right now
 *   - LIVE         what agents are actively writing to
 *   - REVIEW       what is waiting on a human
 *   - RECENT       what *I* looked at recently
 *   - BY PROJECT   jumping-off points per project
 *
 * Each lane links straight into the Reader so Overview stays a
 * dashboard, never a detail view. Keeping lanes independent means a
 * slow endpoint never gates the rest of the page.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Flame, Radio, FileQuestion, History, Folder, ArrowRight, Database } from "lucide-react";
import { filesApi } from "@/api/files";
import { queryKeys } from "@/lib/queryKeys";
import { getRecentFiles } from "@/lib/recentFiles";
import { timeAgo } from "@/lib/timeAgo";
import { HotFileCard } from "./HotFileCard";
import { ReviewQueueList } from "./ReviewQueueList";
import { FileRow } from "./FileRow";
import { AgentPresenceChip } from "./AgentPresenceChip";
import { cn } from "@/lib/utils";

function filenameOf(p: string): string {
  return p.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? p;
}

function LaneHeader({
  icon: Icon,
  title,
  count,
  hint,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count?: number | string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="h-4 w-4 text-foreground/80 shrink-0" />
        <h2 className="text-[0.95rem] font-semibold text-foreground leading-none">
          {title}
        </h2>
        {count != null && (
          <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-[var(--boared-paper-2)] border border-[var(--boared-rule)] font-mono text-[0.6rem] text-muted-foreground tabular-nums">
            {count}
          </span>
        )}
        {hint && (
          <span className="font-mono text-[0.6rem] text-muted-foreground/70 truncate">{hint}</span>
        )}
      </div>
      {action}
    </div>
  );
}

function HeroStat({
  icon: Icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone?: "neutral" | "live" | "warn" | "ok";
  hint?: string;
}) {
  const toneClass = {
    neutral: "text-muted-foreground",
    live: "text-cyan-400",
    warn: "text-[var(--boared-acid)]",
    ok: "text-emerald-400",
  }[tone ?? "neutral"];
  return (
    <div className="flex items-center gap-3 border border-[var(--boared-rule)] rounded-md bg-[var(--boared-paper)] px-3 py-2.5 min-w-0">
      <div className={cn("h-8 w-8 rounded-md border border-[var(--boared-rule)] bg-[var(--boared-paper-2)] inline-flex items-center justify-center shrink-0", toneClass)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="font-mono text-[0.55rem] uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-base font-semibold tabular-nums leading-tight">{value}</span>
          {hint && <span className="font-mono text-[0.6rem] text-muted-foreground truncate">{hint}</span>}
        </div>
      </div>
    </div>
  );
}

export interface FilesOverviewProps {
  companyId: string;
  onOpenFile: (filePath: string) => void;
  onOpenProject?: (projectId: string) => void;
  onSwitchToReader?: () => void;
  className?: string;
}

export function FilesOverview({
  companyId,
  onOpenFile,
  onOpenProject,
  onSwitchToReader,
  className,
}: FilesOverviewProps) {
  const { data: hot = [] } = useQuery({
    queryKey: queryKeys.files.hot(companyId, { windowDays: 7, limit: 12 }),
    queryFn: () => filesApi.hot(companyId, { windowDays: 7, limit: 12 }),
    enabled: !!companyId,
    staleTime: 60_000,
  });

  const { data: presence = [] } = useQuery({
    queryKey: queryKeys.files.presence(companyId),
    queryFn: () => filesApi.presence(companyId),
    enabled: !!companyId,
    refetchInterval: 15_000,
  });

  const { data: reviewQueue = [] } = useQuery({
    queryKey: queryKeys.files.reviewQueue(companyId),
    queryFn: () => filesApi.reviewQueue(companyId),
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const { data: projectSummaries = [] } = useQuery({
    queryKey: queryKeys.files.projectSummaries(companyId),
    queryFn: () => filesApi.projectFileSummaries(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
  });

  const { data: indexing } = useQuery({
    queryKey: queryKeys.files.indexingStatus(companyId),
    queryFn: () => filesApi.indexingStatus(companyId),
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const recents = useMemo(() => getRecentFiles().slice(0, 8), []);

  const totalHotChurn = useMemo(
    () => hot.reduce((sum, h) => sum + (h.churn ?? 0), 0),
    [hot],
  );
  const indexHealthTone = indexing
    ? indexing.pendingRuns === 0
      ? "ok"
      : indexing.pendingRuns > 5
        ? "warn"
        : "neutral"
    : "neutral";

  return (
    <div className={cn("space-y-6 pb-8", className)}>
      <section aria-label="Workspace pulse" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HeroStat
          icon={Radio}
          label="Live now"
          value={presence.length}
          tone={presence.length > 0 ? "live" : "neutral"}
          hint={presence.length > 0 ? "agents writing" : "quiet"}
        />
        <HeroStat
          icon={FileQuestion}
          label="Awaiting review"
          value={reviewQueue.length}
          tone={reviewQueue.length > 0 ? "warn" : "neutral"}
          hint={reviewQueue.length > 0 ? "files" : "clear"}
        />
        <HeroStat
          icon={Flame}
          label="Hot files · 7d"
          value={hot.length}
          hint={totalHotChurn > 0 ? `${totalHotChurn} changes` : undefined}
        />
        <HeroStat
          icon={Database}
          label="Indexed"
          value={indexing ? `${indexing.indexedRuns}/${indexing.totalCompletedRuns}` : "—"}
          tone={indexHealthTone}
          hint={indexing?.lastBackfillAt ? `last ${timeAgo(indexing.lastBackfillAt)}` : undefined}
        />
      </section>

      <section aria-labelledby="lane-hot">
        <LaneHeader
          icon={Flame}
          title="Hot files"
          count={hot.length || undefined}
          hint="highest churn, last 7 days"
          action={
            onSwitchToReader ? (
              <button
                type="button"
                onClick={onSwitchToReader}
                className="text-[0.6rem] font-mono uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                Open reader <ArrowRight className="h-3 w-3" />
              </button>
            ) : undefined
          }
        />
        <div id="lane-hot">
          {hot.length === 0 ? (
            <div className="text-sm text-muted-foreground border border-dashed border-[var(--boared-rule)] rounded-md px-3 py-6 text-center">
              No high-churn files in the last 7 days — quiet workspace.
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory">
              {hot.map((f) => (
                <div key={f.filePath} className="snap-start">
                  <HotFileCard file={f} onOpen={onOpenFile} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="lane-live" className="grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <LaneHeader
            icon={Radio}
            title="Live now"
            count={presence.length || undefined}
            hint="last 5 min · active locks"
          />
          <div id="lane-live">
            {presence.length === 0 ? (
              <div className="text-sm text-muted-foreground border border-dashed border-[var(--boared-rule)] rounded-md px-3 py-6 text-center">
                No agents writing right now.
              </div>
            ) : (
              <ul className="border border-[var(--boared-rule)] rounded-md divide-y divide-[var(--boared-rule)] overflow-hidden">
                {presence.slice(0, 8).map((p) => (
                  <li
                    key={p.filePath}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50 cursor-pointer"
                    onClick={() => onOpenFile(p.filePath)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") onOpenFile(p.filePath);
                    }}
                  >
                    <AgentPresenceChip
                      agents={p.agents}
                      reason={p.reason}
                      lockedBy={p.lockedBy ?? undefined}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{filenameOf(p.filePath)}</div>
                      <div className="truncate font-mono text-[0.58rem] text-muted-foreground">{p.filePath}</div>
                    </div>
                    <span className="font-mono text-[0.58rem] text-muted-foreground shrink-0">
                      {timeAgo(p.lastCapturedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="lg:col-span-3">
          <LaneHeader
            icon={FileQuestion}
            title="Review queue"
            count={reviewQueue.length || undefined}
            hint="pinned to issues, awaiting sign-off"
          />
          <ReviewQueueList items={reviewQueue} onOpen={(it) => onOpenFile(it.filePath)} />
        </div>
      </section>

      {recents.length > 0 && (
        <section aria-labelledby="lane-recent">
          <LaneHeader icon={History} title="Recently viewed" count={recents.length} />
          <ul id="lane-recent" className="border border-[var(--boared-rule)] rounded-md overflow-hidden">
            {recents.map((r) => (
              <FileRow
                key={r.filePath}
                filePath={r.filePath}
                lastAt={new Date(r.lastViewedAt).toISOString()}
                onClick={() => onOpenFile(r.filePath)}
              />
            ))}
          </ul>
        </section>
      )}

      {projectSummaries.length > 0 && (
        <section aria-labelledby="lane-projects">
          <LaneHeader icon={Folder} title="By project" count={projectSummaries.length} />
          <div id="lane-projects" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {projectSummaries.slice(0, 9).map((p) => (
              <button
                key={p.projectId}
                type="button"
                onClick={() => onOpenProject?.(p.projectId)}
                className="group text-left border border-[var(--boared-rule)] bg-[var(--boared-paper)] rounded-md px-3 py-2.5 hover:border-foreground/40 hover:bg-[var(--boared-paper-2)] transition-colors"
              >
                <div className="flex items-center gap-2">
                  {p.color ? (
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  ) : (
                    <span className="h-2 w-2 rounded-full shrink-0 bg-muted-foreground/30" />
                  )}
                  <span className="truncate text-sm font-medium">{p.name}</span>
                  <span className="ml-auto font-mono text-[0.6rem] text-muted-foreground tabular-nums">
                    {p.fileCount}
                  </span>
                </div>
                {p.lastCapturedAt && (
                  <div className="mt-1 font-mono text-[0.58rem] text-muted-foreground">
                    last {timeAgo(p.lastCapturedAt)}
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
