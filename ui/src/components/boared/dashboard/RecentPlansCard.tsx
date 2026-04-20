/**
 * RecentPlansCard — dashboard widget summarising planning-kind
 * activity at a glance. Shows:
 *   · in-flight planning cases (kind='planning', not yet done)
 *   · recently-transferred plans in the backlog
 *
 * Designed as a 2-column mini-dashboard tile; renders nothing if
 * the company has no planning activity yet.
 */

import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "../../../context/CompanyContext";
import { issuesApi } from "../../../api/issues";
import { backlogApi } from "../../../api/backlog";
import { queryKeys } from "../../../lib/queryKeys";
import { relativeTime } from "../../../lib/utils";

export function RecentPlansCard() {
  const { selectedCompanyId } = useCompany();

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId ?? ""),
    queryFn: () => issuesApi.list(selectedCompanyId!, {}),
    enabled: !!selectedCompanyId,
    staleTime: 60_000,
  });
  const { data: plans } = useQuery({
    queryKey: queryKeys.backlog.plans(selectedCompanyId ?? ""),
    queryFn: () => backlogApi.listPlans(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 60_000,
  });

  const planningInFlight = (issues ?? [])
    .filter((i) => i.kind === "planning" && i.status !== "done" && i.status !== "cancelled")
    .slice(0, 4);
  const recentPlans = (plans ?? [])
    .filter((p) => p.sourceIssueId)
    .slice(0, 4);

  if (planningInFlight.length === 0 && recentPlans.length === 0) return null;

  return (
    <section className="border border-[var(--boared-rule)] bg-[var(--boared-paper)]">
      <header className="px-3 py-2 border-b border-[var(--boared-rule)] flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h3 className="font-mono text-[0.56rem] uppercase tracking-[0.22em] text-[var(--boared-acid)]">
            ✦ Planning
          </h3>
          <span className="font-mono text-[0.52rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
            · investigations & transferred plans
          </span>
        </div>
        <Link
          to="/issues?kind=planning"
          className="font-mono text-[0.52rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)] transition-colors no-underline"
        >
          View all →
        </Link>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--boared-rule)]">
        <div className="p-3 space-y-2">
          <h4 className="font-mono text-[0.52rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)]">
            In flight · {planningInFlight.length}
          </h4>
          {planningInFlight.length === 0 ? (
            <p className="font-serif italic text-[0.8rem] text-[var(--boared-ink-faint)]">
              No planning cases are currently in flight.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {planningInFlight.map((i) => (
                <li key={i.id}>
                  <Link
                    to={`/issues/${i.identifier ?? i.id}`}
                    className="block hover:bg-[var(--boared-paper-2)] px-2 py-1 -mx-2 text-inherit no-underline"
                  >
                    <div className="font-serif italic text-[0.88rem] leading-snug truncate">
                      {i.title}
                    </div>
                    <div className="font-mono text-[0.52rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
                      § {i.identifier ?? i.id.slice(0, 8)} · {relativeTime(i.updatedAt)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="p-3 space-y-2">
          <h4 className="font-mono text-[0.52rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)]">
            Transferred to backlog · {recentPlans.length}
          </h4>
          {recentPlans.length === 0 ? (
            <p className="font-serif italic text-[0.8rem] text-[var(--boared-ink-faint)]">
              No plans have been transferred yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {recentPlans.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/backlog/plans/${p.id}`}
                    className="block hover:bg-[var(--boared-paper-2)] px-2 py-1 -mx-2 text-inherit no-underline"
                  >
                    <div className="font-serif italic text-[0.88rem] leading-snug truncate">
                      {p.title}
                    </div>
                    <div className="font-mono text-[0.52rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
                      {p.kind} · {relativeTime(p.createdAt)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
