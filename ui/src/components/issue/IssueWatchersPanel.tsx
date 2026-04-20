/**
 * IssueWatchersPanel (F7) — shows who's watching the issue +
 * Watch/Unwatch toggle for the current user.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, User as UserIcon, Bot } from "lucide-react";
import { issuesApi } from "../../api/issues";
import { authApi } from "../../api/auth";
import { queryKeys } from "../../lib/queryKeys";
import { useToast } from "../../context/ToastContext";
import { cn } from "../../lib/utils";

export function IssueWatchersPanel({ issueId }: { issueId: string }) {
  const qc = useQueryClient();
  const { pushToast } = useToast();

  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });
  const userId = session?.user?.id ?? session?.session?.userId ?? null;

  const { data: watchers } = useQuery({
    queryKey: ["issue", issueId, "watchers"],
    queryFn: () => issuesApi.listWatchers(issueId),
  });

  const isWatching = (watchers ?? []).some((w) => w.userId && w.userId === userId);

  const watch = useMutation({
    mutationFn: () => issuesApi.addWatcher(issueId, { userId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issue", issueId, "watchers"] });
      pushToast({ tone: "info", title: "Watching this issue" });
    },
    onError: (err) =>
      pushToast({
        tone: "error",
        title: err instanceof Error ? err.message : "Watch failed",
      }),
  });

  const unwatch = useMutation({
    mutationFn: () => issuesApi.removeWatcher(issueId, { userId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issue", issueId, "watchers"] });
      pushToast({ tone: "info", title: "Stopped watching" });
    },
    onError: (err) =>
      pushToast({
        tone: "error",
        title: err instanceof Error ? err.message : "Unwatch failed",
      }),
  });

  return (
    <section className="space-y-2">
      <header className="flex items-center justify-between">
        <h3 className="font-mono text-[0.56rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
          Watchers · {watchers?.length ?? 0}
        </h3>
        {userId && (
          <button
            type="button"
            onClick={() => (isWatching ? unwatch.mutate() : watch.mutate())}
            disabled={watch.isPending || unwatch.isPending}
            className={cn(
              "inline-flex items-center gap-1 font-mono text-[0.54rem] uppercase tracking-[0.14em] px-1.5 py-0.5 border transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]",
              isWatching
                ? "border-[var(--boared-acid)] text-[var(--boared-acid)]"
                : "border-[var(--boared-rule)] text-[var(--boared-ink-faint)] hover:border-[var(--boared-ink)] hover:text-[var(--boared-ink)]",
            )}
          >
            {isWatching ? (
              <>
                <EyeOff className="h-3 w-3" aria-hidden="true" /> Unwatch
              </>
            ) : (
              <>
                <Eye className="h-3 w-3" aria-hidden="true" /> Watch
              </>
            )}
          </button>
        )}
      </header>
      {(watchers ?? []).length === 0 ? (
        <p className="font-serif italic text-[0.82rem] text-[var(--boared-ink-faint)]">
          No watchers yet.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {(watchers ?? []).map((w) => {
            const Icon = w.agentId ? Bot : UserIcon;
            return (
              <li
                key={w.id}
                className="flex items-center gap-2 px-1 text-xs text-[var(--boared-ink)]"
              >
                <Icon className="h-3 w-3 text-[var(--boared-ink-faint)] shrink-0" aria-hidden="true" />
                <span className="truncate">{w.displayName ?? (w.userId ?? w.agentId)?.slice(0, 8)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
