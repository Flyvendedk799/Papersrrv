/**
 * File locks & conflicts panel (backlog 1.md 2.1).
 *
 * Lists active file locks and detected conflicts. Shows lock holders
 * with a quick "unlock" affordance for admins. Rendered on the Files
 * page (when feature flag `file_lock_awareness` is on).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, Unlock, AlertTriangle } from "lucide-react";
import { filesApi } from "../api/files";
import { queryKeys } from "../lib/queryKeys";
import { useToast } from "../context/ToastContext";
import { useFeatureFlag } from "../lib/featureFlags";
import { timeAgo } from "../lib/timeAgo";

interface Props {
  companyId: string;
  onFocusFile?: (filePath: string) => void;
}

export function FileLocksPanel({ companyId, onFocusFile }: Props) {
  const enabled = useFeatureFlag("file_lock_awareness");
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const { data: locks } = useQuery({
    queryKey: queryKeys.files.locks(companyId),
    queryFn: () => filesApi.listLocks(companyId),
    enabled: enabled && !!companyId,
    refetchInterval: 15_000,
  });

  const { data: conflicts } = useQuery({
    queryKey: queryKeys.files.conflicts(companyId),
    queryFn: () => filesApi.listConflicts(companyId),
    enabled: enabled && !!companyId,
    refetchInterval: 30_000,
  });

  const releaseMutation = useMutation({
    mutationFn: (lock: { agentId: string; filePath: string }) =>
      filesApi.releaseLock(companyId, lock.agentId, lock.filePath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.files.locks(companyId) });
      pushToast({ title: "Lock released", tone: "info" });
    },
    onError: (err) => pushToast({ title: "Could not release lock", body: (err as Error).message, tone: "error" }),
  });

  if (!enabled) return null;
  if (!(locks?.length || conflicts?.length)) return null;

  return (
    <aside
      className="mb-3 border border-[var(--boared-rule)] bg-[var(--boared-paper-2)]"
      aria-labelledby="locks-heading"
    >
      <header className="px-3 py-1.5 border-b border-[var(--boared-rule)] flex items-center gap-2">
        <Lock className="h-3 w-3 text-muted-foreground" />
        <span id="locks-heading" className="font-mono uppercase tracking-[0.08em] text-[0.62rem] text-muted-foreground">
          File coordination
        </span>
        {locks && locks.length > 0 && (
          <span className="font-mono text-[0.6rem] text-muted-foreground">{locks.length} locked</span>
        )}
        {conflicts && conflicts.length > 0 && (
          <span className="font-mono text-[0.6rem] text-[var(--boared-acid)]">{conflicts.length} conflict{conflicts.length !== 1 ? "s" : ""}</span>
        )}
      </header>

      {locks && locks.length > 0 && (
        <ul className="divide-y divide-[var(--boared-rule)]">
          {locks.map((l) => (
            <li key={l.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
              <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
              <button
                onClick={() => onFocusFile?.(l.filePath)}
                className="truncate text-left hover:text-[var(--boared-acid)]"
              >
                {l.filePath}
              </button>
              <span className="ml-auto font-mono text-[0.6rem] text-muted-foreground shrink-0">
                by {l.agentId.slice(0, 6)} · {timeAgo(l.acquiredAt)}
              </span>
              <button
                type="button"
                onClick={() => releaseMutation.mutate({ agentId: l.agentId, filePath: l.filePath })}
                aria-label={`Release lock on ${l.filePath}`}
                className="p-1 text-muted-foreground hover:text-foreground"
                title="Release lock"
              >
                <Unlock className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {conflicts && conflicts.length > 0 && (
        <ul className="border-t border-[var(--boared-rule)] divide-y divide-[var(--boared-rule)]">
          {conflicts.map((c) => (
            <li key={c.filePath} className="flex items-center gap-2 px-3 py-1.5 text-xs">
              <AlertTriangle className="h-3 w-3 text-[var(--boared-acid)] shrink-0" />
              <button
                onClick={() => onFocusFile?.(c.filePath)}
                className="truncate text-left hover:text-[var(--boared-acid)]"
              >
                {c.filePath}
              </button>
              <span className="ml-auto font-mono text-[0.6rem] text-muted-foreground shrink-0">
                {c.recentEditors.length} recent editor{c.recentEditors.length !== 1 ? "s" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
