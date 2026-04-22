/**
 * DashboardRunningNow — the live-runs operational strip.
 *
 * Sits near the top of the dashboard so the operator can always see
 * what the bureau is doing right now AND kill anything that needs to
 * stop. Each row links to the issue or agent and exposes a one-click
 * cancel.
 *
 * Empty state: don't render at all (the queue is meant to feel calm
 * by default — runs only appear when there's work in flight).
 */

import { Link } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Square } from "lucide-react";
import { heartbeatsApi, type LiveRunForIssue } from "../../../api/heartbeats";
import { queryKeys } from "../../../lib/queryKeys";
import { cn, relativeTime } from "../../../lib/utils";

interface Props {
  companyId: string;
  className?: string;
}

export function DashboardRunningNow({ companyId, className }: Props) {
  const queryClient = useQueryClient();

  const { data: liveRuns = [] } = useQuery<LiveRunForIssue[]>({
    queryKey: queryKeys.liveRuns(companyId),
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId),
    enabled: !!companyId,
    refetchInterval: 5_000,
  });

  const cancel = useMutation({
    mutationFn: (runId: string) => heartbeatsApi.cancel(runId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.liveRuns(companyId) }),
  });

  if (liveRuns.length === 0) return null;

  return (
    <section
      className={cn(
        "border border-foreground bg-foreground/[0.02]",
        className,
      )}
      aria-label={`${liveRuns.length} live runs`}
    >
      <header className="flex items-baseline justify-between gap-3 px-4 py-2 border-b border-foreground/30">
        <span className="flex items-center gap-2 font-mono text-[0.66rem] uppercase tracking-[0.22em] text-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--boared-acid)] opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--boared-acid)]" />
          </span>
          Running now · {liveRuns.length}
        </span>
        <span className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-muted-foreground">
          Live · refreshing every 5s
        </span>
      </header>
      <ul className="divide-y divide-[var(--boared-rule)]">
        {liveRuns.map((run) => {
          const target = run.issueId
            ? `/issues/${run.issueId}`
            : `/agents/${run.agentId}/runs/${run.id}`;
          return (
            <li
              key={run.id}
              className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5"
            >
              <Link
                to={target}
                className="min-w-0 no-underline text-foreground hover:underline decoration-dotted underline-offset-2"
              >
                <span className="block truncate text-[0.92rem]">
                  <span className="font-medium">{run.agentName}</span>
                  <span className="text-muted-foreground">
                    {run.issueId ? " is working on this case" : " is running a task"}
                    {run.triggerDetail ? ` · ${run.triggerDetail}` : ""}
                  </span>
                </span>
                <span className="block font-mono text-[0.58rem] uppercase tracking-[0.12em] text-muted-foreground">
                  {run.startedAt
                    ? `started ${relativeTime(new Date(run.startedAt))}`
                    : `queued ${relativeTime(new Date(run.createdAt))}`}
                  {" · "}
                  {run.adapterType}
                </span>
              </Link>
              <div className="flex items-center gap-1.5 shrink-0">
                <Link
                  to={target}
                  className="inline-flex items-center gap-1 px-2 h-7 font-mono text-[0.58rem] uppercase tracking-[0.14em] border border-[var(--boared-rule)] text-muted-foreground hover:text-foreground hover:border-foreground transition-colors no-underline"
                  title="Open"
                >
                  Watch <ArrowRight className="h-3 w-3" />
                </Link>
                <button
                  type="button"
                  onClick={() => cancel.mutate(run.id)}
                  disabled={cancel.isPending}
                  className="inline-flex items-center gap-1 px-2 h-7 font-mono text-[0.58rem] uppercase tracking-[0.14em] border border-destructive text-destructive hover:bg-destructive hover:text-background transition-colors disabled:opacity-50"
                  title="Cancel this run"
                >
                  <Square className="h-3 w-3" />
                  Stop
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
