/**
 * BacklogListView — list rendering with optional group-by.
 *
 * Group-by options are handled here so the page component stays
 * view-agnostic. Reordering (DnD + keyboard), bulk selection, and row
 * details are layered via props added in later tickets.
 */

import { useMemo } from "react";
import type { BacklogItem, BacklogPlan } from "@paperclipai/shared";
import { groupBy } from "../../lib/groupBy";
import { EmptyState } from "../EmptyState";
import { Inbox as InboxIcon, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import { BacklogItemRow } from "./BacklogItemRow";

export type BacklogGroupBy = "none" | "status" | "source" | "plan";

interface Props {
  items: BacklogItem[];
  plans?: BacklogPlan[];
  groupByMode: BacklogGroupBy;
  collapsedGroups: string[];
  onToggleCollapse: (groupKey: string) => void;
  onArchive: (id: string) => void;
  archivingId?: string | null;
  selection?: Set<string>;
  onToggleSelect?: (id: string) => void;
  rowDragHandle?: (item: BacklogItem) => React.ReactNode;
  onNewInGroup?: () => void;
  emptyAction?: string;
  onEmptyAction?: () => void;
}

const STATUS_ORDER = ["idea", "draft", "ready", "promoted", "archived"];
const SOURCE_ORDER = ["manual", "chat", "issue", "run", "workflow", "agent"];

export function BacklogListView({
  items,
  plans,
  groupByMode,
  collapsedGroups,
  onToggleCollapse,
  onArchive,
  archivingId,
  selection,
  onToggleSelect,
  rowDragHandle,
  emptyAction,
  onEmptyAction,
}: Props) {
  const groups = useMemo(() => {
    if (groupByMode === "none") {
      return [{ key: "__all", label: null as string | null, items }];
    }
    if (groupByMode === "status") {
      const byKey = groupBy(items, (i) => i.status);
      return STATUS_ORDER.filter((k) => byKey[k]?.length).map((k) => ({
        key: k,
        label: k,
        items: byKey[k]!,
      }));
    }
    if (groupByMode === "source") {
      const byKey = groupBy(items, (i) => i.source);
      return SOURCE_ORDER.filter((k) => byKey[k]?.length).map((k) => ({
        key: k,
        label: k,
        items: byKey[k]!,
      }));
    }
    // plan
    const byKey = groupBy(items, (i) => i.planId ?? "__unplanned");
    const planLookup = new Map<string, string>();
    for (const p of plans ?? []) planLookup.set(p.id, p.title);
    return Object.keys(byKey).map((k) => ({
      key: k,
      label: k === "__unplanned" ? "Unplanned" : planLookup.get(k) ?? k.slice(0, 8),
      items: byKey[k]!,
    }));
  }, [items, plans, groupByMode]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={InboxIcon}
        message="Nothing here yet. Capture plans and drafts here. When they're ready, promote them to Issues."
        action={emptyAction}
        onAction={onEmptyAction}
      />
    );
  }

  if (groupByMode === "none") {
    return (
      <ul className="divide-y divide-border rounded-md border border-border bg-card">
        {items.map((item) => (
          <BacklogItemRow
            key={item.id}
            item={item}
            onArchive={() => onArchive(item.id)}
            isArchiving={archivingId === item.id}
            selected={selection?.has(item.id)}
            onToggleSelect={
              onToggleSelect ? () => onToggleSelect(item.id) : undefined
            }
            dragHandle={rowDragHandle?.(item)}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => {
        const open = !collapsedGroups.includes(g.key);
        return (
          <section
            key={g.key}
            className="rounded-md border border-border bg-card"
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left"
              onClick={() => onToggleCollapse(g.key)}
            >
              <ChevronRight
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground transition-transform",
                  open && "rotate-90",
                )}
              />
              <span className="text-sm font-semibold uppercase tracking-wide">
                {g.label}
              </span>
              <span className="ml-auto font-mono text-[0.65rem] text-muted-foreground">
                {g.items.length}
              </span>
            </button>
            {open && (
              <ul className="divide-y divide-border border-t border-border">
                {g.items.map((item) => (
                  <BacklogItemRow
                    key={item.id}
                    item={item}
                    onArchive={() => onArchive(item.id)}
                    isArchiving={archivingId === item.id}
                    selected={selection?.has(item.id)}
                    onToggleSelect={
                      onToggleSelect ? () => onToggleSelect(item.id) : undefined
                    }
                    dragHandle={rowDragHandle?.(item)}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
