/**
 * BacklogInsightsStrip — top-of-page pulse for the backlog (B5).
 *
 * Reads from the server-side `/backlog/overview` aggregate so counts
 * stay accurate even when the user has filtered the list view (filters
 * apply to `/items` only). Each tile is actionable: clicking sets the
 * page-level status filter; clicking an active tile clears it back to
 * "all".
 *
 * Empty backlog renders a single soft prompt instead of a row of
 * zero-tiles, so a brand-new company doesn't see "0 0 0 0 0".
 */

import { useMemo } from "react";
import {
  Inbox,
  PenLine,
  CheckCircle2,
  Sparkles,
  Archive,
  Hourglass,
  type LucideIcon,
} from "lucide-react";
import {
  type BacklogItemStatus,
  type BacklogOverview,
  type BacklogPlanProgress,
} from "@paperclipai/shared";
import { cn } from "../../lib/utils";

type StatusFilterValue = BacklogItemStatus | "all";

interface Props {
  overview?: BacklogOverview;
  isLoading?: boolean;
  statusFilter: StatusFilterValue;
  onStatusFilterChange: (status: StatusFilterValue) => void;
}

interface Tile {
  key: string;
  label: string;
  hint?: string;
  count: number;
  Icon: LucideIcon;
  filterTo?: StatusFilterValue;
  active?: boolean;
  emphasis?: "default" | "warn";
}

export function BacklogInsightsStrip({
  overview,
  isLoading,
  statusFilter,
  onStatusFilterChange,
}: Props) {
  const tiles: Tile[] = useMemo(() => {
    const counts = overview?.counts ?? {
      idea: 0,
      draft: 0,
      ready: 0,
      promoted: 0,
      archived: 0,
    };
    const recentDays = overview?.recentDays ?? 14;
    const staleDays = overview?.staleDays ?? 14;
    return [
      {
        key: "ideas",
        label: "Ideas",
        Icon: Inbox,
        count: counts.idea,
        filterTo: "idea",
        active: statusFilter === "idea",
      },
      {
        key: "drafts",
        label: "Drafts",
        Icon: PenLine,
        count: counts.draft,
        filterTo: "draft",
        active: statusFilter === "draft",
      },
      {
        key: "ready",
        label: "Ready",
        Icon: CheckCircle2,
        count: counts.ready,
        filterTo: "ready",
        active: statusFilter === "ready",
      },
      {
        key: "promoted",
        label: "Promoted",
        hint: `${overview?.promotedRecent ?? 0} in last ${recentDays}d`,
        Icon: Sparkles,
        count: counts.promoted,
        filterTo: "promoted",
        active: statusFilter === "promoted",
      },
      {
        key: "stalled",
        label: "Stalled",
        hint: `untouched ${staleDays}d+`,
        Icon: Hourglass,
        count: overview?.stale ?? 0,
        emphasis: (overview?.stale ?? 0) > 0 ? "warn" : "default",
      },
      {
        key: "archived",
        label: "Archived",
        Icon: Archive,
        count: counts.archived,
        filterTo: "archived",
        active: statusFilter === "archived",
      },
    ];
  }, [overview, statusFilter]);

  // Skeleton on first load — keeps layout stable so the page doesn't
  // jump when the strip arrives.
  if (isLoading && !overview) {
    return (
      <div
        aria-hidden
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-[58px] rounded-md border border-border bg-card/50"
          />
        ))}
      </div>
    );
  }

  if (overview && overview.total === 0) {
    return (
      <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        Backlog is empty — capture an idea or send something here from a chat,
        Issue, or workflow run.
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Backlog insights"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
    >
      {tiles.map((tile) => {
        const interactive = !!tile.filterTo;
        const Wrapper = interactive ? "button" : "div";
        return (
          <Wrapper
            key={tile.key}
            type={interactive ? "button" : undefined}
            onClick={
              interactive && tile.filterTo
                ? () =>
                    onStatusFilterChange(
                      tile.active ? "all" : (tile.filterTo as StatusFilterValue),
                    )
                : undefined
            }
            className={cn(
              "flex flex-col gap-1 rounded-md border px-3 py-2 text-left transition-colors",
              interactive && "hover:border-foreground/40",
              tile.active
                ? "border-foreground bg-foreground/5"
                : "border-border bg-card",
              tile.emphasis === "warn" &&
                tile.count > 0 &&
                "border-amber-500/50 bg-amber-500/5",
            )}
            aria-pressed={interactive ? tile.active : undefined}
          >
            <div className="flex items-center gap-1.5 text-[0.65rem] font-mono uppercase tracking-wide text-muted-foreground">
              <tile.Icon className="size-3" aria-hidden />
              {tile.label}
            </div>
            <div className="text-xl font-semibold leading-none">
              {tile.count}
            </div>
            {tile.hint && (
              <div className="text-[0.6rem] text-muted-foreground">{tile.hint}</div>
            )}
          </Wrapper>
        );
      })}
      {(overview?.perPlan?.length ?? 0) > 0 && (
        <PlanProgressTiles plans={overview!.perPlan} />
      )}
    </div>
  );
}

function PlanProgressTiles({ plans }: { plans: BacklogPlanProgress[] }) {
  // Top-3 by total items so the strip stays compact.
  return (
    <>
      {plans.slice(0, 3).map((p) => {
        const live = p.total - p.archived;
        const done = p.ready + p.promoted;
        const pct = live === 0 ? 0 : Math.round((done / live) * 100);
        return (
          <div
            key={`plan-${p.planId}`}
            className="col-span-2 flex flex-col gap-1 rounded-md border border-border bg-card px-3 py-2"
          >
            <div className="flex items-center justify-between text-[0.65rem] font-mono uppercase tracking-wide text-muted-foreground">
              <span className="truncate">{p.title}</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
              <div
                className="h-full bg-foreground/70 transition-[width]"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-[0.6rem] text-muted-foreground">
              {done}/{live} ready or promoted
            </div>
          </div>
        );
      })}
    </>
  );
}
