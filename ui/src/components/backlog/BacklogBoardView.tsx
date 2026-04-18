/**
 * BacklogBoardView — kanban-style columns, one per status.
 *
 * Column order mirrors the status lifecycle so the board reads left-to-right
 * as a pipeline: idea → draft → ready → promoted → archived. Archived is
 * collapsed away by default (respects the `includeArchived` filter upstream).
 *
 * Reordering (backlog3.0 B3):
 *   - HTML5 drag-and-drop inside and across columns when `onReorder` is
 *     provided. The callback receives the destination column's ordered
 *     items WITHOUT the moving row and the target insertion index, so the
 *     page layer can resolve prevId/nextId + issue the server call.
 *   - Keyboard: j/k move focus across the whole board, Shift+J/K nudge the
 *     focused row up/down within its column.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BacklogItem, BacklogItemStatus } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { cn } from "../../lib/utils";

const COLUMN_ORDER: BacklogItemStatus[] = ["idea", "draft", "ready", "promoted", "archived"];

export interface BoardReorderArgs {
  status: BacklogItemStatus;
  /** Destination column's items in their post-move order, EXCLUDING the moving row. */
  destOrdered: BacklogItem[];
  /** Index within `destOrdered` where the moving row should land (0..destOrdered.length). */
  insertIndex: number;
}

interface Props {
  items: BacklogItem[];
  selection?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onReorder?: (id: string, args: BoardReorderArgs) => void;
}

