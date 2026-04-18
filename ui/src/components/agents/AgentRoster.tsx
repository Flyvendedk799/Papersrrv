/**
 * AgentRoster — renders a sorted/grouped collection of agents as either
 * a dense list or a card grid. Grouping uses section headers with a hair
 * rule and a capitalised label (design guide §6 "Grouped list pattern").
 *
 * The roster is intentionally uncontrolled beyond what the toolbar tells
 * it: the parent filters (tab + showTerminated), this component only
 * presents. That keeps the page thin and lets us preview the roster in
 * the design guide with synthetic data.
 */

import { useMemo } from "react";
import type { Agent } from "@paperclipai/shared";
import { AgentRosterCard } from "./AgentRosterCard";
import { AgentRosterRow } from "./AgentRosterRow";
import type { RosterGroup, RosterSort, RosterView } from "./AgentRosterToolbar";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  ceo: "Executive — CEO",
  cto: "Executive — CTO",
  cmo: "Executive — CMO",
  cfo: "Executive — CFO",
  engineer: "Engineering",
  designer: "Design",
  pm: "Product",
  qa: "Quality",
  devops: "DevOps",
  researcher: "Research",
  general: "General",
};

const STATUS_LABELS: Record<string, string> = {
  running: "Live",
  active: "Active",
  idle: "Idle",
  paused: "Paused",
  error: "Error",
  pending_approval: "Pending approval",
  archived: "Archived",
  terminated: "Terminated",
};

const STATUS_ORDER = ["running", "active", "idle", "paused", "pending_approval", "error", "archived", "terminated"];

export interface AgentRosterProps {
  agents: Agent[];
  liveRunByAgent: Map<string, { runId: string; liveCount: number }>;
  view: Exclude<RosterView, "org">;
  sort: RosterSort;
  groupBy: RosterGroup;
  search: string;
  className?: string;
  emptyMessage?: string;
}

export function AgentRoster({
  agents,
  liveRunByAgent,
  view,
  sort,
  groupBy,
  search,
  className,
  emptyMessage = "No agents match.",
}: AgentRosterProps) {
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = needle
      ? agents.filter((a) => matchesSearch(a, needle))
      : agents;
    return [...filtered].sort(comparatorFor(sort, liveRunByAgent));
  }, [agents, search, sort, liveRunByAgent]);

  if (visible.length === 0) {
    return (
      <p className={cn("font-mono text-[0.72rem] text-muted-foreground text-center py-8", className)}>
        {emptyMessage}
      </p>
    );
  }

  if (groupBy === "none") {
    return <RosterBody agents={visible} liveRunByAgent={liveRunByAgent} view={view} className={className} />;
  }

  const groups = partition(visible, groupBy);
  return (
    <div className={cn("space-y-4", className)}>
      {groups.map(({ key, label, items }) => (
        <section key={key}>
          <header className="flex items-baseline gap-3 border-b border-[var(--boared-rule)] pb-1 mb-2">
            <h3 className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-foreground">
              {label}
            </h3>
            <span className="font-mono text-[0.58rem] text-muted-foreground tabular-nums">
              {items.length}
            </span>
          </header>
          <RosterBody agents={items} liveRunByAgent={liveRunByAgent} view={view} />
        </section>
      ))}
    </div>
  );
}

function RosterBody({
  agents,
  liveRunByAgent,
  view,
  className,
}: {
  agents: Agent[];
  liveRunByAgent: Map<string, { runId: string; liveCount: number }>;
  view: Exclude<RosterView, "org">;
  className?: string;
}) {
  if (view === "grid") {
    return (
      <div
        className={cn(
          "grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4",
          className,
        )}
      >
        {agents.map((a) => (
          <AgentRosterCard key={a.id} agent={a} liveRun={liveRunByAgent.get(a.id)} />
        ))}
      </div>
    );
  }
  return (
    <div className={cn("border-t border-[var(--boared-rule)]", className)}>
      {agents.map((a) => (
        <AgentRosterRow key={a.id} agent={a} liveRun={liveRunByAgent.get(a.id)} />
      ))}
    </div>
  );
}

function matchesSearch(a: Agent, needle: string): boolean {
  if (a.name.toLowerCase().includes(needle)) return true;
  if (a.role.toLowerCase().includes(needle)) return true;
  if (a.title && a.title.toLowerCase().includes(needle)) return true;
  if (a.adapterType.toLowerCase().includes(needle)) return true;
  const model = (a.adapterConfig as Record<string, unknown>)?.model;
  if (typeof model === "string" && model.toLowerCase().includes(needle)) return true;
  return false;
}

function comparatorFor(sort: RosterSort, live: Map<string, { runId: string; liveCount: number }>) {
  return (a: Agent, b: Agent) => {
    if (sort === "live") {
      const la = live.has(a.id) ? 1 : 0;
      const lb = live.has(b.id) ? 1 : 0;
      if (la !== lb) return lb - la;
      return timeDesc(a, b);
    }
    if (sort === "activity") return timeDesc(a, b);
    return a.name.localeCompare(b.name);
  };
}

function timeDesc(a: Agent, b: Agent): number {
  const ta = a.lastHeartbeatAt ? new Date(a.lastHeartbeatAt).getTime() : 0;
  const tb = b.lastHeartbeatAt ? new Date(b.lastHeartbeatAt).getTime() : 0;
  return tb - ta;
}

function partition(
  agents: Agent[],
  groupBy: Exclude<RosterGroup, "none">,
): Array<{ key: string; label: string; items: Agent[] }> {
  const buckets = new Map<string, Agent[]>();
  for (const a of agents) {
    const key = groupBy === "role" ? a.role : a.status;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(a);
  }
  const entries = Array.from(buckets.entries());
  if (groupBy === "status") {
    entries.sort(([a], [b]) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b));
  } else {
    entries.sort(([a], [b]) => (ROLE_LABELS[a] ?? a).localeCompare(ROLE_LABELS[b] ?? b));
  }
  return entries.map(([key, items]) => ({
    key,
    label: groupBy === "role" ? (ROLE_LABELS[key] ?? key) : (STATUS_LABELS[key] ?? key),
    items,
  }));
}
