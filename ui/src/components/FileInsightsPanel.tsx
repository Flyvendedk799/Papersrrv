/**
 * File insights / workspace analytics (backlog 1.md 3.1).
 *
 * Compact summary strip showing total files, snapshots, agents,
 * latest activity, workspace size, and top file extensions.
 */

import { useQuery } from "@tanstack/react-query";
import { Gauge, File, Database, Clock, Bot, Activity, CheckCircle2, AlertCircle } from "lucide-react";
import { filesApi } from "../api/files";
import { queryKeys } from "../lib/queryKeys";
import { useFeatureFlag } from "../lib/featureFlags";
import { timeAgo } from "../lib/timeAgo";

function fmtBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let idx = 0;
  let val = n;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(val >= 10 ? 0 : 1)} ${units[idx]}`;
}

interface Props {
  companyId: string;
}

export function FileInsightsPanel({ companyId }: Props) {
  const enabled = useFeatureFlag("files_insights_panel");
  const { data } = useQuery({
    queryKey: queryKeys.files.analytics(companyId),
    queryFn: () => filesApi.analytics(companyId),
    enabled: enabled && !!companyId,
    staleTime: 60_000,
  });

  /**
   * Indexing health — replaces the old manual "Reindex" button. The
   * server runs an auto-backfill job every 30 min, so the UI only
   * needs to surface "are we caught up, and when was the last sweep?"
   */
  const { data: indexing } = useQuery({
    queryKey: queryKeys.files.indexingStatus(companyId),
    queryFn: () => filesApi.indexingStatus(companyId),
    enabled: enabled && !!companyId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (!enabled) return null;
  if (!data) return null;

  return (
    <aside
      aria-labelledby="insights-heading"
      className="mb-3 border border-[var(--boared-rule)] bg-[var(--boared-paper-2)] px-3 py-2"
    >
      <header className="flex items-center gap-2 mb-2">
        <Gauge className="h-3 w-3 text-muted-foreground" />
        <span id="insights-heading" className="font-mono uppercase tracking-[0.08em] text-[0.62rem] text-muted-foreground">
          Workspace insights
        </span>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
        <Stat icon={File} label="Files" value={data.totalFiles.toLocaleString()} />
        <Stat icon={Database} label="Snapshots" value={data.totalSnapshots.toLocaleString()} />
        <Stat icon={Bot} label="Agents" value={data.totalAgents.toLocaleString()} />
        <Stat
          icon={Clock}
          label="Latest"
          value={data.latestActivity ? timeAgo(data.latestActivity) : "—"}
        />
        <Stat
          icon={Database}
          label="Size"
          value={fmtBytes(data.content?.totalSizeBytes ?? 0)}
        />
      </div>

      {indexing && (
        <div className="mt-2 pt-2 border-t border-[var(--boared-rule)] flex items-center gap-3 flex-wrap font-mono text-[0.62rem] text-muted-foreground">
          {indexing.pendingRuns === 0 ? (
            <span className="flex items-center gap-1 text-foreground">
              <CheckCircle2 className="h-3 w-3" />
              Index current
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[var(--boared-acid)]">
              <AlertCircle className="h-3 w-3" />
              {indexing.pendingRuns} run{indexing.pendingRuns === 1 ? "" : "s"} pending
            </span>
          )}
          <span className="flex items-center gap-1">
            <Activity className="h-3 w-3" />
            {indexing.indexedRuns} of {indexing.totalCompletedRuns} runs indexed
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {indexing.lastBackfillAt
              ? `Last catch-up ${timeAgo(indexing.lastBackfillAt)}`
              : "Catch-up sweep scheduled"}
          </span>
          {indexing.autoBackfillEnabled && (
            <span className="ml-auto text-[0.55rem] uppercase tracking-[0.08em]">Auto-backfill · 30m</span>
          )}
        </div>
      )}

      {data.topExtensions?.length > 0 && (
        <div className="mt-2 pt-2 border-t border-[var(--boared-rule)]">
          <div className="font-mono uppercase tracking-[0.08em] text-[0.55rem] text-muted-foreground mb-1">
            Top extensions
          </div>
          <div className="flex flex-wrap gap-1">
            {data.topExtensions.slice(0, 10).map((ex) => (
              <span
                key={ex.extension}
                className="border border-[var(--boared-rule)] px-1.5 py-0.5 font-mono text-[0.6rem] text-muted-foreground"
              >
                .{ex.extension}
                <span className="ml-1 text-foreground">{ex.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

function Stat({
  icon: Icon, label, value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <div className="font-mono text-[0.55rem] uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </div>
        <div className="font-mono text-foreground truncate">{value}</div>
      </div>
    </div>
  );
}
