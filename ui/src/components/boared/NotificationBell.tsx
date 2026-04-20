/**
 * NotificationBell — compact unread indicator + popover with recent
 * activity. Uses the existing company-wide activity feed.
 *
 * "Unread" = activity events newer than last-seen timestamp stored
 * per company in localStorage. Clicking marks everything seen.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { activityApi } from "../../api/activity";
import { queryKeys } from "../../lib/queryKeys";
import { useCompany } from "../../context/CompanyContext";
import { cn, relativeTime } from "../../lib/utils";

function lastSeenKey(companyId: string): string {
  return `paperclip.notif.lastSeen.${companyId}`;
}

export function NotificationBell({ className }: { className?: string }) {
  const { selectedCompanyId } = useCompany();
  const [open, setOpen] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState<number>(() =>
    selectedCompanyId
      ? Number(window.localStorage.getItem(lastSeenKey(selectedCompanyId)) ?? 0)
      : 0,
  );
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!selectedCompanyId) {
      setLastSeenAt(0);
      return;
    }
    setLastSeenAt(Number(window.localStorage.getItem(lastSeenKey(selectedCompanyId)) ?? 0));
  }, [selectedCompanyId]);

  const { data: activity } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId ?? ""),
    queryFn: () => activityApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const recent = useMemo(() => (activity ?? []).slice(0, 12), [activity]);

  const unreadCount = useMemo(() => {
    if (!lastSeenAt) return recent.length;
    return recent.filter((e) => new Date(e.createdAt).getTime() > lastSeenAt).length;
  }, [recent, lastSeenAt]);

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      if (next && selectedCompanyId) {
        // Mark seen — newest event becomes the watermark.
        const newest = recent[0] ? new Date(recent[0].createdAt).getTime() : Date.now();
        window.localStorage.setItem(lastSeenKey(selectedCompanyId), String(newest));
        setLastSeenAt(newest);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!selectedCompanyId) return null;

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-label={unreadCount > 0 ? `${unreadCount} unread activities` : "Activity"}
        className="relative inline-flex items-center justify-center h-8 w-8 rounded hover:bg-[var(--boared-paper-2)] transition-colors text-[var(--boared-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--boared-ink)]/40"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 inline-block w-2 h-2 rounded-full bg-[var(--boared-acid)]"
          />
        )}
      </button>
      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-1 w-[360px] z-50 border border-[var(--boared-rule)] bg-[var(--boared-paper)] shadow-xl animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <header className="px-3 py-2 border-b border-[var(--boared-rule)] flex items-center justify-between">
            <span className="font-mono text-[0.56rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
              Activity
            </span>
            <Link
              to="/activity"
              onClick={() => setOpen(false)}
              className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)] transition-colors no-underline"
            >
              View all →
            </Link>
          </header>
          <ol className="max-h-[60vh] overflow-y-auto divide-y divide-[var(--boared-rule)]">
            {recent.length === 0 ? (
              <li className="px-3 py-6 text-center font-serif italic text-[0.88rem] text-[var(--boared-ink-faint)]">
                No activity yet.
              </li>
            ) : (
              recent.map((evt) => {
                const isUnread = new Date(evt.createdAt).getTime() > lastSeenAt;
                return (
                  <li key={evt.id}>
                    <Link
                      to={
                        evt.entityType === "issue"
                          ? `/issues/${evt.entityId}`
                          : evt.entityType === "agent"
                            ? `/agents/${evt.entityId}`
                            : "/activity"
                      }
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-start gap-2 px-3 py-2 hover:bg-[var(--boared-paper-2)] transition-colors no-underline text-inherit",
                        isUnread && "bg-[var(--boared-acid)]/[0.03]",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0",
                          isUnread
                            ? "bg-[var(--boared-acid)]"
                            : "bg-[var(--boared-rule)]",
                        )}
                      />
                      <span className="flex-1 min-w-0 space-y-0.5">
                        <span className="block text-[0.84rem] leading-snug text-[var(--boared-ink)] truncate">
                          {humanizeAction(evt.action)}
                        </span>
                        <span className="block font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] tabular-nums">
                          {relativeTime(evt.createdAt)} · {evt.entityType}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })
            )}
          </ol>
        </div>
      )}
    </div>
  );
}

function humanizeAction(action: string): string {
  return action.replace(/[._]/g, " ").replace(/^./, (c) => c.toUpperCase());
}
