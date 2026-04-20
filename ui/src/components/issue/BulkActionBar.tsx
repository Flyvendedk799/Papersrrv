/**
 * BulkActionBar (F3) — sticky action bar shown when one or more
 * issues are selected. Drives bulk mutations through
 * issuesApi.bulkUpdate and invalidates the issue list on success.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  CheckCircle2,
  CircleDot,
  Flame,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";
import type {
  BulkIssueUpdate,
  IssuePriority,
  IssueStatus,
} from "@paperclipai/shared";
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from "@paperclipai/shared";
import { issuesApi } from "../../api/issues";
import { queryKeys } from "../../lib/queryKeys";
import { useToast } from "../../context/ToastContext";
import { cn } from "../../lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Props {
  companyId: string;
  selectedIds: string[];
  onClear: () => void;
}

export function BulkActionBar({ companyId, selectedIds, onClear }: Props) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [menu, setMenu] = useState<"status" | "priority" | null>(null);

  const bulk = useMutation({
    mutationFn: (body: BulkIssueUpdate) => issuesApi.bulkUpdate(companyId, body),
    onSuccess: (res) => {
      pushToast({
        tone: "info",
        title: `${res.updated} ${res.updated === 1 ? "issue" : "issues"} updated`,
      });
      qc.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
      onClear();
    },
    onError: (err) =>
      pushToast({
        tone: "error",
        title: err instanceof Error ? err.message : "Bulk update failed",
      }),
  });

  if (selectedIds.length === 0) return null;

  return (
    <div className="sticky top-0 z-30 flex items-center gap-2 px-3 py-2 bg-[var(--boared-ink)] text-[var(--boared-paper)] border-b border-[var(--boared-acid)]">
      <span className="font-mono text-[0.62rem] uppercase tracking-[0.18em]">
        {selectedIds.length} selected
      </span>
      <div className="h-4 w-px bg-[var(--boared-paper)]/40" />

      <Popover open={menu === "status"} onOpenChange={(v) => setMenu(v ? "status" : null)}>
        <PopoverTrigger asChild>
          <BulkButton icon={CircleDot} label="Status" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-40 p-1">
          {(ISSUE_STATUSES as readonly IssueStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() =>
                bulk.mutate({ ids: selectedIds, op: "set_status", status: s })
              }
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50"
            >
              {s}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <Popover open={menu === "priority"} onOpenChange={(v) => setMenu(v ? "priority" : null)}>
        <PopoverTrigger asChild>
          <BulkButton icon={Flame} label="Priority" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-40 p-1">
          {(ISSUE_PRIORITIES as readonly IssuePriority[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() =>
                bulk.mutate({ ids: selectedIds, op: "set_priority", priority: p })
              }
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50"
            >
              {p}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <BulkButton
        icon={UserIcon}
        label="Unassign"
        onClick={() =>
          bulk.mutate({
            ids: selectedIds,
            op: "set_assignee_agent",
            assigneeAgentId: null,
          })
        }
      />

      <BulkButton
        icon={CheckCircle2}
        label="Mark done"
        onClick={() =>
          bulk.mutate({ ids: selectedIds, op: "set_status", status: "done" })
        }
      />

      <BulkButton
        icon={Archive}
        label="Archive"
        onClick={() => bulk.mutate({ ids: selectedIds, op: "archive" })}
      />

      <BulkButton
        icon={Trash2}
        label="Delete"
        danger
        onClick={() => {
          if (
            confirm(
              `Delete ${selectedIds.length} ${selectedIds.length === 1 ? "issue" : "issues"}? This cannot be undone.`,
            )
          ) {
            bulk.mutate({ ids: selectedIds, op: "delete" });
          }
        }}
      />

      <div className="flex-1" />

      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center gap-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-[var(--boared-paper)]/70 hover:text-[var(--boared-paper)] focus:outline-none"
      >
        <X className="h-3 w-3" aria-hidden="true" /> Clear
      </button>
    </div>
  );
}

const BulkButton = React.forwardRef<
  HTMLButtonElement,
  {
    icon: typeof X;
    label: string;
    onClick?: () => void;
    danger?: boolean;
  }
>(function BulkButton({ icon: Icon, label, onClick, danger }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] px-2 py-1 rounded border border-transparent hover:border-[var(--boared-paper)]/40 focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]",
        danger && "hover:border-[var(--boared-acid)] hover:text-[var(--boared-acid)]",
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </button>
  );
});

import React from "react";
