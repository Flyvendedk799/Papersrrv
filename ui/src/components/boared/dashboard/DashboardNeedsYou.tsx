/**
 * DashboardNeedsYou — the human-attention queue.
 *
 * Surfaces three classes of work that require a person, in one
 * tight unified list:
 *
 *   · pending approvals       → [Approve] [Reject] [Open]
 *   · blocked issues          → [Open]
 *   · agents in error state   → [Restart] [Pause]
 *
 * The point: opening Boared, you should see the things waiting on
 * you before you see anything else. Empty state reads "all clear" —
 * not a default.
 *
 * Each action is optimistic + invalidates the relevant query so the
 * row disappears as soon as the human resolves it.
 */

import { useMemo } from "react";
import { Link } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Pause,
  Play,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { agentsApi } from "../../../api/agents";
import { approvalsApi } from "../../../api/approvals";
import { issuesApi } from "../../../api/issues";
import { queryKeys } from "../../../lib/queryKeys";
import { cn } from "../../../lib/utils";
import type { Agent, Approval, Issue } from "@paperclipai/shared";

interface Props {
  companyId: string;
  className?: string;
}

interface Row {
  id: string;
  kind: "approval" | "blocked" | "agent-error";
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  title: string;
  detail: string;
  href?: string;
  actions: React.ReactNode;
}

