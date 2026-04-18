/**
 * BulkActionBar — sticky toolbar that appears when one or more backlog
 * items are selected (backlog3.0 B4).
 *
 * The bar exposes patch-style actions (status, priority, plan) plus
 * archive. Promotion to Issue is intentionally not surfaced here; that
 * lands as a deliberate, confirmed action in C3.
 *
 * The component is stateless about the selection itself: parent owns
 * the `Set<string>` and decides what to do with the result. Each
 * action calls the supplied `onApply` with a fully-typed payload, then
 * the parent dispatches to `backlogApi.bulkApply`.
 */

import { useCallback, useState } from "react";
import {
  Archive,
  ChevronDown,
  Loader2,
  X,
} from "lucide-react";
import {
  BACKLOG_ITEM_STATUSES,
  type BacklogBulkAction,
  type BacklogBulkPatch,
  type BacklogItemStatus,
  type BacklogPlan,
  type IssuePriority,
} from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "../../lib/utils";

const PRIORITY_OPTIONS: Array<{ value: IssuePriority | null; label: string }> = [
  { value: null, label: "None" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export interface BulkApplyArgs {
  action: BacklogBulkAction;
  patch?: BacklogBulkPatch;
}

interface Props {
  count: number;
  totalVisible: number;
  isApplying: boolean;
  plans?: BacklogPlan[];
  onApply: (args: BulkApplyArgs) => void;
  onSelectAll: () => void;
  onClear: () => void;
}

export function BulkActionBar({
  count,
  totalVisible,
  isApplying,
  plans,
  onApply,
  onSelectAll,
  onClear,
}: Props) {
  const allSelected = count >= totalVisible && totalVisible > 0;

  const apply = useCallback(
    (patch: BacklogBulkPatch) => {
      onApply({ action: "patch", patch });
    },
    [onApply],
  );

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className={cn(
        "sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-md border border-border bg-card/95 px-3 py-2 shadow-sm backdrop-blur",
        isApplying && "pointer-events-none opacity-80",
      )}
    >
      <span className="text-xs font-medium">
        {count} selected
        {totalVisible > 0 && (
          <span className="ml-1 text-muted-foreground">/ {totalVisible} visible</span>
        )}
      </span>

      {!allSelected && totalVisible > count && (
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onSelectAll}>
          Select all
        </Button>
      )}

      <span className="mx-1 h-4 w-px bg-border" aria-hidden />

      <BulkMenu label="Status" disabled={isApplying}>
        {BACKLOG_ITEM_STATUSES.map((s) => (
          <BulkMenuItem
            key={`status-${s}`}
            onSelect={() => apply({ status: s as BacklogItemStatus })}
          >
            {s}
          </BulkMenuItem>
        ))}
      </BulkMenu>

      <BulkMenu label="Priority" disabled={isApplying}>
        {PRIORITY_OPTIONS.map((opt) => (
          <BulkMenuItem
            key={`priority-${opt.value ?? "none"}`}
            onSelect={() => apply({ priority: opt.value })}
          >
            {opt.label}
          </BulkMenuItem>
        ))}
      </BulkMenu>

      <BulkMenu label="Plan" disabled={isApplying}>
        <BulkMenuItem onSelect={() => apply({ planId: null })}>Unplanned</BulkMenuItem>
        {(plans ?? []).map((p) => (
          <BulkMenuItem key={`plan-${p.id}`} onSelect={() => apply({ planId: p.id })}>
            {p.title}
          </BulkMenuItem>
        ))}
        {(plans ?? []).length === 0 && (
          <div className="px-2 py-1 text-[0.65rem] text-muted-foreground">No plans yet.</div>
        )}
      </BulkMenu>

      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs"
        disabled={isApplying}
        onClick={() => onApply({ action: "archive" })}
      >
        <Archive className="size-3.5" />
        Archive
      </Button>

      <div className="ml-auto flex items-center gap-2">
        {isApplying && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Applying…
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={onClear}
          aria-label="Clear selection"
          disabled={isApplying}
        >
          <X className="size-3.5" />
          Clear
        </Button>
      </div>
    </div>
  );
}

function BulkMenu({
  label,
  disabled,
  children,
}: {
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={disabled}>
          {label}
          <ChevronDown className="ml-1 size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-1">
        {children}
      </PopoverContent>
    </Popover>
  );
}

function BulkMenuItem({
  onSelect,
  children,
}: {
  onSelect: () => void;
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="block w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground disabled:opacity-60"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        try {
          onSelect();
        } finally {
          // Brief disabled state so users don't double-fire while the
          // popover is closing; parent owns the real loading state.
          window.setTimeout(() => setBusy(false), 200);
        }
      }}
    >
      {children}
    </button>
  );
}
