import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/lib/router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { runnerApi } from "../api/runner";
import { RecentPlansCard } from "../components/boared/dashboard/RecentPlansCard";
import { DashboardNeedsYou } from "../components/boared/dashboard/DashboardNeedsYou";
import { DashboardRunningNow } from "../components/boared/dashboard/DashboardRunningNow";
import { dashboardApi } from "../api/dashboard";
import { activityApi } from "../api/activity";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { heartbeatsApi } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { ActivityRow } from "../components/ActivityRow";
import { cn, formatCents } from "../lib/utils";
import { Pause, Play, LayoutDashboard, ArrowRight } from "lucide-react";
import { ActiveAgentsPanel } from "../components/ActiveAgentsPanel";
import { PageSkeleton } from "../components/PageSkeleton";
import { PapeeHead } from "../components/boared/PapeeHead";
import { PapeeMemo } from "../components/boared/PapeeMemo";
import { Marginalia, type MarginaliaItem } from "../components/boared/Marginalia";
import { usePapeeMood } from "../hooks/usePapeeMood";
import type { PapeeMood } from "../lib/papee-personality";
import type { DashboardSummary } from "@paperclipai/shared";
import type { ActivityEvent, Agent } from "@paperclipai/shared";

/* ────────────────────────────────────────────────────────────────────
 *  Editorial Dashboard — "Today's Edition"
 *
 *  Six blocks, top to bottom:
 *    1. Editorial masthead with the Lead headline (Papee voice)
 *    2. The Memo — Papee's typewritten daily briefing
 *    3. ActiveAgentsPanel (kept — still useful)
 *    4. The Wire — full-width activity feed (dominant)
 *    5. The Marginalia — slim numeric rail (right side, reads as a sidebar)
 *    6. Footer colophon
 *
 *  Charts have moved to /activity. Numeric stats live as both prose
 *  (in the Memo) and quick-scan figures (in the Marginalia).
 *  Hooks, queries, mutations, refs, and effects are byte-identical to
 *  the previous version.
 * ──────────────────────────────────────────────────────────────────── */

