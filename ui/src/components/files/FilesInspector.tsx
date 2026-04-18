/**
 * FilesInspector — the right-hand column of the Files shell.
 *
 * Merges what used to be three stacked panels on the page (provenance
 * rail, locks panel, evidence / summary files) into one narrow
 * context column, with each section collapsed to an entity-row
 * density. Sections auto-hide when they have no content so the column
 * never feels busy.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  GitCommitHorizontal,
  Lock,
  AlertTriangle,
  TrendingUp,
  Users,
  Info,
  Radio,
} from "lucide-react";
import { filesApi } from "@/api/files";
import { queryKeys } from "@/lib/queryKeys";
import { timeAgo } from "@/lib/timeAgo";
import { ChurnSparkline } from "./ChurnSparkline";
import { cn } from "@/lib/utils";

interface SectionProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: React.ReactNode;
  count?: number;
}

function Section({ title, icon: Icon, children, count }: SectionProps) {
  return (
    <section className="border-b border-[var(--boared-rule)] px-3 py-2">
      <header className="flex items-center gap-2 mb-1.5">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="font-mono uppercase tracking-[0.08em] text-[0.55rem] text-muted-foreground">
          {title}
        </span>
        {count != null && (
          <span className="font-mono text-[0.55rem] text-muted-foreground">
            {count}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}

export interface FilesInspectorProps {
  companyId: string;
  filePath: string | null;
  activeHash?: string | null;
  onPickHash?: (hash: string) => void;
  className?: string;
}

export function FilesInspector({
  companyId,
  filePath,
  activeHash,
  onPickHash,
  className,
}: FilesInspectorProps) {
  const enabled = !!filePath && !!companyId;

  const { data: history = [] } = useQuery({
    queryKey: queryKeys.files.history(companyId, filePath ?? ""),
    queryFn: () => filesApi.history(companyId, filePath!),
    enabled,
    staleTime: 30_000,
  });

  const { data: churn } = useQuery({
    queryKey: queryKeys.files.churn(companyId, filePath ?? "", 30),
    queryFn: () => filesApi.churn(companyId, filePath!, 30),
    enabled,
    staleTime: 60_000,
  });

  const { data: locks = [] } = useQuery({
    queryKey: queryKeys.files.locks(companyId),
    queryFn: () => filesApi.listLocks(companyId),
    enabled: !!companyId,
    refetchInterval: 30_000,
  });

  const { data: conflicts = [] } = useQuery({
    queryKey: queryKeys.files.conflicts(companyId),
    queryFn: () => filesApi.listConflicts(companyId),
    enabled: !!companyId,
    refetchInterval: 60_000,
  });

  const { data: presence = [] } = useQuery({
    queryKey: queryKeys.files.presence(companyId),
    queryFn: () => filesApi.presence(companyId),
    enabled: !!companyId,
    refetchInterval: 30_000,
  });

  const touchedBy = useMemo(() => {
    const map = new Map<string, { name: string; last: string }>();
    for (const s of history) {
      const key = s.agentName ?? s.agentId;
      const prev = map.get(key);
      if (!prev || prev.last < s.capturedAt) {
        map.set(key, { name: key, last: s.capturedAt });
      }
    }
    return [...map.values()].sort((a, b) => b.last.localeCompare(a.last));
  }, [history]);

  const fileLocks = useMemo(() => (filePath ? locks.filter((l) => l.filePath === filePath) : []), [locks, filePath]);
  const fileConflicts = useMemo(() => (filePath ? conflicts.filter((c) => c.filePath === filePath) : []), [conflicts, filePath]);
  const filePresence = useMemo(
    () => (filePath ? presence.find((p) => p.filePath === filePath) ?? null : null),
    [presence, filePath],
  );

  if (!filePath) {
    return (
      <aside className={cn("flex flex-col items-center justify-center gap-3 px-6 py-10 text-center text-sm text-muted-foreground", className)}>
        <div className="h-10 w-10 rounded-md border border-[var(--boared-rule)] bg-[var(--boared-paper)] inline-flex items-center justify-center">
          <Info className="h-4 w-4" />
        </div>
        <p className="max-w-[200px] text-xs leading-relaxed">
          Select a file to see provenance, touched-by agents, and active locks.
        </p>
      </aside>
    );
  }

  const churnValues = churn?.map((p) => p.count) ?? [];
  const totalChurn = churnValues.reduce((a, b) => a + b, 0);
  const isLive = !!filePresence;
  const isConflict = fileConflicts.length > 0;
  const isLocked = fileLocks.length > 0;

  return (
    <aside className={cn("flex flex-col min-h-0", className)} aria-label="File inspector">
      <div className="border-b border-[var(--boared-rule)] px-3 py-2.5 space-y-1.5">
        <div className="font-mono text-[0.55rem] uppercase tracking-[0.08em] text-muted-foreground">
          Inspector
        </div>
        <div className="truncate text-sm font-semibold text-foreground leading-tight" title={filePath}>
          {filePath.split(/[\\/]/).pop()}
        </div>
        <div className="truncate font-mono text-[0.58rem] text-muted-foreground" title={filePath}>
          {filePath}
        </div>
        {(isLive || isLocked || isConflict) && (
          <div className="flex flex-wrap items-center gap-1 pt-1">
            {isLive && (
              <StatusChip
                tone="live"
                icon={Radio}
                label={`${filePresence!.agents.length} live`}
              />
            )}
            {isLocked && (
              <StatusChip
                tone="warn"
                icon={Lock}
                label={`Locked by ${fileLocks[0].agentId.slice(0, 6)}`}
              />
            )}
            {isConflict && (
              <StatusChip
                tone="danger"
                icon={AlertTriangle}
                label="Conflict"
              />
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <Section title="Activity (30d)" icon={TrendingUp} count={totalChurn || undefined}>
          {churnValues.length > 0 ? (
            <div className="flex items-center gap-2">
              <ChurnSparkline values={churnValues} width={180} height={28} />
              <span className="font-mono text-[0.6rem] text-muted-foreground">
                {totalChurn} changes
              </span>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic">No recent activity.</div>
          )}
        </Section>

        {history.length > 0 && (
          <Section title="Versions" icon={GitCommitHorizontal} count={history.length}>
            <ul className="space-y-0.5 max-h-56 overflow-auto">
              {history.slice(0, 20).map((s) => {
                const active = s.contentHash === activeHash;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => s.contentHash && onPickHash?.(s.contentHash)}
                      disabled={!s.contentHash}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1 text-left text-[0.7rem] font-mono rounded-sm border",
                        active
                          ? "border-foreground bg-foreground text-background"
                          : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                      )}
                    >
                      <GitCommitHorizontal className="h-3 w-3 shrink-0" />
                      <span className="truncate flex-1">{s.agentName ?? s.agentId.slice(0, 6)}</span>
                      <span className="shrink-0">{s.operation}</span>
                      <span className="shrink-0 opacity-80">{timeAgo(s.capturedAt)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {touchedBy.length > 0 && (
          <Section title="Touched by" icon={Users} count={touchedBy.length}>
            <ul className="space-y-1">
              {touchedBy.slice(0, 8).map((t) => (
                <li
                  key={t.name}
                  className="flex items-center gap-2 text-xs"
                >
                  <span
                    className="h-4 w-4 rounded-full inline-flex items-center justify-center font-mono text-[0.5rem] border border-[var(--boared-rule)] bg-[var(--boared-paper)]"
                    aria-hidden
                  >
                    {t.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="truncate flex-1">{t.name}</span>
                  <span className="font-mono text-[0.55rem] text-muted-foreground">{timeAgo(t.last)}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {(fileLocks.length > 0 || fileConflicts.length > 0) && (
          <Section
            title={fileConflicts.length > 0 ? "Conflict" : "Lock"}
            icon={fileConflicts.length > 0 ? AlertTriangle : Lock}
          >
            <ul className="space-y-1">
              {fileLocks.map((l) => (
                <li key={l.id} className="flex items-center gap-2 text-xs">
                  <Lock className="h-3 w-3 text-amber-400" />
                  <span className="truncate">Held by {l.agentId.slice(0, 6)}</span>
                  <span className="ml-auto font-mono text-[0.55rem] text-muted-foreground">
                    {timeAgo(l.acquiredAt)}
                  </span>
                </li>
              ))}
              {fileConflicts.map((c) => (
                <li key={c.filePath} className="flex items-center gap-2 text-xs text-[var(--boared-acid)]">
                  <AlertTriangle className="h-3 w-3" />
                  <span className="truncate">{c.recentEditors.length} overlapping editors</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

      </div>
    </aside>
  );
}

function StatusChip({
  tone,
  icon: Icon,
  label,
}: {
  tone: "live" | "warn" | "danger";
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  const toneClass = {
    live: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
    warn: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    danger: "border-red-400/30 bg-red-400/10 text-red-300",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-[1px] rounded-full border text-[0.58rem] font-mono",
        toneClass,
      )}
    >
      <Icon className={cn("h-2.5 w-2.5", tone === "live" && "animate-pulse")} />
      {label}
    </span>
  );
}
