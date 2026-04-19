import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useLocation } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentsApi, type OrgNode } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useSidebar } from "../context/SidebarContext";
import { queryKeys } from "../lib/queryKeys";
import { StatusBadge } from "../components/StatusBadge";
import { agentStatusDot, agentStatusDotDefault } from "../lib/status-colors";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { relativeTime, cn, agentRouteRef, agentUrl } from "../lib/utils";
import { PageTabBar } from "../components/PageTabBar";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Bot, Plus, SlidersHorizontal, RefreshCw } from "lucide-react";
import type { Agent } from "@paperclipai/shared";
import { PageHeader } from "../components/boared/PageHeader";
import { AgentRoster } from "../components/agents/AgentRoster";
import {
  AgentRosterToolbar,
  type RosterGroup,
  type RosterSort,
  type RosterView,
} from "../components/agents/AgentRosterToolbar";

const adapterLabels: Record<string, string> = {
  claude_local: "Claude",
  codex_local: "Codex",
  opencode_local: "OpenCode",
  cursor: "Cursor",
  openclaw: "OpenClaw",
  openclaw_gateway: "OpenClaw Gateway",
  process: "Process",
  http: "HTTP",
};

const roleLabels: Record<string, string> = {
  ceo: "CEO", cto: "CTO", cmo: "CMO", cfo: "CFO",
  engineer: "Engineer", designer: "Designer", pm: "PM",
  qa: "QA", devops: "DevOps", researcher: "Researcher", general: "General",
};

type FilterTab = "all" | "active" | "paused" | "error";

function matchesFilter(status: string, tab: FilterTab, showTerminated: boolean): boolean {
  if (status === "terminated") return showTerminated;
  if (tab === "all") return true;
  if (tab === "active") return status === "active" || status === "running" || status === "idle";
  if (tab === "paused") return status === "paused";
  if (tab === "error") return status === "error";
  return true;
}

function filterAgents(agents: Agent[], tab: FilterTab, showTerminated: boolean): Agent[] {
  return agents.filter((a) => matchesFilter(a.status, tab, showTerminated));
}

function filterOrgTree(nodes: OrgNode[], tab: FilterTab, showTerminated: boolean): OrgNode[] {
  return nodes.reduce<OrgNode[]>((acc, node) => {
    const filteredReports = filterOrgTree(node.reports, tab, showTerminated);
    if (matchesFilter(node.status, tab, showTerminated) || filteredReports.length > 0) {
      acc.push({ ...node, reports: filteredReports });
    }
    return acc;
  }, []);
}

const SWITCHABLE_ADAPTERS = [
  { value: "cursor", label: "Cursor", model: "composer-1.5" },
  { value: "codex_local", label: "Codex (High)", model: "gpt-5.3-codex" },
  { value: "codex_local", label: "Codex (Low)", model: "gpt-5.1-codex-mini" },
  { value: "codex_local", label: "Codex (GPT Mini)", model: "gpt-4.1-mini" },
  { value: "claude_local", label: "Claude", model: undefined },
  { value: "opencode_local", label: "OpenCode", model: undefined },
] as const;

