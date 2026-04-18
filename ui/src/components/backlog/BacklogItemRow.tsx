/**
 * BacklogItemRow — shared row renderer used by list + plan-grouped views.
 *
 * Kept deliberately simple: a title, status + source chips, body preview,
 * and an archive action. DnD/keyboard affordances are layered via the
 * optional `draggable`, `onDragStart`, `onDropOnRow`, `focused`, etc.
 * props rather than forking the component (B3).
 */

import { Archive, GripVertical } from "lucide-react";
import type { BacklogItem } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { cn } from "../../lib/utils";

export interface BacklogItemRowProps {
  item: BacklogItem;
  onArchive?: () => void;
  isArchiving?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  dragHandle?: React.ReactNode;
  trailing?: React.ReactNode;
  compact?: boolean;
  rowRef?: React.Ref<HTMLLIElement>;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLLIElement>) => void;
  onDropOnRow?: (e: React.DragEvent<HTMLLIElement>) => void;
  tabIndex?: number;
  focused?: boolean;
  onFocus?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLLIElement>) => void;
}

export function BacklogItemRow({
  item,
  onArchive,
  isArchiving,
  selected,
  onToggleSelect,
  dragHandle,
  trailing,
  compact,
  rowRef,
  draggable,
  onDragStart,
  onDropOnRow,
  tabIndex,
  focused,
  onFocus,
  onKeyDown,
}: BacklogItemRowProps) {
  return (
    <li
      ref={rowRef}
      draggable={draggable}
      tabIndex={tabIndex}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onDragStart={onDragStart}
      onDragOver={(e) => {
        if (onDropOnRow) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!onDropOnRow) return;
        e.stopPropagation();
        onDropOnRow(e);
      }}
      className={cn(
        "flex items-start gap-3 px-4 py-3 outline-none",
        selected && "bg-[var(--boared-paper-2)]",
        focused &&
          "outline outline-1 outline-[var(--boared-acid)] outline-offset-[-1px]",
      )}
      data-backlog-item-id={item.id}
    >
      {onToggleSelect && (
        <input
          type="checkbox"
          aria-label={`Select ${item.title}`}
          className="mt-1 size-3.5 shrink-0 cursor-pointer"
          checked={!!selected}
          onChange={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
        />
      )}
      {dragHandle ??
        (draggable && (
          <GripVertical
            aria-hidden
            className="mt-1 size-3.5 shrink-0 cursor-grab text-muted-foreground"
          />
        ))}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            to={`/backlog/items/${item.id}`}
            className="truncate text-sm font-medium text-foreground hover:underline"
          >
            {item.title}
          </Link>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[0.6rem] font-mono uppercase tracking-wide text-muted-foreground">
            {item.status}
          </span>
          <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[0.6rem] font-mono uppercase tracking-wide text-muted-foreground">
            {item.source}
          </span>
          {item.promotedIssueId && (
            <span className="rounded border border-[var(--boared-acid)] px-1.5 py-0.5 text-[0.6rem] font-mono uppercase tracking-wide text-[var(--boared-acid)]">
              promoted
            </span>
          )}
        </div>
        {!compact && item.body && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {item.body}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <time className="block text-[0.6rem] font-mono text-muted-foreground">
          {new Date(item.updatedAt).toLocaleDateString()}
        </time>
        {trailing}
        {onArchive && item.status !== "archived" && (
          <button
            type="button"
            onClick={onArchive}
            disabled={isArchiving}
            className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <Archive className="size-3" />
            {isArchiving ? "Archiving…" : "Archive"}
          </button>
        )}
      </div>
    </li>
  );
}
