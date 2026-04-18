/**
 * Backlog page — unified list + board + plan-grouped views (backlog3.0 B1/B2).
 *
 * View modes:
 *   - list  : rows, optionally grouped by status/source/plan.
 *   - board : kanban columns, one per status.
 *   - plans : list grouped by plan.
 *
 * Filtering / search / group-by state is persisted per company in
 * localStorage, mirroring the IssuesList convention.
 *
 * Everything else (DnD, bulk ops, promotion, insights, capture sources)
 * lands in subsequent tickets; each composes on the view components in
 * `ui/src/components/backlog/*`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  List as ListIcon,
  Columns3,
  FolderKanban,
  Search,
  Layers,
} from "lucide-react";
import {
  BACKLOG_ITEM_SOURCES,
  BACKLOG_ITEM_STATUSES,
  type BacklogItemSource,
  type BacklogItemStatus,
} from "@paperclipai/shared";
import { backlogApi } from "../api/backlog";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  BacklogListView,
  type BacklogGroupBy,
} from "../components/backlog/BacklogListView";
import { BacklogBoardView } from "../components/backlog/BacklogBoardView";
import { useBacklogReorder } from "../components/backlog/useBacklogReorder";

type StatusFilter = BacklogItemStatus | "all";
type SourceFilter = BacklogItemSource | "all";
type ViewMode = "list" | "board" | "plans";

const STATUS_FILTERS: StatusFilter[] = ["all", ...BACKLOG_ITEM_STATUSES];
const SOURCE_FILTERS: SourceFilter[] = ["all", ...BACKLOG_ITEM_SOURCES];

type ViewState = {
  viewMode: ViewMode;
  groupBy: BacklogGroupBy;
  collapsedGroups: string[];
};

const DEFAULT_VIEW: ViewState = {
  viewMode: "list",
  groupBy: "none",
  collapsedGroups: [],
};

function loadViewState(key: string): ViewState {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...DEFAULT_VIEW, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_VIEW };
}

function saveViewState(key: string, state: ViewState) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

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
  const [planFilter, setPlanFilter] = useState<string | null | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const scopedKey = selectedCompanyId
    ? `paperclip:backlog-view:${selectedCompanyId}`
    : "paperclip:backlog-view";
  const [viewState, setViewState] = useState<ViewState>(() =>
    loadViewState(scopedKey),
  );
  const prevScopedKey = useRef(scopedKey);
  useEffect(() => {
    if (prevScopedKey.current !== scopedKey) {
      prevScopedKey.current = scopedKey;
      setViewState(loadViewState(scopedKey));
    }
  }, [scopedKey]);

  const updateView = useCallback(
    (patch: Partial<ViewState>) => {
      setViewState((prev) => {
        const next = { ...prev, ...patch };
        saveViewState(scopedKey, next);
        return next;
      });
    },
    [scopedKey],
  );

  useEffect(() => {
    setBreadcrumbs([{ label: "Backlog" }]);
  }, [setBreadcrumbs]);

  // Debounce search for server query.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const filtersKey = `${statusFilter}:${sourceFilter}:${planFilter ?? "null"}:${debouncedSearch}`;

  const { data: items, isLoading, error } = useQuery({
    queryKey: queryKeys.backlog.items(selectedCompanyId ?? "", filtersKey),
    queryFn: () =>
      backlogApi.listItems(selectedCompanyId!, {
        status: statusFilter === "all" ? undefined : statusFilter,
        source: sourceFilter === "all" ? undefined : sourceFilter,
        planId:
          planFilter === "all"
            ? undefined
            : planFilter === null
              ? null
              : planFilter,
        q: debouncedSearch || undefined,
      }),
    enabled: !!selectedCompanyId,
  });

  const { data: plans } = useQuery({
    queryKey: queryKeys.backlog.plans(selectedCompanyId ?? ""),
    queryFn: () => backlogApi.listPlans(selectedCompanyId!),
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

  const { moveBetweenContainers } = useBacklogReorder(selectedCompanyId ?? undefined);

  const visibleItems = useMemo(() => items ?? [], [items]);

  const toggleCollapse = useCallback(
    (groupKey: string) => {
      updateView({
        collapsedGroups: viewState.collapsedGroups.includes(groupKey)
          ? viewState.collapsedGroups.filter((k) => k !== groupKey)
          : [...viewState.collapsedGroups, groupKey],
      });
    },
    [updateView, viewState.collapsedGroups],
  );

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

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center overflow-hidden rounded-md border border-border">
          {(
            [
              ["list", ListIcon, "List"],
              ["board", Columns3, "Board"],
              ["plans", FolderKanban, "Plans"],
            ] as const
          ).map(([mode, Icon, label]) => (
            <button
              key={mode}
              type="button"
              title={`${label} view`}
              onClick={() => updateView({ viewMode: mode })}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs transition-colors",
                viewState.viewMode === mode
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {viewState.viewMode === "list" && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="text-xs">
                <Layers className="mr-1 size-3.5" />
                Group:{" "}
                <span className="ml-1 font-mono lowercase">
                  {viewState.groupBy}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-44 p-1">
              {(
                [
                  ["none", "None"],
                  ["status", "Status"],
                  ["source", "Source"],
                  ["plan", "Plan"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  className={cn(
                    "block w-full rounded px-2 py-1 text-left text-xs",
                    viewState.groupBy === v
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/50",
                  )}
                  onClick={() => updateView({ groupBy: v })}
                >
                  {label}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}

        <div className="relative ml-auto w-48 sm:w-64">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search backlog…"
            className="pl-7 text-xs sm:text-sm"
            aria-label="Search backlog"
          />
        </div>
      </div>

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
        {(plans?.length ?? 0) > 0 && (
          <div>
            <div className="mb-1 text-[0.65rem] font-mono uppercase tracking-wide text-muted-foreground">
              Plan
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip
                active={planFilter === "all"}
                onClick={() => setPlanFilter("all")}
              >
                all
              </Chip>
              <Chip
                active={planFilter === null}
                onClick={() => setPlanFilter(null)}
              >
                unplanned
              </Chip>
              {(plans ?? []).map((p) => (
                <Chip
                  key={p.id}
                  active={planFilter === p.id}
                  onClick={() => setPlanFilter(p.id)}
                >
                  {p.title}
                </Chip>
              ))}
            </div>
          </div>
        )}
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
        ) : viewState.viewMode === "board" ? (
          <BacklogBoardView
            items={visibleItems}
            onReorder={(id, { status, destOrdered, insertIndex }) =>
              moveBetweenContainers(id, destOrdered, insertIndex, { status })
            }
          />
        ) : viewState.viewMode === "plans" ? (
          <BacklogListView
            items={visibleItems}
            plans={plans}
            groupByMode="plan"
            collapsedGroups={viewState.collapsedGroups}
            onToggleCollapse={toggleCollapse}
            onArchive={(id) => archiveItem.mutate(id)}
            archivingId={
              archiveItem.isPending ? (archiveItem.variables as string) : null
            }
            emptyAction="New item"
            onEmptyAction={() => setDialogOpen(true)}
            onReorder={({ id, destOrdered, insertIndex, planId, status }) =>
              moveBetweenContainers(id, destOrdered, insertIndex, { planId, status })
            }
          />
        ) : (
          <BacklogListView
            items={visibleItems}
            plans={plans}
            groupByMode={viewState.groupBy}
            collapsedGroups={viewState.collapsedGroups}
            onToggleCollapse={toggleCollapse}
            onArchive={(id) => archiveItem.mutate(id)}
            archivingId={
              archiveItem.isPending ? (archiveItem.variables as string) : null
            }
            emptyAction="New item"
            onEmptyAction={() => setDialogOpen(true)}
            onReorder={({ id, destOrdered, insertIndex, planId, status }) =>
              moveBetweenContainers(id, destOrdered, insertIndex, { planId, status })
            }
          />
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
