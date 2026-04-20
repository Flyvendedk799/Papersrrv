/**
 * BacklogPlanDetail — proper detail view for a single backlog plan.
 *
 * Renders the structured plan document (F3), live execution
 * progress (F4), discussion thread (F5), approval banner (F6),
 * revision history tab (F7), save-as-template action (F10), plus
 * the existing provenance + items grouping.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { planOutputSchema, type PlanOutput } from "@paperclipai/shared";
import { Check, X, History, MessageSquare, FileText, Bookmark } from "lucide-react";
import { backlogApi } from "../api/backlog";
import { useCompany } from "../context/CompanyContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { cn, relativeTime } from "../lib/utils";
import { MarkdownBody } from "../components/MarkdownBody";
import { EmptyState } from "../components/boared/EmptyState";
import { SkeletonList } from "../components/boared/Skeleton";
import { RouteErrorBoundary } from "../components/boared/RouteErrorBoundary";
import { CasePlanDocument } from "../components/boared/caseFile/CasePlanDocument";
import { PlanProgressBand } from "../components/boared/caseFile/PlanProgressBand";
import { PlanCommentThread } from "../components/boared/caseFile/PlanCommentThread";
import { PlanRevisionsPanel } from "../components/boared/caseFile/PlanRevisionsPanel";
import { PlanApprovalBanner } from "../components/boared/caseFile/PlanApprovalBanner";
import { PlanSaveAsTemplateDialog } from "../components/boared/caseFile/PlanSaveAsTemplateDialog";

type TabKey = "plan" | "items" | "discussion" | "revisions";

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
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("plan");
  const [spawningIdx, setSpawningIdx] = useState<number | null>(null);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);

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

  const { data: progress } = useQuery({
    queryKey: [...queryKeys.backlog.plan(selectedCompanyId ?? "", planId ?? ""), "progress"],
    queryFn: () => backlogApi.planProgress(selectedCompanyId!, planId!),
    enabled: !!selectedCompanyId && !!planId,
    refetchInterval: 20_000,
  });

  const parsedPlan: PlanOutput | null = useMemo(() => {
    if (!plan?.planOutputJson) return null;
    const r = planOutputSchema.safeParse(plan.planOutputJson);
    return r.success ? r.data : null;
  }, [plan?.planOutputJson]);

  const grouped = useMemo(() => {
    const m = new Map<string, typeof items>();
    for (const i of items) {
      const arr = m.get(i.status) ?? [];
      arr.push(i);
      m.set(i.status, arr);
    }
    return m;
  }, [items]);

  const spawnStep = useMutation({
    mutationFn: (stepIdx: number) => {
      setSpawningIdx(stepIdx);
      return backlogApi.spawnIssueFromStep(selectedCompanyId!, planId!, stepIdx);
    },
    onSuccess: (res) => {
      setSpawningIdx(null);
      qc.invalidateQueries({ queryKey: queryKeys.backlog.plan(selectedCompanyId!, planId!) });
      qc.invalidateQueries({
        queryKey: [...queryKeys.backlog.plan(selectedCompanyId!, planId!), "progress"],
      });
      pushToast({
        tone: "info",
        title: res.alreadyExisted ? "Issue already linked" : "Issue spawned",
      });
    },
    onError: (err) => {
      setSpawningIdx(null);
      pushToast({
        tone: "error",
        title: err instanceof Error ? err.message : "Spawn failed",
      });
    },
  });

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
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h1 className="font-serif italic text-[clamp(1.8rem,4vw,2.8rem)] leading-tight text-[var(--boared-ink)]">
            {plan.title}
          </h1>
          {parsedPlan && (
            <button
              type="button"
              onClick={() => setSaveTemplateOpen(true)}
              className="inline-flex items-center gap-1.5 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-acid)] border border-[var(--boared-rule)] px-2 py-1 focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]"
            >
              <Bookmark className="h-3 w-3" aria-hidden="true" />
              Save as template
            </button>
          )}
        </div>
        {progress && <PlanProgressBand progress={progress} />}
      </header>

      <PlanApprovalBanner plan={plan} />

      <nav className="flex items-center gap-4 border-b border-[var(--boared-rule)] -mb-2">
        <TabButton active={tab === "plan"} onClick={() => setTab("plan")}>
          <FileText className="h-3 w-3" aria-hidden="true" /> Plan
        </TabButton>
        <TabButton active={tab === "items"} onClick={() => setTab("items")}>
          Items · {items.length}
        </TabButton>
        <TabButton active={tab === "discussion"} onClick={() => setTab("discussion")}>
          <MessageSquare className="h-3 w-3" aria-hidden="true" /> Discussion
        </TabButton>
        <TabButton active={tab === "revisions"} onClick={() => setTab("revisions")}>
          <History className="h-3 w-3" aria-hidden="true" /> Revisions
        </TabButton>
      </nav>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-6 min-w-0">
          {tab === "plan" && (
            <section className="space-y-6">
              {parsedPlan ? (
                <CasePlanDocument
                  plan={parsedPlan}
                  animateIn
                  onSpawnIssue={(idx) => spawnStep.mutate(idx)}
                  spawningStepIdx={spawningIdx}
                  onOpenIssue={(issueId) => navigate(`/issues/${issueId}`)}
                />
              ) : plan.description ? (
                <section>
                  <h2 className="font-mono text-[0.58rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)] mb-2">
                    Plan
                  </h2>
                  <MarkdownBody className="prose-serif">{plan.description}</MarkdownBody>
                </section>
              ) : (
                <p className="font-serif italic text-[var(--boared-ink-faint)]">
                  No plan body yet.
                </p>
              )}
            </section>
          )}

          {tab === "items" && (
            <section>
              <h2 className="font-mono text-[0.58rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)] mb-2">
                Items in this plan · {items.length}
              </h2>
              {items.length === 0 ? (
                <EmptyState
                  title="No items filed under this plan yet."
                  description="Items appear here when they're filed against this plan, or when promoted from steps."
                  kicker="Empty plan"
                  primaryAction={{ label: "View full backlog", href: "/backlog" }}
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
          )}

          {tab === "discussion" && <PlanCommentThread planId={plan.id} companyId={plan.companyId} />}

          {tab === "revisions" && <PlanRevisionsPanel planId={plan.id} companyId={plan.companyId} />}
        </div>

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
          {progress && (
            <Row
              label="Progress"
              value={
                <span className="tabular-nums">
                  {progress.done}/{progress.total}
                </span>
              }
            />
          )}
        </aside>
      </div>

      {parsedPlan && saveTemplateOpen && (
        <PlanSaveAsTemplateDialog
          plan={parsedPlan}
          companyId={plan.companyId}
          defaultName={plan.title}
          onClose={() => setSaveTemplateOpen(false)}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative inline-flex items-center gap-1 py-2 font-mono text-[0.62rem] uppercase tracking-[0.14em] focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]",
        active
          ? "text-[var(--boared-ink)] after:content-[''] after:absolute after:left-0 after:right-0 after:-bottom-px after:h-px after:bg-[var(--boared-ink)]"
          : "text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)]",
      )}
    >
      {children}
    </button>
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

// Unused exports kept to avoid accidental orphan lint; these are
// symbols referenced in JSX above.
export const _ref = { Check, X };