export function Agents() {
  const { selectedCompanyId } = useCompany();
  const { openNewAgent } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile } = useSidebar();
  const queryClient = useQueryClient();
  const pathSegment = location.pathname.split("/").pop() ?? "all";
  const tab: FilterTab = (pathSegment === "all" || pathSegment === "active" || pathSegment === "paused" || pathSegment === "error") ? pathSegment : "all";

  // Roster presentation state (design guide "thin page, uncontrolled
  // roster" — the toolbar mediates all of these).
  const [view, setView] = useState<RosterView>("org");
  const [sort, setSort] = useState<RosterSort>("live");
  const [groupBy, setGroupBy] = useState<RosterGroup>("none");
  const [search, setSearch] = useState("");
  const forceListView = isMobile;
  const effectiveView: RosterView = forceListView && view === "org" ? "list" : view;

  const [showTerminated, setShowTerminated] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [adapterMenuOpen, setAdapterMenuOpen] = useState(false);

  const bulkSwitch = useMutation({
    mutationFn: ({ adapterType, model }: { adapterType: string; model?: string }) =>
      agentsApi.bulkSwitchAdapter(selectedCompanyId!, adapterType, model),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.org(selectedCompanyId!) });
      setAdapterMenuOpen(false);
    },
  });

  const { data: agents, isLoading, error } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: orgTree } = useQuery({
    queryKey: queryKeys.org(selectedCompanyId!),
    queryFn: () => agentsApi.org(selectedCompanyId!),
    enabled: !!selectedCompanyId && effectiveView === "org",
  });

  const { data: runs } = useQuery({
    queryKey: queryKeys.heartbeats(selectedCompanyId!),
    queryFn: () => heartbeatsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 15_000,
  });

  const liveRunByAgent = useMemo(() => {
    const map = new Map<string, { runId: string; liveCount: number }>();
    for (const r of runs ?? []) {
      if (r.status !== "running" && r.status !== "queued") continue;
      const existing = map.get(r.agentId);
      if (existing) {
        existing.liveCount += 1;
        continue;
      }
      map.set(r.agentId, { runId: r.id, liveCount: 1 });
    }
    return map;
  }, [runs]);

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  useEffect(() => {
    setBreadcrumbs([{ label: "Agents" }]);
  }, [setBreadcrumbs]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Bot} message="Select a company to view agents." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  const filtered = filterAgents(agents ?? [], tab, showTerminated);
  const filteredOrg = filterOrgTree(orgTree ?? [], tab, showTerminated);
  const liveCount = filtered.filter((a) => liveRunByAgent.has(a.id)).length;

  return (
    <div className="boared-reveal max-w-[1400px] mx-auto">
      <PageHeader
        kicker={<>§05 · Agents</>}
        title={<>The <em>roster.</em></>}
        dateline={
          filtered.length > 0
            ? `${filtered.length} agent${filtered.length !== 1 ? "s" : ""} on record`
            : "No agents on record"
        }
        actions={
          <Button size="sm" variant="outline" onClick={openNewAgent}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New agent
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
        <Tabs value={tab} onValueChange={(v) => navigate(`/agents/${v}`)}>
          <PageTabBar
            items={[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "paused", label: "Paused" },
              { value: "error", label: "Error" },
            ]}
            value={tab}
            onValueChange={(v) => navigate(`/agents/${v}`)}
          />
        </Tabs>
        <div className="flex items-center gap-2">
          {/* Bulk adapter switch */}
          <div className="relative">
            <button
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 h-8 border border-foreground font-mono text-[0.62rem] uppercase tracking-[0.08em] transition-colors",
                adapterMenuOpen ? "bg-foreground text-background" : "text-foreground hover:bg-foreground hover:text-background"
              )}
              onClick={() => setAdapterMenuOpen(!adapterMenuOpen)}
              disabled={bulkSwitch.isPending}
            >
              <RefreshCw className={cn("h-3 w-3", bulkSwitch.isPending && "animate-spin")} />
              {bulkSwitch.isPending ? "Switching…" : "Switch adapters"}
            </button>
            {adapterMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-56 border border-foreground bg-popover p-1">
                <div className="px-2 py-1 font-mono text-[0.6rem] uppercase tracking-[0.08em] text-muted-foreground">Switch all agents to</div>
                {SWITCHABLE_ADAPTERS.map((adapter) => {
                  const isCurrent = agents?.length && agents.every((a) =>
                    a.adapterType === adapter.value &&
                    (!adapter.model || (a.adapterConfig as Record<string, unknown>)?.model === adapter.model)
                  );
                  return (
                    <button
                      key={adapter.label}
                      className={cn(
                        "flex items-center justify-between w-full px-2 py-1.5 text-[0.78rem] text-left hover:bg-foreground/[0.04] transition-colors",
                        isCurrent && "text-foreground"
                      )}
                      onClick={() => bulkSwitch.mutate({ adapterType: adapter.value, model: adapter.model ?? undefined })}
                      disabled={bulkSwitch.isPending}
                    >
                      <span>{adapter.label}</span>
                      {isCurrent && <span className="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground">Current</span>}
                    </button>
                  );
                })}
                {bulkSwitch.isError && (
                  <div className="px-2 py-1 font-mono text-[0.6rem] text-destructive">
                    {bulkSwitch.error instanceof Error ? bulkSwitch.error.message : "Failed"}
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Filters */}
          <div className="relative">
            <button
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 h-8 border border-foreground font-mono text-[0.62rem] uppercase tracking-[0.08em] transition-colors",
                filtersOpen || showTerminated ? "bg-foreground text-background" : "text-foreground hover:bg-foreground hover:text-background"
              )}
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <SlidersHorizontal className="h-3 w-3" />
              Filters
              {showTerminated && <span className="ml-0.5 px-1 border border-current text-[0.58rem]">1</span>}
            </button>
            {filtersOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-52 border border-foreground bg-popover p-1">
                <button
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-[0.78rem] text-left hover:bg-foreground/[0.04] transition-colors"
                  onClick={() => setShowTerminated(!showTerminated)}
                >
                  <span className={cn(
                    "flex items-center justify-center h-3.5 w-3.5 border border-foreground",
                    showTerminated && "bg-foreground"
                  )}>
                    {showTerminated && <span className="text-background text-[10px] leading-none">&#10003;</span>}
                  </span>
                  Show terminated
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 border border-destructive text-destructive font-mono text-[0.72rem]">
          {error.message}
        </div>
      )}

      {agents && agents.length === 0 && (
        <EmptyState
          icon={Bot}
          message="Create your first agent to get started."
          action="New agent"
          onAction={openNewAgent}
        />
      )}

      {agents && agents.length > 0 && (
        <AgentRosterToolbar
          search={search}
          onSearchChange={setSearch}
          view={effectiveView}
          onViewChange={setView}
          sort={sort}
          onSortChange={setSort}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
          disableOrg={forceListView}
          totalCount={(agents ?? []).length}
          visibleCount={filtered.length}
          liveCount={liveCount}
        />
      )}

      {/* List / grid: AgentRoster takes over presentation */}
      {effectiveView !== "org" && agents && agents.length > 0 && (
        <AgentRoster
          agents={filtered}
          liveRunByAgent={liveRunByAgent}
          view={effectiveView}
          sort={sort}
          groupBy={groupBy}
          search={search}
        />
      )}

      {/* Org chart view — search applied by matching node name/role */}
      {effectiveView === "org" && filteredOrg.length > 0 && (
        <div className="border-t border-[var(--boared-rule)]">
          {filteredOrg
            .filter((n) => matchesOrgSearch(n, search))
            .map((node) => (
              <OrgTreeNode
                key={node.id}
                node={node}
                depth={0}
                agentMap={agentMap}
                liveRunByAgent={liveRunByAgent}
              />
            ))}
        </div>
      )}

      {effectiveView === "org" && orgTree && orgTree.length > 0 && filteredOrg.length === 0 && (
        <p className="font-mono text-[0.72rem] text-muted-foreground text-center py-8">
          No agents match the selected filter.
        </p>
      )}

      {effectiveView === "org" && orgTree && orgTree.length === 0 && (
        <p className="font-mono text-[0.72rem] text-muted-foreground text-center py-8">
          No organizational hierarchy defined.
        </p>
      )}
    </div>
  );
}

