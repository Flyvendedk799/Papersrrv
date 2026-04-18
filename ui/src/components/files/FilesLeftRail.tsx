/**
 * FilesLeftRail — scope switcher + search + tree in one coherent rail.
 *
 * Absorbs the existing "scope tabs → project chips / agent pills →
 * filter row → tree" cascade into a single focused column. The rail
 * is keyboard-driveable: slash focuses search, J/K moves through the
 * tree, Enter opens the file in the Reader.
 *
 * The rail is purely a navigator; all data-heavy views happen in the
 * center or inspector, keeping paint cost low.
 */

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Briefcase,
  Bot,
  Sparkles,
  Layers,
  X,
  Check,
} from "lucide-react";
import type { Agent, FileTreeNode, FileScope } from "@paperclipai/shared";
import { filesApi } from "@/api/files";
import { agentsApi } from "@/api/agents";
import { projectsApi } from "@/api/projects";
import { queryKeys } from "@/lib/queryKeys";
import { fileIconFor } from "./fileIcons";
import { cn } from "@/lib/utils";
import { agentStatusDot, agentStatusDotDefault } from "@/lib/status-colors";
import { timeAgo } from "@/lib/timeAgo";

export type LeftRailScope = FileScope | "artifacts" | "projects" | "agents";

const SCOPES: Array<{ id: LeftRailScope; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }> = [
  { id: "projects", label: "Projects", icon: Briefcase, hint: "by project" },
  { id: "agents", label: "Agents", icon: Bot, hint: "by agent / run" },
  { id: "general", label: "General", icon: Sparkles, hint: "standards, handbooks" },
  { id: "artifacts", label: "Artifacts", icon: Layers, hint: "workflow outputs" },
];

export interface FilesLeftRailProps {
  companyId: string;
  scope: LeftRailScope;
  onScopeChange: (scope: LeftRailScope) => void;
  selectedProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  agentFilter: string | null;
  onAgentFilter: (id: string | null) => void;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  search: string;
  onSearchChange: (q: string) => void;
  className?: string;
}

