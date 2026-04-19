import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { activityApi } from "../api/activity";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { goalsApi } from "../api/goals";
import { heartbeatsApi } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { ActivityRow } from "../components/ActivityRow";
import { PageSkeleton } from "../components/PageSkeleton";
import { PageHeader } from "../components/boared/PageHeader";
import { RunActivityChart, PriorityChart, IssueStatusChart, SuccessRateChart } from "../components/ActivityCharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { History } from "lucide-react";
import type { Agent } from "@paperclipai/shared";

function todayDateline(): string {
  const d = new Date();
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function Activity() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    setBreadcrumbs([{ label: "Activity" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId!),
    queryFn: () => activityApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
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

  const { data: goals } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!),
    queryFn: () => goalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: runs } = useQuery({
    queryKey: queryKeys.heartbeats(selectedCompanyId!),
    queryFn: () => heartbeatsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

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
    for (const g of goals ?? []) map.set(`goal:${g.id}`, g.title);
    return map;
  }, [issues, agents, projects, goals]);

  const entityTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.title);
    return map;
  }, [issues]);

  if (!selectedCompanyId) {
    return <EmptyState icon={History} message="Select a company to view activity." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  const filtered =
    data && filter !== "all"
      ? data.filter((e) => e.entityType === filter)
      : data;

  const entityTypes = data
    ? [...new Set(data.map((e) => e.entityType))].sort()
    : [];

  return (
    <div className="boared-reveal max-w-[1400px] mx-auto">
      <PageHeader
        kicker={<>§14 · Activity</>}
        title={<>The <em className="not-italic font-normal">wire</em>.</>}
        dateline={todayDateline()}
        actions={
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[160px] h-9 text-xs" data-slot="select-trigger">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {entityTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {/* By the numbers — 14-day trend strip migrated from Dashboard */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between gap-3 mb-4 pb-2 border-b border-[var(--boared-rule)]">
          <span className="boared-label text-foreground">By the numbers</span>
          <span className="font-mono text-[0.6rem] text-muted-foreground tracking-tight">14d · charts</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-[var(--boared-rule)] border-y border-[var(--boared-rule)]">
          <div className="px-4 py-4">
            <p className="boared-label mb-3">Runs</p>
            <RunActivityChart runs={runs ?? []} />
          </div>
          <div className="px-4 py-4">
            <p className="boared-label mb-3">Priority</p>
            <PriorityChart issues={issues ?? []} />
          </div>
          <div className="px-4 py-4">
            <p className="boared-label mb-3">Status</p>
            <IssueStatusChart issues={issues ?? []} />
          </div>
          <div className="px-4 py-4">
            <p className="boared-label mb-3">Success</p>
            <SuccessRateChart runs={runs ?? []} />
          </div>
        </div>
      </section>

      {error && (
        <div className="mb-6 px-4 py-3 border border-destructive text-destructive font-mono text-[0.72rem]">
          {error.message}
        </div>
      )}

      {filtered && filtered.length === 0 && (
        <EmptyState icon={History} message="Nothing on the wire. Yet." />
      )}

      {filtered && filtered.length > 0 && (
        <div className="border-t border-[var(--boared-rule)] divide-y divide-[var(--boared-rule)]">
          {filtered.map((event) => (
            <ActivityRow
              key={event.id}
              event={event}
              agentMap={agentMap}
              entityNameMap={entityNameMap}
              entityTitleMap={entityTitleMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}