export function BacklogBoardView({ items, selection, onToggleSelect, onReorder }: Props) {
  const draggable = !!onReorder;

  const byStatus = useMemo(() => {
    const map = new Map<BacklogItemStatus, BacklogItem[]>();
    for (const col of COLUMN_ORDER) map.set(col, []);
    for (const item of items) {
      const bucket = (COLUMN_ORDER as readonly string[]).includes(item.status)
        ? (item.status as BacklogItemStatus)
        : "idea";
      map.get(bucket)!.push(item);
    }
    return map;
  }, [items]);

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [dragOverRow, setDragOverRow] = useState<{ id: string; pos: "before" | "after" } | null>(
    null,
  );
  const [dragOverEmpty, setDragOverEmpty] = useState<BacklogItemStatus | null>(null);
  const rowRefs = useRef<Map<string, HTMLLIElement | null>>(new Map());

  const focusById = useCallback((id: string | null) => {
    setFocusedId(id);
    if (id) rowRefs.current.get(id)?.focus();
  }, []);

  const moveFocus = useCallback(
    (delta: 1 | -1) => {
      const flat = COLUMN_ORDER.flatMap((c) => byStatus.get(c) ?? []);
      if (!focusedId) {
        const first = flat[0]?.id ?? null;
        if (first) focusById(first);
        return;
      }
      const idx = flat.findIndex((i) => i.id === focusedId);
      if (idx < 0) return;
      const next = flat[idx + delta];
      if (next) focusById(next.id);
    },
    [focusedId, byStatus, focusById],
  );

  const reorderFocused = useCallback(
    (delta: 1 | -1) => {
      if (!focusedId || !onReorder) return;
      const item = items.find((i) => i.id === focusedId);
      if (!item) return;
      const col = (COLUMN_ORDER as readonly string[]).includes(item.status)
        ? (item.status as BacklogItemStatus)
        : "idea";
      const bucket = byStatus.get(col) ?? [];
      const idx = bucket.findIndex((i) => i.id === focusedId);
      const target = idx + delta;
      if (target < 0 || target >= bucket.length) return;
      const destOrdered = bucket.filter((_, i) => i !== idx);
      onReorder(focusedId, { status: col, destOrdered, insertIndex: target });
    },
    [focusedId, items, byStatus, onReorder],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!focusedId) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "j" && !e.shiftKey) {
        e.preventDefault();
        moveFocus(1);
      } else if (e.key === "k" && !e.shiftKey) {
        e.preventDefault();
        moveFocus(-1);
      } else if (e.key === "J" || (e.key === "j" && e.shiftKey)) {
        e.preventDefault();
        reorderFocused(1);
      } else if (e.key === "K" || (e.key === "k" && e.shiftKey)) {
        e.preventDefault();
        reorderFocused(-1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedId, moveFocus, reorderFocused]);

  const handleDropOnRow = (
    col: BacklogItemStatus,
    colItems: BacklogItem[],
    targetItem: BacklogItem,
    pos: "before" | "after",
    movedId: string,
  ) => {
    if (!onReorder || movedId === targetItem.id) return;
    const destOrdered = colItems.filter((i) => i.id !== movedId);
    const anchor = destOrdered.findIndex((i) => i.id === targetItem.id);
    const insertIndex = pos === "before" ? anchor : anchor + 1;
    onReorder(movedId, { status: col, destOrdered, insertIndex });
  };

  return (
    <div className="grid auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
      {COLUMN_ORDER.map((col) => {
        const colItems = byStatus.get(col) ?? [];
        return (
          <div
            key={col}
            className={cn(
              "flex min-h-[240px] flex-col rounded-md border border-border bg-card transition-colors",
              dragOverEmpty === col && "border-[var(--boared-acid)]",
            )}
            onDragOver={(e) => {
              if (!draggable) return;
              if (colItems.length === 0) {
                e.preventDefault();
                setDragOverEmpty(col);
              }
            }}
            onDragLeave={() => setDragOverEmpty(null)}
            onDrop={(e) => {
              if (!draggable) return;
              setDragOverEmpty(null);
              const id = e.dataTransfer.getData("text/backlog-item-id");
              if (!id || colItems.length > 0) return;
              onReorder?.(id, { status: col, destOrdered: [], insertIndex: 0 });
            }}
          >
            <header className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide">{col}</span>
              <span className="font-mono text-[0.65rem] text-muted-foreground">
                {colItems.length}
              </span>
            </header>
            <ul className="flex flex-1 flex-col gap-2 p-2">
              {colItems.map((item, idx) => {
                const indicator = dragOverRow?.id === item.id ? dragOverRow.pos : null;
                return (
                  <li
                    key={item.id}
                    ref={(el) => {
                      rowRefs.current.set(item.id, el);
                    }}
                    tabIndex={0}
                    draggable={draggable}
                    data-backlog-item-id={item.id}
                    aria-label={`${item.title} (${idx + 1} of ${colItems.length} in ${col})`}
                    onFocus={() => setFocusedId(item.id)}
                    onDragStart={(e) => {
                      if (!draggable) return;
                      e.dataTransfer.setData("text/backlog-item-id", item.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      if (!draggable) return;
                      e.preventDefault();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pos =
                        e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                      setDragOverRow({ id: item.id, pos });
                    }}
                    onDragLeave={() => setDragOverRow(null)}
                    onDrop={(e) => {
                      if (!draggable) return;
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/backlog-item-id");
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pos =
                        e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                      setDragOverRow(null);
                      if (id) handleDropOnRow(col, colItems, item, pos, id);
                    }}
                    className={cn(
                      "rounded border border-border bg-background p-2 text-xs outline-none",
                      focusedId === item.id && "ring-1 ring-[var(--boared-acid)]",
                      selection?.has(item.id) &&
                        "border-[var(--boared-acid)] bg-[var(--boared-paper-2)]",
                      indicator === "before" && "shadow-[inset_0_2px_0_0_var(--boared-acid)]",
                      indicator === "after" && "shadow-[inset_0_-2px_0_0_var(--boared-acid)]",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {onToggleSelect && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.title}`}
                          className="mt-0.5 size-3 shrink-0 cursor-pointer"
                          checked={!!selection?.has(item.id)}
                          onChange={() => onToggleSelect(item.id)}
                        />
                      )}
                      <Link
                        to={`/backlog/items/${item.id}`}
                        className="min-w-0 flex-1 text-sm font-medium text-foreground hover:underline"
                      >
                        <span className="line-clamp-2">{item.title}</span>
                      </Link>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[0.6rem] font-mono uppercase tracking-wide text-muted-foreground">
                      <span>{item.source}</span>
                      {item.promotedIssueId && (
                        <span className="text-[var(--boared-acid)]">· promoted</span>
                      )}
                    </div>
                  </li>
                );
              })}
              {colItems.length === 0 && (
                <li className="text-center text-[0.65rem] text-muted-foreground">—</li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