export function DashboardNeedsYou({ companyId, className }: Props) {
  const queryClient = useQueryClient();

  const { data: pendingApprovals = [] } = useQuery<Approval[]>({
    queryKey: queryKeys.approvals.list(companyId, "pending"),
    queryFn: () => approvalsApi.list(companyId, "pending"),
    enabled: !!companyId,
    refetchInterval: 30_000,
  });

  const { data: issues = [] } = useQuery<Issue[]>({
    queryKey: queryKeys.issues.list(companyId),
    queryFn: () => issuesApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const blockedIssues = useMemo(
    () => issues.filter((i) => i.status === "blocked"),
    [issues],
  );
  const erroredAgents = useMemo(
    () => agents.filter((a) => a.status === "error"),
    [agents],
  );

  /* ── Mutations ── */
  const invalidateApprovals = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(companyId, "pending") });
  const invalidateAgents = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(companyId) });

  const approve = useMutation({
    mutationFn: (id: string) => approvalsApi.approve(id),
    onSuccess: invalidateApprovals,
  });
  const reject = useMutation({
    mutationFn: (id: string) => approvalsApi.reject(id),
    onSuccess: invalidateApprovals,
  });
  const restart = useMutation({
    mutationFn: (agentId: string) => agentsApi.invoke(agentId, companyId),
    onSuccess: invalidateAgents,
  });
  const pause = useMutation({
    mutationFn: (agentId: string) => agentsApi.pause(agentId, companyId),
    onSuccess: invalidateAgents,
  });

  /* ── Compose unified row list ── */
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];

    for (const a of pendingApprovals) {
      const payloadTitle =
        typeof a.payload === "object" && a.payload && "title" in a.payload
          ? String((a.payload as { title?: unknown }).title ?? "")
          : "";
      out.push({
        id: `approval-${a.id}`,
        kind: "approval",
        icon: ShieldAlert,
        iconClass: "text-[var(--boared-acid)]",
        title: payloadTitle || `${a.type.replace(/_/g, " ")} approval`,
        detail: `${a.type.replace(/_/g, " ")} · awaiting review`,
        href: `/approvals/${a.id}`,
        actions: (
          <>
            <RowButton
              tone="primary"
              disabled={approve.isPending}
              onClick={() => approve.mutate(a.id)}
              title="Approve"
            >
              <CheckCircle2 className="h-3 w-3" />
              Approve
            </RowButton>
            <RowButton
              tone="danger"
              disabled={reject.isPending}
              onClick={() => reject.mutate(a.id)}
              title="Reject"
            >
              <XCircle className="h-3 w-3" />
              Reject
            </RowButton>
          </>
        ),
      });
    }

    for (const i of blockedIssues) {
      out.push({
        id: `blocked-${i.id}`,
        kind: "blocked",
        icon: AlertTriangle,
        iconClass: "text-[var(--boared-warn,#d49b59)]",
        title: i.title,
        detail: `${i.identifier ?? "case"} · blocked`,
        href: `/issues/${i.identifier ?? i.id}`,
        actions: (
          <RowButton tone="ghost" asLink to={`/issues/${i.identifier ?? i.id}`}>
            Open <ArrowRight className="h-3 w-3" />
          </RowButton>
        ),
      });
    }

    for (const a of erroredAgents) {
      out.push({
        id: `agent-error-${a.id}`,
        kind: "agent-error",
        icon: AlertTriangle,
        iconClass: "text-destructive",
        title: a.name,
        detail: `${a.role ?? "agent"} · last run failed`,
        href: `/agents/${a.id}`,
        actions: (
          <>
            <RowButton
              tone="primary"
              disabled={restart.isPending}
              onClick={() => restart.mutate(a.id)}
              title="Trigger a heartbeat"
            >
              <Play className="h-3 w-3" />
              Restart
            </RowButton>
            <RowButton
              tone="ghost"
              disabled={pause.isPending}
              onClick={() => pause.mutate(a.id)}
              title="Pause this agent"
            >
              <Pause className="h-3 w-3" />
              Pause
            </RowButton>
          </>
        ),
      });
    }

    return out;
  }, [pendingApprovals, blockedIssues, erroredAgents, approve, reject, restart, pause]);

  if (rows.length === 0) {
    return (
      <section
        className={cn(
          "border border-[var(--boared-rule)] bg-[var(--boared-paper-2)]/40 px-4 py-3 flex items-center justify-between gap-3",
          className,
        )}
        aria-label="Needs you queue, currently empty"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[var(--boared-success,#6fa67d)]" />
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[var(--boared-ink)]">
            Nothing on your desk
          </span>
        </div>
        <span className="font-serif italic text-[0.84rem] text-[var(--boared-ink-faint)]">
          No approvals, no blockers, no agent fires. All clear.
        </span>
      </section>
    );
  }

  return (
    <section className={cn("border-2 border-foreground", className)} aria-label="Needs your attention">
      <header className="flex items-baseline justify-between gap-3 px-4 py-2 border-b border-foreground bg-foreground/[0.03]">
        <span className="font-mono text-[0.66rem] uppercase tracking-[0.22em] text-foreground">
          Needs you · {rows.length}
        </span>
        <span className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-muted-foreground tabular-nums">
          {pendingApprovals.length} approvals · {blockedIssues.length} blocked · {erroredAgents.length} errors
        </span>
      </header>
      <ul className="divide-y divide-[var(--boared-rule)]">
        {rows.map((row) => (
          <li key={row.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2.5">
            <row.icon className={cn("h-4 w-4 shrink-0", row.iconClass)} />
            <div className="min-w-0">
              {row.href ? (
                <Link
                  to={row.href}
                  className="block truncate text-[0.92rem] font-medium text-foreground no-underline hover:underline decoration-dotted underline-offset-2"
                  title={row.title}
                >
                  {row.title}
                </Link>
              ) : (
                <span className="block truncate text-[0.92rem] font-medium text-foreground">
                  {row.title}
                </span>
              )}
              <span className="block truncate font-mono text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">
                {row.detail}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">{row.actions}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ────────────────────── Row button ────────────────────── */

interface RowButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  tone: "primary" | "danger" | "ghost";
  asLink?: boolean;
  to?: string;
}

function RowButton({ children, onClick, disabled, title, tone, asLink, to }: RowButtonProps) {
  const className = cn(
    "inline-flex items-center gap-1 px-2 h-7 font-mono text-[0.58rem] uppercase tracking-[0.14em] border transition-colors",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    tone === "primary" && "border-foreground text-foreground hover:bg-foreground hover:text-background",
    tone === "danger" && "border-destructive text-destructive hover:bg-destructive hover:text-background",
    tone === "ghost" && "border-[var(--boared-rule)] text-muted-foreground hover:text-foreground hover:border-foreground",
  );

  if (asLink && to) {
    return (
      <Link to={to} title={title} className={cn(className, "no-underline")}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={className}>
      {children}
    </button>
  );
}