function matchesOrgSearch(node: OrgNode, needle: string): boolean {
  if (!needle) return true;
  const n = needle.toLowerCase();
  if (node.name.toLowerCase().includes(n)) return true;
  if (node.role.toLowerCase().includes(n)) return true;
  return node.reports.some((r) => matchesOrgSearch(r, needle));
}

function OrgTreeNode({
  node,
  depth,
  agentMap,
  liveRunByAgent,
}: {
  node: OrgNode;
  depth: number;
  agentMap: Map<string, Agent>;
  liveRunByAgent: Map<string, { runId: string; liveCount: number }>;
}) {
  const agent = agentMap.get(node.id);
  const statusColor = agentStatusDot[node.status] ?? agentStatusDotDefault;

  return (
    <div style={{ paddingLeft: depth * 24 }}>
      <Link
        to={agent ? agentUrl(agent) : `/agents/${node.id}`}
        className="flex items-center gap-3 px-1 py-3 border-b border-[var(--boared-rule)] hover:bg-foreground/[0.03] transition-colors w-full text-left no-underline text-inherit"
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className={`absolute inline-flex h-full w-full ${statusColor}`} />
        </span>
        <div className="flex-1 min-w-0 flex items-baseline gap-3">
          <span className="text-[0.82rem] text-foreground truncate">{node.name}</span>
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground truncate">
            {roleLabels[node.role] ?? node.role}
            {agent?.title ? ` · ${agent.title}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="sm:hidden">
            {liveRunByAgent.has(node.id) ? (
              <LiveRunIndicator
                agentRef={agent ? agentRouteRef(agent) : node.id}
                runId={liveRunByAgent.get(node.id)!.runId}
                liveCount={liveRunByAgent.get(node.id)!.liveCount}
              />
            ) : (
              <StatusBadge status={node.status} />
            )}
          </span>
          <div className="hidden sm:flex items-center gap-4">
            {liveRunByAgent.has(node.id) && (
              <LiveRunIndicator
                agentRef={agent ? agentRouteRef(agent) : node.id}
                runId={liveRunByAgent.get(node.id)!.runId}
                liveCount={liveRunByAgent.get(node.id)!.liveCount}
              />
            )}
            {agent && (
              <>
                <span className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground w-16 text-right">
                  {adapterLabels[agent.adapterType] ?? agent.adapterType}
                </span>
                <span className="font-mono text-[0.62rem] text-muted-foreground w-16 text-right tabular-nums">
                  {agent.lastHeartbeatAt ? relativeTime(agent.lastHeartbeatAt) : "—"}
                </span>
              </>
            )}
            <span className="w-20 flex justify-end">
              <StatusBadge status={node.status} />
            </span>
          </div>
        </div>
      </Link>
      {node.reports && node.reports.length > 0 && (
        <div className="border-l border-[var(--boared-rule)] ml-4">
          {node.reports.map((child) => (
            <OrgTreeNode key={child.id} node={child} depth={depth + 1} agentMap={agentMap} liveRunByAgent={liveRunByAgent} />
          ))}
        </div>
      )}
    </div>
  );
}

function LiveRunIndicator({
  agentRef,
  runId,
  liveCount,
}: {
  agentRef: string;
  runId: string;
  liveCount: number;
}) {
  return (
    <Link
      to={`/agents/${agentRef}/runs/${runId}`}
      className="inline-flex items-center gap-1.5 px-2 h-5 border border-[var(--boared-acid)] text-[var(--boared-acid)] hover:bg-[var(--boared-acid)] hover:text-[var(--boared-acid-ink)] transition-colors no-underline"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full bg-[var(--boared-acid)] opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 bg-[var(--boared-acid)]" />
      </span>
      <span className="font-mono text-[0.58rem] uppercase tracking-[0.08em]">
        Live{liveCount > 1 ? ` (${liveCount})` : ""}
      </span>
    </Link>
  );
}
