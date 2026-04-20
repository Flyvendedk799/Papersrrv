/**
 * BacklogPlanDetail — proper detail view for a single backlog plan.
 *
 * Includes provenance (source issue link for planning-transfer
 * plans), full description rendered as markdown, child backlog
 * items grouped by status, dates, and actions.
 */

import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { backlogApi } from "../api/backlog";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { relativeTime } from "../lib/utils";
import { MarkdownBody } from "../components/MarkdownBody";
import { EmptyState } from "../components/boared/EmptyState";
import { SkeletonList } from "../components/boared/Skeleton";
import { RouteErrorBoundary } from "../components/boared/RouteErrorBoundary";

export function BacklogPlanDetail() {
  return (
    <RouteErrorBoundary routeName="plan detail">
      <BacklogPlanDetailInner />
    </RouteErrorBoundary>
  );
}

function BacklogPlanDetailInner() {
  const { planId } = useParams<{ planId: string }>();
  const { selectedCompanyId } = useCompany();

  const { data: plan, isLoading } = useQuery({
    queryKey: queryKeys.backlog.plan(selectedCompanyId ?? "", planId ?? ""),
    queryFn: () => backlogApi.getPlan(selectedCompanyId!, planId!),
    enabled: !!selectedCompanyId && !!planId,
  });

  const { data: itemsRes } = useQuery({
    queryKey: queryKeys.backlog.items(selectedCompanyId ?? "", `plan:${planId ?? ""}`),
    queryFn: () => backlogApi.listItems(selectedCompanyId!, { planId: planId }),
    enabled: !!selectedCompanyId && !!planId,
  });
  const items = itemsRes ?? [];

  const grouped = useMemo(() => {
    const m = new Map<string, typeof items>();
    for (const i of items) {
      const arr = m.get(i.status) ?? [];
      arr.push(i);
      m.set(i.status, arr);
    }
    return m;
  }, [items]);

  if (isLoading || !plan) {
    return (
      <div className="mx-auto w-full max-w-[960px] px-4 py-6 space-y-4">
        <div className="h-3 w-24 bg-[var(--boared-rule)]/50 animate-pulse" />
        <div className="h-10 w-2/3 bg-[var(--boared-rule)]/40 animate-pulse" />
        <SkeletonList rows={4} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-6 space-y-6">
      {/* Breadcrumb */}
      <nav className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)] flex items-center gap-2">
        <Link to="/backlog" className="hover:text-[var(--boared-ink)] no-underline">
          Backlog
        </Link>
        <span aria-hidden="true">›</span>
        <Link to="/backlog?view=plans" className="hover:text-[var(--boared-ink)] no-underline">
          Plans
        </Link>
        <span aria-hidden="true">›</span>
        <span className="text-[var(--boared-ink)] truncate max-w-[32ch]">{plan.title}</span>
      </nav>

      {/* Hero */}
      <header className="space-y-3 border-b border-[var(--boared-rule)] pb-4">
        <div className="flex items-center gap-2 font-mono text-[0.58rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
          <span>{plan.kind}</span>
          <span aria-hidden="true">·</span>
          <span
            className={
              plan.status === "active"
                ? "text-[var(--boared-info)]"
                : plan.archivedAt
                  ? "text-[var(--boared-ink-faint)]"
                  : "text-[var(--boared-ink)]"
            }
          >
            {plan.archivedAt ? "archived" : plan.status}
          </span>
          <span aria-hidden="true">·</span>
          <span>updated {relativeTime(plan.updatedAt)}</span>
          {plan.sourceIssueId && (
            <>
              <span aria-hidden="true">·</span>
              <Link
                to={`/issues/${plan.sourceIssueId}`}
                className="text-[var(--boared-acid)] no-underline hover:underline"
              >
                ← from planning case
              </Link>
            </>
          )}
        </div>
        <h1 className="font-serif italic text-[clamp(1.8rem,4vw,2.8rem)] leading-tight text-[var(--boared-ink)]">
          {plan.title}
        </h1>
      </header>

      {/* Body */}
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-6 min-w-0">
          {/* Description (markdown — rendered plan body) */}
          <section>
            <h2 className="font-mono text-[0.58rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)] mb-2">
              Plan
            </h2>
            {plan.description ? (
              <MarkdownBody className="prose-serif">{plan.description}</MarkdownBody>
            ) : (
              <p className="font-serif italic text-[var(--boared-ink-faint)]">
                No plan body yet.
              </p>
            )}
          </section>

          {/* Items grouped by status */}
          <section>
            <h2 className="font-mono text-[0.58rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)] mb-2">
              Items in this plan · {items.length}
            </h2>
            {items.length === 0 ? (
              <EmptyState
                title="No items filed under this plan yet."
                description="Items appear here when they're filed against this plan, or when promoted from steps."
                kicker="Empty plan"
                primaryAction={{
                  label: "View full backlog",
                  href: "/backlog",
                }}
              />
            ) : (
              <div className="space-y-3">
                {Array.from(grouped.entries()).map(([status, list]) => (
                  <div key={status}>
                    <h3 className="font-mono text-[0.56rem] uppercase tracking-[0.18em] text-[var(--boared-ink-soft)] mb-1.5">
                      {status} · {list.length}
                    </h3>
                    <ul className="border border-[var(--boared-rule)] divide-y divide-[var(--boared-rule)]">
                      {list.map((it) => (
                        <li key={it.id}>
                          <Link
                            to={`/backlog/items/${it.id}`}
                            className="flex items-baseline gap-2 px-3 py-2 hover:bg-[var(--boared-paper-2)] no-underline text-inherit"
                          >
                            <span className="font-serif italic text-[0.92rem] text-[var(--boared-ink)] flex-1 min-w-0 truncate">
                              {it.title}
                            </span>
                            <span className="font-mono text-[0.52rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
                              {relativeTime(it.updatedAt)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <aside className="border border-[var(--boared-rule)] bg-[var(--boared-paper)] p-3 space-y-3 h-fit">
          <Row label="Created" value={relativeTime(plan.createdAt)} />
          {plan.startsAt && <Row label="Starts" value={relativeTime(plan.startsAt)} />}
          {plan.endsAt && <Row label="Ends" value={relativeTime(plan.endsAt)} />}
          {plan.sourceIssueId && (
            <Row
              label="Origin"
              value={
                <Link
                  to={`/issues/${plan.sourceIssueId}`}
                  className="text-[var(--boared-acid)] hover:underline no-underline font-mono text-[0.68rem]"
                >
                  § {plan.sourceIssueId.slice(0, 8)}
                </Link>
              }
            />
          )}
          <Row label="Items" value={<span className="tabular-nums">{items.length}</span>} />
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[0.82rem]">
      <span className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
        {label}
      </span>
      <span className="text-[var(--boared-ink)]">{value}</span>
    </div>
  );
}