export function FilesLeftRail({
  companyId,
  scope,
  onScopeChange,
  selectedProjectId,
  onSelectProject,
  agentFilter,
  onAgentFilter,
  selectedPath,
  onSelectFile,
  search,
  onSearchChange,
  className,
}: FilesLeftRailProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: tree } = useQuery({
    queryKey: [...queryKeys.files.tree(companyId), agentFilter],
    queryFn: () => filesApi.tree(companyId, agentFilter ?? undefined),
    enabled: !!companyId,
  });

  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: projects = [] } = useQuery({
    queryKey: queryKeys.projects.list(companyId),
    queryFn: () => projectsApi.list(companyId),
    enabled: !!companyId && scope === "projects",
  });

  const filteredTree = useMemo(() => {
    if (!tree || !search.trim()) return tree;
    return filterTree(tree, search.trim().toLowerCase());
  }, [tree, search]);

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-[var(--boared-rule)] bg-[var(--boared-paper-2)] min-h-0",
        className,
      )}
      aria-label="Files navigation"
    >
      <div className="border-b border-[var(--boared-rule)] p-2 space-y-2">
        <div role="tablist" aria-label="File scope" className="grid grid-cols-4 gap-1">
          {SCOPES.map((s) => {
            const Icon = s.icon;
            const active = scope === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onScopeChange(s.id)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-sm border text-[0.55rem] font-mono uppercase tracking-[0.08em]",
                  active
                    ? "border-foreground text-foreground bg-[var(--boared-paper)]"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-[var(--boared-rule)]",
                )}
                title={s.hint}
              >
                <Icon className="h-3.5 w-3.5" />
                {s.label}
              </button>
            );
          })}
        </div>

        <label className="relative block">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search files…  (Cmd+P for quick open)"
            aria-label="Search files by path"
            className="w-full pl-7 pr-7 py-1.5 text-xs bg-[var(--boared-paper)] border border-[var(--boared-rule)] rounded-sm outline-none focus:border-foreground font-mono"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </label>
      </div>

      {scope === "projects" && projects.length > 0 && (
        <div className="border-b border-[var(--boared-rule)] px-2 py-2">
          <div className="font-mono text-[0.55rem] uppercase tracking-[0.08em] text-muted-foreground mb-1">
            Project
          </div>
          <div className="flex flex-wrap gap-1">
            <ScopeChip
              active={selectedProjectId === null}
              onClick={() => onSelectProject(null)}
              label="All projects"
            />
            {projects.map((p) => (
              <ScopeChip
                key={p.id}
                active={selectedProjectId === p.id}
                onClick={() => onSelectProject(p.id)}
                label={p.name}
                dotColor={p.color ?? undefined}
              />
            ))}
          </div>
        </div>
      )}

      {scope === "agents" && agents.length > 0 && (
        <AgentScopePicker
          agents={agents}
          selectedId={agentFilter}
          onSelect={onAgentFilter}
        />
      )}

      <div className="flex-1 min-h-0 overflow-auto py-1">
        {!tree ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">Loading…</div>
        ) : !filteredTree || filteredTree.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground italic">
            No files match.
          </div>
        ) : (
          <div>
            {filteredTree.map((node) => (
              <TreeItem
                key={node.path}
                node={node}
                depth={0}
                selectedPath={selectedPath}
                onSelect={onSelectFile}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

/**
 * Dense, searchable, grouped agent picker.
 *
 * Avoids the "40 pills in a cloud" antipattern by:
 *  • showing current selection as a single chip with Clear action,
 *  • offering local fuzzy search over name/role/title,
 *  • surfacing "live" agents first (running/active), then
 *    grouping the rest by role with sticky headers,
 *  • capping its height and scrolling internally so the file
 *    tree below stays visible.
 */
function AgentScopePicker({
  agents,
  selectedId,
  onSelect,
}: {
  agents: Agent[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [open, setOpen] = useState<boolean>(selectedId === null);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => (selectedId ? agents.find((a) => a.id === selectedId) ?? null : null),
    [agents, selectedId],
  );

  const needle = q.trim().toLowerCase();

  const { live, grouped, totalMatches } = useMemo(() => {
    const matches = agents.filter((a) => matchesAgent(a, needle));
    const live: Agent[] = [];
    const rest: Agent[] = [];
    for (const a of matches) {
      if (a.status === "running" || a.status === "active") live.push(a);
      else rest.push(a);
    }
    live.sort(byRecent);
    rest.sort(byName);
    const grouped = new Map<string, Agent[]>();
    for (const a of rest) {
      const key = a.role || "other";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(a);
    }
    return { live, grouped, totalMatches: matches.length };
  }, [agents, needle]);

  const liveCount = useMemo(
    () => agents.filter((a) => a.status === "running" || a.status === "active").length,
    [agents],
  );

  return (
    <div className="border-b border-[var(--boared-rule)] px-2 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="font-mono text-[0.55rem] uppercase tracking-[0.08em] text-muted-foreground">
          Agent scope
        </div>
        <div className="font-mono text-[0.55rem] text-muted-foreground">
          {liveCount > 0 ? `${liveCount} live / ` : ""}
          {agents.length} total
        </div>
      </div>

      {selected ? (
        <div className="flex items-center gap-1.5">
          <div className="flex-1 min-w-0 flex items-center gap-1.5 border border-foreground rounded-sm bg-[var(--boared-paper)] px-2 py-1">
            <StatusDot status={selected.status} />
            <span className="text-[12px] truncate">{selected.name}</span>
            {selected.title && (
              <span className="text-[0.6rem] text-muted-foreground truncate hidden sm:inline">
                · {selected.title}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              setOpen(true);
              queueMicrotask(() => inputRef.current?.focus());
            }}
            className="text-[0.6rem] font-mono uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground px-1.5 py-1 border border-[var(--boared-rule)] rounded-sm"
            title="Clear agent filter"
          >
            Clear
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 border border-[var(--boared-rule)] rounded-sm px-2 py-1 text-[12px] hover:border-foreground"
        >
          <span className="text-muted-foreground">All agents</span>
          <span className="font-mono text-[0.55rem] text-muted-foreground">
            {open ? "hide" : "pick"}
          </span>
        </button>
      )}

      {(open || !selected) && (
        <div className="space-y-1.5">
          <label className="relative block">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <input
              ref={inputRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter agents…"
              aria-label="Filter agents"
              className="w-full pl-7 pr-7 py-1 text-xs bg-[var(--boared-paper)] border border-[var(--boared-rule)] rounded-sm outline-none focus:border-foreground font-mono"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="Clear filter"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </label>

          <div className="max-h-[32vh] overflow-auto border border-[var(--boared-rule)] rounded-sm bg-[var(--boared-paper)]">
            <AgentScopeRow
              active={selectedId === null}
              onClick={() => onSelect(null)}
              left={<span className="h-2 w-2 rounded-full bg-muted-foreground/40" />}
              name="All agents"
              meta={`${agents.length}`}
            />

            {live.length > 0 && (
              <>
                <GroupHeader label={`Live · ${live.length}`} />
                {live.map((a) => (
                  <AgentRow
                    key={a.id}
                    agent={a}
                    active={selectedId === a.id}
                    onClick={() => onSelect(a.id)}
                  />
                ))}
              </>
            )}

            {Array.from(grouped.entries()).map(([role, list]) => (
              <div key={role}>
                <GroupHeader label={`${prettyRole(role)} · ${list.length}`} />
                {list.map((a) => (
                  <AgentRow
                    key={a.id}
                    agent={a}
                    active={selectedId === a.id}
                    onClick={() => onSelect(a.id)}
                  />
                ))}
              </div>
            ))}

            {totalMatches === 0 && (
              <div className="px-2 py-3 text-center text-[11px] text-muted-foreground italic">
                No agents match "{q}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn("h-1.5 w-1.5 rounded-full shrink-0", agentStatusDot[status] ?? agentStatusDotDefault)}
      aria-hidden="true"
    />
  );
}

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-10 bg-[var(--boared-paper-2)]/95 backdrop-blur-sm border-y border-[var(--boared-rule)] px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.08em] text-muted-foreground">
      {label}
    </div>
  );
}

function AgentRow({
  agent,
  active,
  onClick,
}: {
  agent: Agent;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <AgentScopeRow
      active={active}
      onClick={onClick}
      left={<StatusDot status={agent.status} />}
      name={agent.name}
      subtitle={agent.title ?? undefined}
      meta={agent.lastHeartbeatAt ? timeAgo(agent.lastHeartbeatAt) : undefined}
    />
  );
}

function AgentScopeRow({
  active,
  onClick,
  left,
  name,
  subtitle,
  meta,
}: {
  active: boolean;
  onClick: () => void;
  left: React.ReactNode;
  name: string;
  subtitle?: string;
  meta?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group flex items-center gap-1.5 w-full px-2 py-1 text-left text-[12px] border-b border-[var(--boared-rule)]/50 last:border-b-0",
        active ? "bg-accent/60 text-foreground" : "hover:bg-accent/40",
      )}
    >
      <span className="shrink-0">{left}</span>
      <span className="flex-1 min-w-0 truncate">{name}</span>
      {subtitle && (
        <span className="hidden md:inline text-[0.6rem] text-muted-foreground truncate max-w-[80px]">
          {subtitle}
        </span>
      )}
      {meta && (
        <span className="font-mono text-[0.55rem] text-muted-foreground shrink-0">{meta}</span>
      )}
      {active && <Check className="h-3 w-3 text-foreground shrink-0" />}
    </button>
  );
}

function matchesAgent(a: Agent, needle: string): boolean {
  if (!needle) return true;
  return (
    a.name.toLowerCase().includes(needle) ||
    (a.title ?? "").toLowerCase().includes(needle) ||
    a.role.toLowerCase().includes(needle)
  );
}

function byName(a: Agent, b: Agent): number {
  return a.name.localeCompare(b.name);
}

function byRecent(a: Agent, b: Agent): number {
  const ta = a.lastHeartbeatAt ? new Date(a.lastHeartbeatAt).getTime() : 0;
  const tb = b.lastHeartbeatAt ? new Date(b.lastHeartbeatAt).getTime() : 0;
  if (tb !== ta) return tb - ta;
  return a.name.localeCompare(b.name);
}

function prettyRole(role: string): string {
  if (!role) return "Other";
  return role
    .split(/[_-]/)
    .map((p) => (p.length === 0 ? p : p[0]!.toUpperCase() + p.slice(1)))
    .join(" ");
}

function ScopeChip({
  active,
  onClick,
  label,
  dotColor,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  dotColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 border rounded-full px-2 py-0.5 text-[0.62rem] font-mono",
        active
          ? "border-foreground text-foreground bg-[var(--boared-paper)]"
          : "border-[var(--boared-rule)] text-muted-foreground hover:text-foreground",
      )}
    >
      {dotColor && (
        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
      )}
      <span className="truncate max-w-[130px]">{label}</span>
    </button>
  );
}

function TreeItem({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: FileTreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);

  if (node.type === "directory") {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 w-full px-2 py-1 text-[12px] hover:bg-accent/50 transition-colors"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
          {expanded ? (
            <FolderOpen className="h-3.5 w-3.5 text-foreground shrink-0" />
          ) : (
            <Folder className="h-3.5 w-3.5 text-foreground shrink-0" />
          )}
          <span className="truncate">{node.name}</span>
          {node.children && (
            <span className="ml-auto font-mono text-[0.55rem] text-muted-foreground">
              {node.children.length}
            </span>
          )}
        </button>
        {expanded && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const Icon = fileIconFor(node.path);
  const selected = selectedPath === node.path;

  return (
    <button
      type="button"
      onClick={() => onSelect(node.path)}
      className={cn(
        "flex items-center gap-1.5 w-full px-2 py-1 text-[12px] group text-left",
        selected ? "bg-accent/70 text-foreground" : "hover:bg-accent/50",
      )}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
      aria-current={selected ? "true" : undefined}
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="truncate">{node.name}</span>
      {node.lastAgent && (
        <span className="ml-auto text-[0.55rem] font-mono text-muted-foreground opacity-0 group-hover:opacity-100 truncate max-w-[80px]">
          {node.lastAgent}
        </span>
      )}
    </button>
  );
}

function filterTree(nodes: FileTreeNode[], term: string): FileTreeNode[] {
  const out: FileTreeNode[] = [];
  for (const n of nodes) {
    if (n.type === "directory") {
      const children = n.children ? filterTree(n.children, term) : [];
      if (children.length > 0 || n.name.toLowerCase().includes(term)) {
        out.push({ ...n, children });
      }
    } else if (n.name.toLowerCase().includes(term) || n.path.toLowerCase().includes(term)) {
      out.push(n);
    }
  }
  return out;
}
