/**
 * BacklogBoardView — kanban-style columns, one per status.
 *
 * Column order mirrors the status lifecycle so the board reads left-to-right
 * as a pipeline: idea → draft → ready → promoted → archived. Archived is
 * collapsed away by default (respects the `includeArchived` filter upstream).
 */

import type { BacklogItem } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { cn } from "../../lib/utils";

const COLUMN_ORDER = ["idea", "draft", "ready", "promoted", "archived"] as const;

interface Props {
  items: BacklogItem[];
  onStatusChange?: (id: string, status: (typeof COLUMN_ORDER)[number]) => void;
  selection?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onItemDrop?: (id: string, toStatus: (typeof COLUMN_ORDER)[number]) => void;
  draggableItems?: boolean;
}

export function BacklogBoardView({
  items,
  selection,
  onToggleSelect,
  onItemDrop,
  draggableItems,
}: Props) {
  const byStatus = new Map<string, BacklogItem[]>();
  for (const col of COLUMN_ORDER) byStatus.set(col, []);
  for (const item of items) {
    const arr = byStatus.get(item.status) ?? [];
    arr.push(item);
    byStatus.set(item.status, arr);
  }

  return (
    <div className="grid auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
      {COLUMN_ORDER.map((col) => {
        const colItems = byStatus.get(col) ?? [];
        return (
          <div
            key={col}
            className="flex min-h-[240px] flex-col rounded-md border border-border bg-card"
            onDragOver={(e) => {
              if (onItemDrop) e.preventDefault();
            }}
            onDrop={(e) => {
              if (!onItemDrop) return;
              const id = e.dataTransfer.getData("text/backlog-item-id");
              if (id) onItemDrop(id, col);
            }}
          >
            <header className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide">
                {col}
              </span>
              <span className="font-mono text-[0.65rem] text-muted-foreground">
                {colItems.length}
              </span>
            </header>
            <ul className="flex flex-1 flex-col gap-2 p-2">
              {colItems.map((item) => (
                <li
                  key={item.id}
                  draggable={draggableItems}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/backlog-item-id", item.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  className={cn(
                    "rounded border border-border bg-background p-2 text-xs",
                    selection?.has(item.id) && "border-[var(--boared-acid)] bg-[var(--boared-paper-2)]",
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
              ))}
              {colItems.length === 0 && (
                <li className="text-center text-[0.65rem] text-muted-foreground">
                  —
                </li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
