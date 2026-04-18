/**
 * BacklogListView — list rendering with optional group-by + reorder
 * (backlog3.0 B2/B3).
 *
 * Reordering support (B3):
 *   - HTML5 drag-and-drop on each row + section container when
 *     `onReorder` is provided.
 *   - Keyboard: j/k move focus; Shift+J/Shift+K reorder the focused row
 *     within its current group.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BacklogItem,
  BacklogItemStatus,
  BacklogPlan,
} from "@paperclipai/shared";
import { groupBy } from "../../lib/groupBy";
import { EmptyState } from "../EmptyState";
import { Inbox as InboxIcon, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import { BacklogItemRow } from "./BacklogItemRow";

export type BacklogGroupBy = "none" | "status" | "source" | "plan";

export interface ReorderMoveArgs {
  id: string;
  destOrdered: BacklogItem[];
  insertIndex: number;
  planId?: string | null;
  status?: BacklogItemStatus;
}

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
  emptyAction?: string;
  onEmptyAction?: () => void;
  onReorder?: (args: ReorderMoveArgs) => void;
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
  onReorder,
}: Props) {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement | null>());

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
    const byKey = groupBy(items, (i) => i.planId ?? "__unplanned");
    const planLookup = new Map<string, string>();
    for (const p of plans ?? []) planLookup.set(p.id, p.title);
    return Object.keys(byKey).map((k) => ({
      key: k,
      label: k === "__unplanned" ? "Unplanned" : planLookup.get(k) ?? k.slice(0, 8),
      items: byKey[k]!,
    }));
  }, [items, plans, groupByMode]);

  const groupContext = useCallback(
    (groupKey: string): { planId?: string | null; status?: BacklogItemStatus } => {
      if (groupByMode === "status") return { status: groupKey as BacklogItemStatus };
      if (groupByMode === "plan") {
        return { planId: groupKey === "__unplanned" ? null : groupKey };
      }
      return {};
    },
    [groupByMode],
  );

  const visibleIds = useMemo(() => {
    const ids: string[] = [];
    for (const g of groups) {
      if (g.label && collapsedGroups.includes(g.key)) continue;
      for (const it of g.items) ids.push(it.id);
    }
    return ids;
  }, [groups, collapsedGroups]);

  const focusRow = useCallback((id: string) => {
    setFocusedId(id);
    const el = rowRefs.current.get(id);
    if (el) el.focus({ preventScroll: false });
  }, []);

  useEffect(() => {
    if (focusedId && !visibleIds.includes(focusedId)) setFocusedId(null);
  }, [focusedId, visibleIds]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLLIElement>, item: BacklogItem, groupKey: string) => {
      if (e.key === "j" && !e.shiftKey) {
        e.preventDefault();
        const idx = visibleIds.indexOf(item.id);
        const next = visibleIds[idx + 1];
        if (next) focusRow(next);
        return;
      }
      if (e.key === "k" && !e.shiftKey) {
        e.preventDefault();
        const idx = visibleIds.indexOf(item.id);
        const prev = visibleIds[idx - 1];
        if (prev) focusRow(prev);
        return;
      }

      if (!onReorder) return;
      const siblings = groups.find((g) => g.key === groupKey)?.items ?? [];
      const currentIndex = siblings.indexOf(item);
      if (currentIndex < 0) return;

      if (e.key === "J" && currentIndex < siblings.length - 1) {
        e.preventDefault();
        const without = siblings.filter((_, i) => i !== currentIndex);
        onReorder({
          id: item.id,
          destOrdered: without,
          insertIndex: currentIndex + 1,
          ...groupContext(groupKey),
        });
      } else if (e.key === "K" && currentIndex > 0) {
        e.preventDefault();
        const without = siblings.filter((_, i) => i !== currentIndex);
        onReorder({
          id: item.id,
          destOrdered: without,
          insertIndex: currentIndex - 1,
          ...groupContext(groupKey),
        });
      }
    },
    [onReorder, groups, visibleIds, focusRow, groupContext],
  );

  const handleDropOnRow = useCallback(
    (e: React.DragEvent<HTMLLIElement>, host: BacklogItem, groupKey: string) => {
      if (!onReorder) return;
      const movingId = e.dataTransfer.getData("text/backlog-item-id");
      if (!movingId || movingId === host.id) return;
      const siblings = groups.find((g) => g.key === groupKey)?.items ?? [];
      const without = siblings.filter((it) => it.id !== movingId);
      const hostIdx = without.findIndex((it) => it.id === host.id);
      onReorder({
        id: movingId,
        destOrdered: without,
        insertIndex: hostIdx < 0 ? without.length : hostIdx,
        ...groupContext(groupKey),
      });
    },
    [onReorder, groups, groupContext],
  );

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

  const renderRow = (item: BacklogItem, groupKey: string) => (
    <BacklogItemRow
      key={item.id}
      item={item}
      rowRef={(el) => {
        rowRefs.current.set(item.id, el);
      }}
      onArchive={() => onArchive(item.id)}
      isArchiving={archivingId === item.id}
      selected={selection?.has(item.id)}
      onToggleSelect={
        onToggleSelect ? () => onToggleSelect(item.id) : undefined
      }
      dragHandle={rowDragHandle?.(item)}
      draggable={!!onReorder}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/backlog-item-id", item.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDropOnRow={(e) => handleDropOnRow(e, item, groupKey)}
      tabIndex={onReorder ? 0 : undefined}
      focused={focusedId === item.id}
      onFocus={() => setFocusedId(item.id)}
      onKeyDown={(e) => handleKeyDown(e, item, groupKey)}
    />
  );

  if (groupByMode === "none") {
    return (
      <ul
        className="divide-y divide-border rounded-md border border-border bg-card"
        onDragOver={(e) => {
          if (onReorder) e.preventDefault();
        }}
        onDrop={(e) => {
          if (!onReorder) return;
          const id = e.dataTransfer.getData("text/backlog-item-id");
          if (!id) return;
          const without = items.filter((it) => it.id !== id);
          onReorder({
            id,
            destOrdered: without,
            insertIndex: without.length,
          });
        }}
      >
        {items.map((item) => renderRow(item, "__all"))}
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
            onDragOver={(e) => {
              if (onReorder) e.preventDefault();
            }}
            onDrop={(e) => {
              if (!onReorder) return;
              const movingId = e.dataTransfer.getData("text/backlog-item-id");
              if (!movingId) return;
              const without = g.items.filter((it) => it.id !== movingId);
              onReorder({
                id: movingId,
                destOrdered: without,
                insertIndex: without.length,
                ...groupContext(g.key),
              });
            }}
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
                {g.items.map((item) => renderRow(item, g.key))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