function todayDateline(): string {
  const d = new Date();
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** The Lead — one declarative line in Papee's voice. */
function composeLeadHeadline(
  summary: DashboardSummary | undefined,
  mood: PapeeMood,
): string {
  if (!summary) return "Loading the wire.";
  const attentionCount =
    summary.pendingApprovals + summary.tasks.blocked + summary.agents.error;
  if (mood === "urgent") return "Something's on fire.";
  if (mood === "alert") {
    return attentionCount === 1
      ? "One thing needs your eye."
      : `${attentionCount} things need your eye.`;
  }
  if (mood === "happy") return "All quiet. Nothing burning.";
  return "All clear.";
}

/** The Memo body — 2-4 sentences in Papee's voice composed from summary. */
function composePapeeMemo(summary: DashboardSummary): string[] {
  const totalAgents =
    summary.agents.active +
    summary.agents.running +
    summary.agents.paused +
    summary.agents.error;

  const lines: string[] = [];

  // Line 1 — agent state
  if (totalAgents === 0) {
    lines.push("No agents on the floor yet. Hire one when you're ready.");
  } else {
    const verb = summary.agents.running === 0 ? "are idle" : "are working";
    lines.push(
      `${summary.agents.running} of ${totalAgents} ${totalAgents === 1 ? "agent" : "agents"} ${verb} right now${
        summary.agents.error > 0
          ? `, and ${summary.agents.error} ${summary.agents.error === 1 ? "is" : "are"} in error — I'll keep watch.`
          : "."
      }`,
    );
  }

  // Line 2 — task state
  const openTotal =
    summary.tasks.open + summary.tasks.inProgress + summary.tasks.blocked;
  if (openTotal === 0) {
    lines.push("Nothing on the docket. Quiet day.");
  } else {
    lines.push(
      `${summary.tasks.inProgress} ${summary.tasks.inProgress === 1 ? "matter" : "matters"} in progress, ${summary.tasks.open + summary.tasks.blocked} waiting${
        summary.tasks.blocked > 0
          ? ` (${summary.tasks.blocked} blocked)`
          : ""
      }.`,
    );
  }

  // Line 3 — money
  if (summary.costs.monthBudgetCents > 0) {
    lines.push(
      `${formatCents(summary.costs.monthSpendCents)} spent this month — ${summary.costs.monthUtilizationPercent}% of the budget.`,
    );
  } else {
    lines.push(
      `${formatCents(summary.costs.monthSpendCents)} spent this month.`,
    );
  }

  // Line 4 — approvals (only if any)
  if (summary.pendingApprovals > 0) {
    lines.push(
      `${summary.pendingApprovals} ${summary.pendingApprovals === 1 ? "matter awaits" : "matters await"} your eye.`,
    );
  }

  return lines;
}

/** Visual weight for a wire dispatch — runs and status changes read stronger. */
function eventWeight(event: ActivityEvent): "strong" | "quiet" {
  if (event.entityType === "agent_run") return "strong";
  if (
    event.entityType === "issue" &&
    (event.action.startsWith("issue.status_changed") ||
      event.action === "issue.created" ||
      event.action === "issue.assigned")
  ) {
    return "strong";
  }
  return "quiet";
}

export function Dashboard() {
  const { selectedCompanyId, selectedCompany, companies } = useCompany();
  const { openOnboarding } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [animatedActivityIds, setAnimatedActivityIds] = useState<Set<string>>(new Set());
  const seenActivityIdsRef = useRef<Set<string>>(new Set());
  const hydratedActivityRef = useRef(false);
  const activityAnimationTimersRef = useRef<number[]>([]);

  const mood = usePapeeMood();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "Today" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: activity } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId!),
    queryFn: () => activityApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });

  const { data: runnerStatus, refetch: refetchRunnerStatus } = useQuery({
    queryKey: ["runner-status"],
    queryFn: () => runnerApi.status(),
    refetchInterval: 5000,
  });

  const toggleRunner = useMutation({
    mutationFn: (paused: boolean) => runnerApi.setPaused(paused),
    onSuccess: () => refetchRunnerStatus(),
  });

  const recentActivity = useMemo(() => (activity ?? []).slice(0, 25), [activity]);

  useEffect(() => {
    for (const timer of activityAnimationTimersRef.current) {
      window.clearTimeout(timer);
    }
    activityAnimationTimersRef.current = [];
    seenActivityIdsRef.current = new Set();
    hydratedActivityRef.current = false;
    setAnimatedActivityIds(new Set());
  }, [selectedCompanyId]);

  useEffect(() => {
    if (recentActivity.length === 0) return;

    const seen = seenActivityIdsRef.current;
    const currentIds = recentActivity.map((event) => event.id);

    if (!hydratedActivityRef.current) {
      for (const id of currentIds) seen.add(id);
      hydratedActivityRef.current = true;
      return;
    }

    const newIds = currentIds.filter((id) => !seen.has(id));
    if (newIds.length === 0) {
      for (const id of currentIds) seen.add(id);
      return;
    }

    setAnimatedActivityIds((prev) => {
      const next = new Set(prev);
      for (const id of newIds) next.add(id);
      return next;
    });

    for (const id of newIds) seen.add(id);

    const timer = window.setTimeout(() => {
      setAnimatedActivityIds((prev) => {
        const next = new Set(prev);
        for (const id of newIds) next.delete(id);
        return next;
      });
      activityAnimationTimersRef.current = activityAnimationTimersRef.current.filter((t) => t !== timer);
    }, 980);
    activityAnimationTimersRef.current.push(timer);
  }, [recentActivity]);

  useEffect(() => {
    return () => {
      for (const timer of activityAnimationTimersRef.current) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.identifier ?? i.id.slice(0, 8));
    for (const a of agents ?? []) map.set(`agent:${a.id}`, a.name);
    for (const p of projects ?? []) map.set(`project:${p.id}`, p.name);
    return map;
  }, [issues, agents, projects]);

  const entityTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.title);
    return map;
  }, [issues]);

  if (!selectedCompanyId) {
    if (companies.length === 0) {
      return (
        <EmptyState
          icon={LayoutDashboard}
          message="Welcome. Set up your first organization to get started."
          action="Get started"
          onAction={openOnboarding}
          papee
          papeePose="waving"
        />
      );
    }
    return (
      <EmptyState
        icon={LayoutDashboard}
        message="Pick an organization from the masthead to see what's happening."
        papee
        papeePose="thinking"
      />
    );
  }

  if (isLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  const hasNoAgents = agents !== undefined && agents.length === 0;
  const runnerPaused = !!runnerStatus?.paused;
  const totalAgents = data
    ? data.agents.active + data.agents.running + data.agents.paused + data.agents.error
    : 0;
  const leadHeadline = composeLeadHeadline(data, mood);
  const memoLines = data ? composePapeeMemo(data) : [];

  // Marginalia items — six raw figures the data hounds will scan
  const marginaliaItems: MarginaliaItem[] = data
    ? [
        { label: "Agents", value: totalAgents, to: "/agents/all" },
        { label: "Running", value: data.agents.running, to: "/agents/active", accent: data.agents.running > 0 },
        { label: "Open matters", value: data.tasks.open + data.tasks.inProgress + data.tasks.blocked, to: "/issues" },
        { label: "In progress", value: data.tasks.inProgress, to: "/issues" },
        { label: "Spend", value: formatCents(data.costs.monthSpendCents), to: "/costs" },
        {
          label: "Approvals",
          value: data.pendingApprovals,
          to: "/approvals/pending",
          accent: data.pendingApprovals > 0,
        },
      ]
    : [];

  return (
    <div className="boared-reveal max-w-[1200px] mx-auto pb-32">
      {/* ── 1. Editorial masthead with the Lead ─────────────────── */}
      <header className="relative pb-8 mb-10 border-b-2 border-foreground">
        <div className="flex items-baseline justify-between gap-4 mb-6">
          <span className="boared-label text-foreground">
            §01 · The {selectedCompany?.name ?? "Boared"} Edition
          </span>
          <span className="font-mono text-[0.62rem] tracking-tight text-muted-foreground tabular-nums">
            {todayDateline()}
          </span>
        </div>

        <div className="grid grid-cols-12 gap-6 items-end">
          <h1 className="col-span-12 md:col-span-9 boared-display text-[clamp(2.75rem,6vw,5rem)] leading-[0.92] text-foreground">
            {leadHeadline}
          </h1>
          <div className="col-span-12 md:col-span-3 flex md:justify-end items-end gap-3">
            <div className="flex flex-col items-end gap-1">
              <span className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-muted-foreground">
                By Papee
              </span>
              <span className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-foreground">
                {mood}
              </span>
            </div>
            <PapeeHead mood={mood} size={44} />
          </div>
        </div>

        <div className="absolute top-0 right-0">
          <button
            type="button"
            onClick={() => toggleRunner.mutate(!runnerPaused)}
            disabled={toggleRunner.isPending}
            className={cn(
              "inline-flex items-center gap-2 px-3 h-7 border transition-colors",
              "font-mono text-[0.6rem] tracking-tight uppercase",
              runnerPaused
                ? "border-destructive text-destructive hover:bg-destructive hover:text-background"
                : "border-foreground text-foreground hover:bg-foreground hover:text-background",
            )}
            title={runnerPaused ? "Resume runner" : "Pause runner"}
          >
            {runnerPaused ? <Play className="size-2.5" /> : <Pause className="size-2.5" />}
            <span>{runnerPaused ? "Paused" : "Live"}</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-8 px-4 py-3 border border-destructive text-destructive font-mono text-[0.72rem]">
          {error.message}
        </div>
      )}

      {/* ── Control tower — operational surfaces lead. ─────────── */}
      <div className="space-y-4 mb-8">
        <DashboardNeedsYou companyId={selectedCompanyId!} />
        <DashboardRunningNow companyId={selectedCompanyId!} />
      </div>

      {/* Recent planning activity — investigations in flight and
       * recently-transferred plans, keeps the planning loop
       * visible from the dashboard. */}
      <div className="mb-6">
        <RecentPlansCard />
      </div>

      {hasNoAgents && (
        <div className="mb-10 flex items-center justify-between gap-3 px-4 py-3 border border-foreground bg-[var(--boared-paper-2)]">
          <p className="text-[0.82rem]">
            You have no agents.{" "}
            <button
              onClick={() => openOnboarding({ initialStep: 2, companyId: selectedCompanyId! })}
              className="underline underline-offset-4 hover:[text-decoration-color:var(--boared-acid)]"
            >
              Hire one
            </button>
            .
          </p>
        </div>
      )}

      {/* ── 2. Papee's typewritten memo ─────────────────────────── */}
      {data && (
        <div className="mb-12">
          <PapeeMemo
            re={`The state of ${selectedCompany?.name ?? "the bureau"}`}
            dated={todayDateline()}
            mood={mood}
            lines={memoLines}
          />
        </div>
      )}

      {/* ── 3. ActiveAgentsPanel ────────────────────────────────── */}
      <ActiveAgentsPanel companyId={selectedCompanyId!} />

      {/* ── 4. The Wire + 5. The Marginalia ─────────────────────── */}
      {data && (
        <section className="grid grid-cols-12 gap-x-10 gap-y-8 mt-12">
          {/* The Wire — main column */}
          <div className="col-span-12 md:col-span-9 min-w-0">
            <div className="flex items-baseline justify-between gap-3 mb-4 pb-2 border-b-2 border-foreground">
              <span className="boared-label text-foreground">The Wire</span>
              <span className="font-mono text-[0.6rem] text-muted-foreground tracking-tight tabular-nums flex items-center gap-3">
                {liveRuns && liveRuns.length > 0 && (
                  <span className="flex items-center gap-1.5 text-foreground">
                    <span className="size-1.5 bg-[var(--boared-acid)] animate-pulse" />
                    {liveRuns.length} LIVE
                  </span>
                )}
                <span>{recentActivity.length} ENTRIES</span>
              </span>
            </div>

            {/* Historical wire feed (live runs now hoisted to the
             * Running-now strip in the control tower above). */}
            {recentActivity.length === 0 ? (
              <p className="boared-display italic text-[1.4rem] text-muted-foreground py-8">
                Nothing on the wire yet.
              </p>
            ) : (
              <div className="border-t border-[var(--boared-rule)] divide-y divide-[var(--boared-rule)]">
                {recentActivity.map((event) => {
                  const weight = eventWeight(event);
                  return (
                    <ActivityRow
                      key={event.id}
                      event={event}
                      agentMap={agentMap}
                      entityNameMap={entityNameMap}
                      entityTitleMap={entityTitleMap}
                      className={cn(
                        weight === "quiet" && "opacity-60",
                        animatedActivityIds.has(event.id) && "activity-row-enter",
                      )}
                    />
                  );
                })}
              </div>
            )}

            <Link
              to="/activity"
              className="mt-4 inline-flex items-center gap-2 font-mono text-[0.66rem] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground transition-colors"
            >
              Older entries
              <ArrowRight className="size-3" strokeWidth={1.75} />
            </Link>
          </div>

          {/* The Marginalia — right rail */}
          <div className="col-span-12 md:col-span-3 min-w-0">
            <Marginalia items={marginaliaItems} eyebrow="At a glance" />
          </div>
        </section>
      )}

      {/* ── 6. Footer colophon ──────────────────────────────────── */}
      <footer className="mt-20 pt-6 border-t border-foreground flex items-baseline justify-between gap-4">
        <span className="boared-display italic text-[1.05rem] text-muted-foreground">
          Boared.
        </span>
        <span className="font-mono text-[0.6rem] tracking-[0.1em] uppercase text-muted-foreground">
          An edition of the {selectedCompany?.name ?? "house"} bureau.
        </span>
      </footer>
    </div>
  );
}
