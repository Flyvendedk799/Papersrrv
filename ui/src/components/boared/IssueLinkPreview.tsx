/**
 * IssueLinkPreview — hover-card that shows up when the user
 * hovers an internal `/issues/:id` link. Renders the issue's
 * title, kicker, status, and abstract (from synthesis if
 * cached) so readers can peek without navigating.
 *
 * Used in thread cards, activity logs, comments — anywhere an
 * internal case reference appears. Zero extra network on hover
 * when react-query already has the data cached; otherwise
 * fetches on first hover and reuses for subsequent hovers.
 */

import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { issuesApi } from "../../api/issues";
import { queryKeys } from "../../lib/queryKeys";
import { cn, relativeTime } from "../../lib/utils";
import { StatusIcon } from "../StatusIcon";

interface Props {
  to: string;
  issueRef: string; // identifier or uuid
  children: React.ReactNode;
  className?: string;
}

export function IssueLinkPreview({ to, issueRef, children, className }: Props) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<number | null>(null);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);

  const { data: issue } = useQuery({
    queryKey: queryKeys.issues.detail(issueRef),
    queryFn: () => issuesApi.get(issueRef),
    enabled: open,
    staleTime: 30_000,
  });
  const { data: synthesis } = useQuery({
    queryKey: queryKeys.issues.synthesis(issueRef),
    queryFn: () => issuesApi.synthesis(issueRef),
    enabled: open && !!issue,
    staleTime: 60_000,
  });

  const onEnter = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setOpen(true), 380);
  };
  const onLeave = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setOpen(false), 140);
  };

  return (
    <span
      ref={wrapperRef}
      className={cn("relative inline", className)}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <Link to={to} className="underline decoration-dotted underline-offset-2 hover:text-[var(--boared-acid)] transition-colors">
        {children}
      </Link>
      {open && (
        <span
          role="tooltip"
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          className="absolute left-0 top-full z-40 mt-1 block w-[320px] max-w-[90vw] p-3 border border-[var(--boared-rule)] bg-[var(--boared-paper)] shadow-lg animate-in fade-in slide-in-from-top-1 duration-150"
          style={{ whiteSpace: "normal" }}
        >
          {!issue ? (
            <span className="block space-y-1.5">
              <span className="block h-3 w-24 bg-[var(--boared-rule)]/50 animate-pulse" />
              <span className="block h-4 w-full bg-[var(--boared-rule)]/40 animate-pulse" />
            </span>
          ) : (
            <span className="block space-y-2">
              <span className="flex items-center gap-1.5 font-mono text-[0.54rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)]">
                <span>§ {issue.identifier ?? issue.id.slice(0, 8)}</span>
                <span aria-hidden="true">·</span>
                <span>{relativeTime(issue.updatedAt)}</span>
                {issue.kind === "planning" && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-[var(--boared-acid)]">PLAN</span>
                  </>
                )}
              </span>
              <span className="block font-serif italic text-[0.95rem] leading-[1.3] text-[var(--boared-ink)]">
                {issue.title}
              </span>
              <span className="flex items-center gap-2">
                <StatusIcon status={issue.status} />
                {issue.priority && (
                  <span className="font-mono text-[0.52rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
                    {issue.priority}
                  </span>
                )}
              </span>
              {synthesis?.abstract && (
                <span className="block text-[0.82rem] leading-snug text-[var(--boared-ink-soft)] line-clamp-3">
                  {synthesis.abstract}
                </span>
              )}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
