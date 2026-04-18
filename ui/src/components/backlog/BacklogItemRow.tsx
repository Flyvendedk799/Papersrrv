/**
 * BacklogItemRow — shared row renderer used by list + plan-grouped views.
 *
 * Kept deliberately simple: a title, status + source chips, body preview,
 * and an archive action. Richer affordances (DnD handles, selection
 * checkboxes, promote action) arrive in later tickets (B3/B4/C3) and will
 * compose around this row via props rather than fork the component.
 */

import { Archive } from "lucide-react";
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
}: BacklogItemRowProps) {
  return (
    <li
      className={cn(
        "flex items-start gap-3 px-4 py-3",
        selected && "bg-[var(--boared-paper-2)]",
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
      {dragHandle}
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
