/**
 * SavedViewsMenu (F4) — dropdown to switch between saved filter
 * presets and save the current filters as a new view. Lives in the
 * IssuesList toolbar.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Plus, Star, Trash2 } from "lucide-react";
import type { IssueSavedView, SavedViewFilters } from "@paperclipai/shared";
import { issuesApi } from "../../api/issues";
import { useToast } from "../../context/ToastContext";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "../../lib/utils";

interface Props {
  companyId: string;
  /** Current filter snapshot to save when the user clicks "Save view". */
  currentFilters: SavedViewFilters;
  /** Called when a saved view is selected so the list can apply it. */
  onApply: (view: IssueSavedView) => void;
  /** The id of the currently-applied saved view, if any. */
  activeViewId?: string | null;
  currentSort?: string | null;
  currentGroupBy?: string | null;
  currentViewKind?: "list" | "kanban";
}

export function SavedViewsMenu({
  companyId,
  currentFilters,
  onApply,
  activeViewId,
  currentSort,
  currentGroupBy,
  currentViewKind = "list",
}: Props) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [open, setOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [name, setName] = useState("");
  const [isShared, setIsShared] = useState(false);

  const { data: views } = useQuery({
    queryKey: ["issue-views", companyId],
    queryFn: () => issuesApi.listViews(companyId),
  });

  const create = useMutation({
    mutationFn: () =>
      issuesApi.createView(companyId, {
        name: name.trim(),
        filters: currentFilters,
        sortKey: currentSort ?? null,
        groupBy: currentGroupBy ?? null,
        viewKind: currentViewKind,
        isShared,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issue-views", companyId] });
      setComposeOpen(false);
      setName("");
      pushToast({ tone: "info", title: "View saved" });
    },
    onError: (err) =>
      pushToast({
        tone: "error",
        title: err instanceof Error ? err.message : "Save failed",
      }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => issuesApi.deleteView(companyId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issue-views", companyId] }),
    onError: (err) =>
      pushToast({
        tone: "error",
        title: err instanceof Error ? err.message : "Delete failed",
      }),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] px-2 py-1 rounded hover:bg-accent/50 transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]"
        >
          <Bookmark className="h-3 w-3" aria-hidden="true" />
          Views
          {activeViewId && (
            <span className="text-[var(--boared-acid)]">·</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1 space-y-1">
        {(views ?? []).length === 0 && !composeOpen && (
          <p className="px-2 py-2 font-serif italic text-[0.85rem] text-muted-foreground">
            No saved views yet.
          </p>
        )}
        {(views ?? []).map((v) => (
          <div
            key={v.id}
            className={cn(
              "group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/50",
              v.id === activeViewId && "bg-accent",
            )}
          >
            <button
              type="button"
              onClick={() => {
                onApply(v);
                setOpen(false);
              }}
              className="flex-1 text-left flex items-center gap-2"
            >
              {v.ownerUserId === null ? (
                <Star className="h-3 w-3 text-[var(--boared-acid)]" aria-hidden="true" />
              ) : (
                <Bookmark className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
              )}
              <span className="text-xs truncate">{v.name}</span>
            </button>
            <button
              type="button"
              onClick={() => remove.mutate(v.id)}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
              aria-label="Delete view"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <div className="border-t border-border pt-1">
          {composeOpen ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!name.trim()) return;
                create.mutate();
              }}
              className="space-y-2 p-1"
            >
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="View name (e.g. My open tasks)"
                className="w-full px-2 py-1.5 bg-transparent border border-border rounded text-xs outline-none focus:border-[var(--boared-acid)]"
              />
              <label className="flex items-center gap-2 px-1 text-[0.7rem] text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={isShared}
                  onChange={(e) => setIsShared(e.target.checked)}
                  className="h-3 w-3 accent-[var(--boared-acid)]"
                />
                Share with teammates
              </label>
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  onClick={() => setComposeOpen(false)}
                  className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-muted-foreground px-1.5 py-0.5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={create.isPending || !name.trim()}
                  className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-[var(--boared-acid)] border border-[var(--boared-acid)] px-2 py-0.5 disabled:opacity-50"
                >
                  {create.isPending ? "Saving…" : "Save view"}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setComposeOpen(true)}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              Save current view…
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
