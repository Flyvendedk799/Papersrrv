/**
 * BacklogInsightsStrip — top-of-page pulse for the backlog (B5).
 *
 * Shows status counts, recent promotion velocity, and a stalled-items
 * highlight so the user can triage at a glance. Each tile is
 * actionable: clicking filters the list to the matching slice. The
 * strip works against an unfiltered, archive-inclusive snapshot so the
 * numbers stay stable even when the user has applied filters below.
 *
 * Empty backlog renders a single soft prompt instead of zero-tiles, so
 * a brand-new company doesn't see a row of "0"s.
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
  type BacklogItem,
  type BacklogItemStatus,
  type BacklogPlan,
} from "@paperclipai/shared";
import { cn } from "../../lib/utils";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_PROMOTION_WINDOW_DAYS = 7;
const STALLED_THRESHOLD_DAYS = 14;

type StatusFilterValue = BacklogItemStatus | "all";

interface Props {
  items: BacklogItem[];
  plans?: BacklogPlan[];
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
  items,
  plans,
  statusFilter,
  onStatusFilterChange,
}: Props) {
  const stats = useMemo(() => {
    const byStatus: Record<BacklogItemStatus, number> = {
      idea: 0,
      draft: 0,
      ready: 0,
      promoted: 0,
      archived: 0,
    };
    let recentPromotions = 0;
    let stalled = 0;
    const now = Date.now();
    const recentCutoff = now - RECENT_PROMOTION_WINDOW_DAYS * ONE_DAY_MS;
    const stalledCutoff = now - STALLED_THRESHOLD_DAYS * ONE_DAY_MS;

    for (const it of items) {
      byStatus[it.status] += 1;
      const updated = Date.parse(it.updatedAt);
      if (it.status === "promoted" && updated >= recentCutoff) {
        recentPromotions += 1;
      }
      // Stalled: live (non-terminal) items untouched for the threshold.
      if (
        (it.status === "idea" || it.status === "draft" || it.status === "ready") &&
        updated < stalledCutoff
      ) {
        stalled += 1;
      }
    }

    const totalLive = byStatus.idea + byStatus.draft + byStatus.ready;
    return { byStatus, recentPromotions, stalled, totalLive };
  }, [items]);

  const tiles: Tile[] = useMemo(() => {
    return [
      {
        key: "ideas",
        label: "Ideas",
        Icon: Inbox,
        count: stats.byStatus.idea,
        filterTo: "idea",
        active: statusFilter === "idea",
      },
      {
        key: "drafts",
        label: "Drafts",
        Icon: PenLine,
        count: stats.byStatus.draft,
        filterTo: "draft",
        active: statusFilter === "draft",
      },
      {
        key: "ready",
        label: "Ready",
        Icon: CheckCircle2,
        count: stats.byStatus.ready,
        filterTo: "ready",
        active: statusFilter === "ready",
      },
      {
        key: "promoted",
        label: "Promoted",
        hint: `${stats.recentPromotions} in last ${RECENT_PROMOTION_WINDOW_DAYS}d`,
        Icon: Sparkles,
        count: stats.byStatus.promoted,
        filterTo: "promoted",
        active: statusFilter === "promoted",
      },
      {
        key: "stalled",
        label: "Stalled",
        hint: `untouched ${STALLED_THRESHOLD_DAYS}d+`,
        Icon: Hourglass,
        count: stats.stalled,
        emphasis: stats.stalled > 0 ? "warn" : "default",
      },
      {
        key: "archived",
        label: "Archived",
        Icon: Archive,
        count: stats.byStatus.archived,
        filterTo: "archived",
        active: statusFilter === "archived",
      },
    ];
  }, [stats, statusFilter]);

  if (items.length === 0) {
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
      {plans && plans.length > 0 && (
        <PlanProgressTiles items={items} plans={plans} />
      )}
    </div>
  );
}

function PlanProgressTiles({
  items,
  plans,
}: {
  items: BacklogItem[];
  plans: BacklogPlan[];
}) {
  // Per-plan progress = (ready + promoted) / live items.
  // "Live" excludes archived because archived items shouldn't drag down
  // a plan's progress. Promotions count toward done.
  return (
    <>
      {plans.slice(0, 3).map((p) => {
        const planItems = items.filter((i) => i.planId === p.id && i.status !== "archived");
        const done = planItems.filter(
          (i) => i.status === "ready" || i.status === "promoted",
        ).length;
        const total = planItems.length;
        const pct = total === 0 ? 0 : Math.round((done / total) * 100);
        return (
          <div
            key={`plan-${p.id}`}
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
              {done}/{total} ready or promoted
            </div>
          </div>
        );
      })}
    </>
  );
}
