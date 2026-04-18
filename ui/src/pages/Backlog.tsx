/**
 * Backlog page — foundational shell (backlog3.0 B1).
 *
 * Foundational scope only:
 *   - Lists backlog items for the selected company.
 *   - Status + source filter chips.
 *   - Empty state + minimal "New item" create dialog.
 *
 * Explicitly deferred (see backlog/backlog3.0-IMPLEMENTATION.md):
 *   - Board view, plan view, grouping
 *   - DnD / keyboard reordering
 *   - Bulk operations, promotion to Issues, reverse flow
 *   - Plans management UX, comments, templates, insights strip
 *   - Papee capture-from-chat and Papee tools
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Archive, Inbox as InboxIcon } from "lucide-react";
import {
  BACKLOG_ITEM_SOURCES,
  BACKLOG_ITEM_STATUSES,
  type BacklogItem,
  type BacklogItemSource,
  type BacklogItemStatus,
} from "@paperclipai/shared";
import { backlogApi } from "../api/backlog";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type StatusFilter = BacklogItemStatus | "all";
type SourceFilter = BacklogItemSource | "all";

const STATUS_FILTERS: StatusFilter[] = ["all", ...BACKLOG_ITEM_STATUSES];
const SOURCE_FILTERS: SourceFilter[] = ["all", ...BACKLOG_ITEM_SOURCES];

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function Backlog() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: "Backlog" }]);
  }, [setBreadcrumbs]);

  const filtersKey = `${statusFilter}:${sourceFilter}`;

  const { data: items, isLoading, error } = useQuery({
    queryKey: queryKeys.backlog.items(selectedCompanyId ?? "", filtersKey),
    queryFn: () =>
      backlogApi.listItems(selectedCompanyId!, {
        status: statusFilter === "all" ? undefined : statusFilter,
        source: sourceFilter === "all" ? undefined : sourceFilter,
      }),
    enabled: !!selectedCompanyId,
  });

  const createItem = useMutation({
    mutationFn: (input: { title: string; body?: string }) =>
      backlogApi.createItem(selectedCompanyId!, {
        title: input.title,
        body: input.body || undefined,
        source: "manual",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["backlog", selectedCompanyId],
      });
      setDialogOpen(false);
    },
  });

  const archiveItem = useMutation({
    mutationFn: (id: string) => backlogApi.archiveItem(selectedCompanyId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["backlog", selectedCompanyId],
      });
    },
  });

  const visibleItems = useMemo(() => items ?? [], [items]);

  if (!selectedCompanyId) {
    return (
      <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">
        Select a company to view its backlog.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold">Backlog</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plans, drafts, and pre-issue ideas. Promote items into Issues when they're ready.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          New item
        </Button>
      </header>

      <section className="flex flex-col gap-3">
        <div>
          <div className="mb-1 text-[0.65rem] font-mono uppercase tracking-wide text-muted-foreground">
            Status
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((s) => (
              <Chip
                key={`status-${s}`}
                active={statusFilter === s}
                onClick={() => setStatusFilter(s)}
              >
                {s}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[0.65rem] font-mono uppercase tracking-wide text-muted-foreground">
            Source
          </div>
          <div className="flex flex-wrap gap-2">
            {SOURCE_FILTERS.map((s) => (
              <Chip
                key={`source-${s}`}
                active={sourceFilter === s}
                onClick={() => setSourceFilter(s)}
              >
                {s}
              </Chip>
            ))}
          </div>
        </div>
      </section>

      <section>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Loading backlog items…
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load backlog:{" "}
            {error instanceof Error ? error.message : "Unknown error"}
          </div>
        ) : visibleItems.length === 0 ? (
          <EmptyState
            icon={InboxIcon}
            message="Nothing here yet. Capture plans and drafts here. When they're ready, promote them to Issues."
            action="New item"
            onAction={() => setDialogOpen(true)}
          />
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-card">
            {visibleItems.map((item) => (
              <BacklogItemRow
                key={item.id}
                item={item}
                onArchive={() => archiveItem.mutate(item.id)}
                isArchiving={archiveItem.isPending && archiveItem.variables === item.id}
              />
            ))}
          </ul>
        )}
      </section>

      <NewBacklogItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={(input) => createItem.mutate(input)}
        submitting={createItem.isPending}
        error={createItem.error instanceof Error ? createItem.error.message : null}
      />
    </div>
  );
}

function BacklogItemRow({
  item,
  onArchive,
  isArchiving,
}: {
  item: BacklogItem;
  onArchive: () => void;
  isArchiving: boolean;
}) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{item.title}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[0.6rem] font-mono uppercase tracking-wide text-muted-foreground">
            {item.status}
          </span>
          <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[0.6rem] font-mono uppercase tracking-wide text-muted-foreground">
            {item.source}
          </span>
        </div>
        {item.body && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {item.body}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <time className="block text-[0.6rem] font-mono text-muted-foreground">
          {new Date(item.updatedAt).toLocaleDateString()}
        </time>
        {item.status !== "archived" && (
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

function NewBacklogItemDialog({
  open,
  onOpenChange,
  onSubmit,
  submitting,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { title: string; body?: string }) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!open) {
      setTitle("");
      setBody("");
    }
  }, [open]);

  const handleSubmit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onSubmit({ title: trimmed, body: body.trim() || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New backlog item</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What should we capture?"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Notes (optional)
            </label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add context, links, or acceptance criteria."
              rows={4}
            />
          </div>
          {error && (
            <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !title.trim()}>
            {submitting ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
