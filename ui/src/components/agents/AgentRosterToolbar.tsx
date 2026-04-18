/**
 * AgentRosterToolbar — search, sort, group-by, and view toggle.
 *
 * Lives above the roster and mediates how agents are displayed without
 * changing what agents are in the list (that's the tab filter's job).
 */

import { Search, X, LayoutGrid, List, GitBranch, ArrowDownAZ, Radio, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type RosterView = "list" | "grid" | "org";
export type RosterSort = "live" | "name" | "activity";
export type RosterGroup = "none" | "role" | "status";

export interface AgentRosterToolbarProps {
  search: string;
  onSearchChange: (q: string) => void;
  view: RosterView;
  onViewChange: (v: RosterView) => void;
  sort: RosterSort;
  onSortChange: (s: RosterSort) => void;
  groupBy: RosterGroup;
  onGroupByChange: (g: RosterGroup) => void;
  disableOrg?: boolean;
  totalCount: number;
  visibleCount: number;
  liveCount: number;
}

export function AgentRosterToolbar({
  search,
  onSearchChange,
  view,
  onViewChange,
  sort,
  onSortChange,
  groupBy,
  onGroupByChange,
  disableOrg,
  totalCount,
  visibleCount,
  liveCount,
}: AgentRosterToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <label className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filter by name, role, title…"
          aria-label="Search agents"
          className="pl-7 pr-7 h-8 w-64 max-w-full border border-[var(--boared-rule)] bg-[var(--boared-paper)] font-mono text-[0.7rem] outline-none focus:border-foreground"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Clear"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </label>

      <SegmentedControl
        ariaLabel="Sort order"
        value={sort}
        onChange={onSortChange as (v: string) => void}
        options={[
          { value: "live", label: "Live", icon: Radio, hint: "Live runs first, then recent" },
          { value: "activity", label: "Recent", icon: Clock, hint: "Most recent heartbeat first" },
          { value: "name", label: "Name", icon: ArrowDownAZ, hint: "Alphabetical" },
        ]}
      />

      <SegmentedControl
        ariaLabel="Group by"
        value={groupBy}
        onChange={onGroupByChange as (v: string) => void}
        options={[
          { value: "none", label: "Flat" },
          { value: "role", label: "By role" },
          { value: "status", label: "By status" },
        ]}
      />

      <div className="ml-auto flex items-center gap-3">
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground">
          {visibleCount}/{totalCount}
          {liveCount > 0 && (
            <span className="ml-2 text-[var(--boared-acid)]">· {liveCount} live</span>
          )}
        </span>

        <SegmentedControl
          ariaLabel="View mode"
          value={view}
          onChange={onViewChange as (v: string) => void}
          options={[
            { value: "grid", label: "Grid", icon: LayoutGrid },
            { value: "list", label: "List", icon: List },
            ...(disableOrg ? [] : [{ value: "org", label: "Org", icon: GitBranch } as const]),
          ]}
          iconOnly
        />
      </div>
    </div>
  );
}

function SegmentedControl({
  value,
  onChange,
  options,
  ariaLabel,
  iconOnly,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string; icon?: React.ComponentType<{ className?: string }>; hint?: string }>;
  ariaLabel: string;
  iconOnly?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex border border-[var(--boared-rule)]"
    >
      {options.map((o, i) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.hint ?? o.label}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1 px-2 h-7 font-mono text-[0.6rem] uppercase tracking-[0.08em]",
              i > 0 && "border-l border-[var(--boared-rule)]",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-[var(--boared-paper-2)]",
            )}
          >
            {Icon && <Icon className="h-3 w-3" />}
            {!iconOnly && <span>{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
