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
  type BacklogPlan,
  type BulkBacklogItemInput,
  type BulkBacklogItemResult,
  type CreateBacklogPlanInput,
  type UpdateBacklogPlanInput,
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
import { BulkActionBar } from "../components/backlog/BulkActionBar";
import { BacklogInsightsStrip } from "../components/backlog/BacklogInsightsStrip";
import { PlanEditorDialog } from "../components/backlog/PlanEditorDialog";
import { ArchivePlanDialog } from "../components/backlog/ArchivePlanDialog";
import { useToast } from "../context/ToastContext";

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
  const { pushToast } = useToast();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [planFilter, setPlanFilter] = useState<string | null | "all">("all");
  const [ownerFilter, setOwnerFilter] = useState<"all" | "me" | "unowned">(
    "all",
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  // Plans management (D1). `planEditorPlan === null` while creating;
  // set to the plan being edited when opening from the plan manager.
  const [planEditorOpen, setPlanEditorOpen] = useState(false);
  const [planEditorPlan, setPlanEditorPlan] = useState<BacklogPlan | null>(null);
  const [archivePlanTarget, setArchivePlanTarget] =
    useState<BacklogPlan | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selection, setSelection] = useState<Set<string>>(() => new Set());

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

  const filtersKey = `${statusFilter}:${sourceFilter}:${planFilter ?? "null"}:${ownerFilter}:${debouncedSearch}`;

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
        // Ownership (backlog3.0 D4). "me" resolves server-side to the
        // current actor (user → ownerUserId, agent → ownerAgentId).
        // "unowned" matches items with no user AND no agent owner.
        ownerUserId:
          ownerFilter === "me"
            ? "me"
            : ownerFilter === "unowned"
              ? "none"
              : undefined,
        ownerAgentId:
          ownerFilter === "me"
            ? "me"
            : ownerFilter === "unowned"
              ? "none"
              : undefined,
        q: debouncedSearch || undefined,
      }),
    enabled: !!selectedCompanyId,
  });

  const { data: plans } = useQuery({
    queryKey: queryKeys.backlog.plans(selectedCompanyId ?? ""),
    queryFn: () => backlogApi.listPlans(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // Insights strip (B5) reads from a server aggregate so totals stay
  // correct when the user filters the list view (filters apply to
  // /items only). Cheaper than client-side aggregation for large
  // backlogs and keeps the rendering work off the main thread.
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: queryKeys.backlog.overview(selectedCompanyId ?? ""),
    queryFn: () => backlogApi.overview(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const createItem = useMutation({
    mutationFn: (input: {
      title: string;
      body?: string;
      priority?: string | null;
    }) =>
      backlogApi.createItem(selectedCompanyId!, {
        title: input.title,
        body: input.body || undefined,
        priority: input.priority ?? null,
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

  const promoteItem = useMutation({
    mutationFn: (id: string) => backlogApi.promoteItem(selectedCompanyId!, id, {}),
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: ["backlog", selectedCompanyId],
      });
      pushToast({
        title: "Promoted to Issue",
        body: `${result.issue.identifier ?? result.issue.id.slice(0, 8)} · ${result.item.title.slice(0, 80)}`,
        tone: "success",
      });
    },
    onError: (err) => {
      pushToast({
        title: "Promotion failed",
        body: (err as Error).message,
        tone: "error",
      });
    },
  });

  const bulkPromote = useMutation({
    mutationFn: (ids: string[]) => backlogApi.bulkPromote(selectedCompanyId!, { ids }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: ["backlog", selectedCompanyId],
      });
      const tone = result.failed === 0 ? "success" : result.succeeded === 0 ? "error" : "warn";
      const title =
        result.failed === 0
          ? `Promoted ${result.succeeded} item${result.succeeded === 1 ? "" : "s"} to Issues`
          : `${result.succeeded}/${result.total} promoted (${result.failed} failed)`;
      const failureMessage = result.results
        .filter((r) => r.status === "error")
        .slice(0, 3)
        .map((r) => `${r.id.slice(0, 8)}: ${r.error ?? "error"}`)
        .join("; ");
      pushToast({ title, body: failureMessage || undefined, tone });
      if (result.failed === 0) {
        clearSelection();
      } else {
        setSelection(new Set(result.results.filter((r) => r.status === "error").map((r) => r.id)));
      }
    },
    onError: (err) => {
      pushToast({
        title: "Bulk promote failed",
        body: (err as Error).message,
        tone: "error",
      });
    },
  });

  const { moveBetweenContainers } = useBacklogReorder(selectedCompanyId ?? undefined);

  const visibleItems = useMemo(() => items ?? [], [items]);

  // ─── Selection + bulk operations (B4) ───────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelection(new Set()), []);

  const selectAllVisible = useCallback(() => {
    setSelection(new Set(visibleItems.map((i) => i.id)));
  }, [visibleItems]);

  // Drop selection IDs that are no longer in the visible list (e.g. after
  // archive/promotion). Keeps the toolbar truthful.
  useEffect(() => {
    if (selection.size === 0) return;
    const visibleIds = new Set(visibleItems.map((i) => i.id));
    let changed = false;
    const next = new Set<string>();
    for (const id of selection) {
      if (visibleIds.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) setSelection(next);
  }, [visibleItems, selection]);

  // Global keyboard shortcuts for selection-mode triage.
  useEffect(() => {
    function isTypingTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (t.isContentEditable) return true;
      return false;
    }
    function onKey(e: KeyboardEvent) {
      // Cmd/Ctrl+Shift+B opens quick-capture from any focus state
      // (even while typing). Picked over plain "c" because the
      // modifier conveys intent and dodges text-entry collisions.
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        !e.altKey &&
        (e.key === "b" || e.key === "B")
      ) {
        e.preventDefault();
        setDialogOpen(true);
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape" && selection.size > 0) {
        e.preventDefault();
        clearSelection();
      } else if (e.key === "a" && e.shiftKey) {
        // Shift+A — select all visible. Plain "a" is reserved for
        // future "add" shortcut so we don't fire it accidentally.
        e.preventDefault();
        selectAllVisible();
      } else if (e.key === "c" && !e.shiftKey) {
        // "c" = capture. Single-letter shortcut is idiomatic for
        // issue trackers (linear/gh/jira) and safe here because we
        // gate on isTypingTarget above.
        e.preventDefault();
        setDialogOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection.size, clearSelection, selectAllVisible]);

  const bulkApply = useMutation<BulkBacklogItemResult, Error, BulkBacklogItemInput>({
    mutationFn: (input) => backlogApi.bulkApply(selectedCompanyId!, input),
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: ["backlog", selectedCompanyId],
      });
      const tone = result.failed === 0 ? "success" : result.succeeded === 0 ? "error" : "warn";
      const verb = result.action === "archive" ? "archived" : "updated";
      const title =
        result.failed === 0
          ? `${result.succeeded} item${result.succeeded === 1 ? "" : "s"} ${verb}`
          : `${result.succeeded}/${result.total} ${verb} (${result.failed} failed)`;
      const failureMessage = result.results
        .filter((r) => r.status === "error")
        .slice(0, 3)
        .map((r) => `${r.id.slice(0, 8)}: ${r.error ?? "error"}`)
        .join("; ");
      pushToast({
        title,
        body: failureMessage || undefined,
        tone,
      });
      if (result.failed === 0) {
        clearSelection();
      } else {
        // Keep failed IDs selected so the user can retry.
        setSelection(new Set(result.results.filter((r) => r.status === "error").map((r) => r.id)));
      }
    },
    onError: (err) => {
      pushToast({
        title: "Bulk action failed",
        body: err.message,
        tone: "error",
      });
    },
  });

  // ─── Plans CRUD (D1) ────────────────────────────────────────────────
  const invalidatePlans = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.backlog.plans(selectedCompanyId ?? ""),
    });
    // Overview depends on plan membership for progress numbers.
    queryClient.invalidateQueries({
      queryKey: queryKeys.backlog.overview(selectedCompanyId ?? ""),
    });
  }, [queryClient, selectedCompanyId]);

  const createPlan = useMutation({
    mutationFn: (input: CreateBacklogPlanInput) =>
      backlogApi.createPlan(selectedCompanyId!, input),
    onSuccess: (plan) => {
      invalidatePlans();
      setPlanEditorOpen(false);
      setPlanEditorPlan(null);
      pushToast({
        title: "Plan created",
        body: plan.title,
        tone: "success",
      });
    },
    onError: (err) =>
      pushToast({
        title: "Couldn't create plan",
        body: (err as Error).message,
        tone: "error",
      }),
  });

  const updatePlan = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateBacklogPlanInput;
    }) => backlogApi.updatePlan(selectedCompanyId!, id, input),
    onSuccess: (plan) => {
      invalidatePlans();
      setPlanEditorOpen(false);
      setPlanEditorPlan(null);
      pushToast({
        title: "Plan updated",
        body: plan.title,
        tone: "success",
      });
    },
    onError: (err) =>
      pushToast({
        title: "Couldn't update plan",
        body: (err as Error).message,
        tone: "error",
      }),
  });

  /**
   * Archive a plan while preserving its items (D1).
   *
   * Flow: we first move the plan's items to the chosen destination
   * (null = unplanned, or another plan id) via the existing bulk
   * patch endpoint, then archive the plan itself. If the move fails
   * we bail before touching the plan so rank positions aren't
   * orphaned on a ghost plan.
   */
  const archivePlan = useMutation({
    mutationFn: async ({
      plan,
      moveTo,
    }: {
      plan: BacklogPlan;
      moveTo: string | null;
    }) => {
      const planItems = (items ?? []).filter((i) => i.planId === plan.id);
      const movedCount = planItems.length;
      if (movedCount > 0) {
        await backlogApi.bulkApply(selectedCompanyId!, {
          ids: planItems.map((i) => i.id),
          action: "patch",
          patch: { planId: moveTo },
        });
      }
      await backlogApi.archivePlan(selectedCompanyId!, plan.id);
      return { plan, moveTo, movedCount };
    },
    onSuccess: ({ plan, moveTo, movedCount }) => {
      invalidatePlans();
      queryClient.invalidateQueries({
        queryKey: ["backlog", selectedCompanyId],
      });
      setArchivePlanTarget(null);
      if (planFilter === plan.id) setPlanFilter("all");
      pushToast({
        title: `Archived "${plan.title}"`,
        body:
          movedCount > 0
            ? `${movedCount} item${movedCount === 1 ? "" : "s"} moved to ${
                moveTo ? "another plan" : "unplanned"
              }`
            : undefined,
        tone: "success",
      });
    },
    onError: (err) =>
      pushToast({
        title: "Couldn't archive plan",
        body: (err as Error).message,
        tone: "error",
      }),
  });

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

      <BacklogInsightsStrip
        overview={overview}
        isLoading={overviewLoading}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />

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
        <div>
          <div className="mb-1 text-[0.65rem] font-mono uppercase tracking-wide text-muted-foreground">
            Owner
          </div>
          <div className="flex flex-wrap gap-2">
            {(["all", "me", "unowned"] as const).map((o) => (
              <Chip
                key={`owner-${o}`}
                active={ownerFilter === o}
                onClick={() => setOwnerFilter(o)}
              >
                {o}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <div className="text-[0.65rem] font-mono uppercase tracking-wide text-muted-foreground">
              Plan
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => {
                  setPlanEditorPlan(null);
                  setPlanEditorOpen(true);
                }}
                title="Create a new plan"
              >
                <Plus className="size-3" />
                New plan
              </Button>
              {(plans?.length ?? 0) > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      title="Manage plans"
                    >
                      <FolderKanban className="size-3" />
                      Manage
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 p-1">
                    <div className="max-h-80 overflow-y-auto">
                      {(plans ?? []).map((p) => (
                        <div
                          key={p.id}
                          className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent/50"
                        >
                          <span className="flex-1 truncate text-xs">
                            <span className="font-medium">{p.title}</span>
                            <span className="ml-1 text-muted-foreground">
                              {p.kind}
                            </span>
                          </span>
                          <button
                            type="button"
                            className="text-[10px] text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setPlanEditorPlan(p);
                              setPlanEditorOpen(true);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-[10px] text-destructive hover:underline"
                            onClick={() => setArchivePlanTarget(p)}
                          >
                            Archive
                          </button>
                        </div>
                      ))}
                      {(plans ?? []).length === 0 && (
                        <div className="px-2 py-3 text-xs text-muted-foreground">
                          No plans yet.
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
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
      </section>

      {selection.size > 0 && (
        <BulkActionBar
          count={selection.size}
          totalVisible={visibleItems.length}
          isApplying={bulkApply.isPending || bulkPromote.isPending}
          plans={plans}
          onApply={(args) => {
            if (args.action === "promote") {
              bulkPromote.mutate(Array.from(selection));
              return;
            }
            bulkApply.mutate({
              ids: Array.from(selection),
              action: args.action,
              patch: args.patch,
            });
          }}
          onSelectAll={selectAllVisible}
          onClear={clearSelection}
        />
      )}

      {/* From planning — plans transferred from planning-kind issues.
       * Migration 0041 gave backlog_plans a sourceIssueId; we
       * highlight those here so the provenance is visible. */}
      {(() => {
        const fromPlanning = (plans ?? []).filter((p) => p.sourceIssueId);
        if (fromPlanning.length === 0) return null;
        return (
          <section className="border border-[var(--boared-acid)]/30 bg-[var(--boared-acid)]/[0.03] p-3 space-y-2">
            <div className="flex items-baseline gap-2">
              <h3 className="font-mono text-[0.58rem] uppercase tracking-[0.22em] text-[var(--boared-acid)]">
                ✦ From planning
              </h3>
              <span className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
                · {fromPlanning.length} {fromPlanning.length === 1 ? "plan" : "plans"} converged from planning cases
              </span>
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {fromPlanning.slice(0, 9).map((plan) => (
                <li key={plan.id}>
                  <button
                    type="button"
                    onClick={() => updateView({ viewMode: "plans" })}
                    className="w-full text-left p-2 border border-[var(--boared-rule)] bg-[var(--boared-paper)] hover:border-[var(--boared-ink-soft)] transition-colors"
                  >
                    <div className="font-serif italic text-[0.9rem] leading-snug text-[var(--boared-ink)] truncate">
                      {plan.title}
                    </div>
                    <div className="mt-0.5 font-mono text-[0.52rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
                      from planning · {plan.sourceIssueId?.slice(0, 8)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })()}

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
            selection={selection}
            onToggleSelect={toggleSelect}
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
            onPromote={(id) => promoteItem.mutate(id)}
            promotingId={promoteItem.isPending ? (promoteItem.variables as string) : null}
            companyId={selectedCompanyId ?? undefined}
            selection={selection}
            onToggleSelect={toggleSelect}
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
            onPromote={(id) => promoteItem.mutate(id)}
            promotingId={promoteItem.isPending ? (promoteItem.variables as string) : null}
            companyId={selectedCompanyId ?? undefined}
            selection={selection}
            onToggleSelect={toggleSelect}
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

      <PlanEditorDialog
        open={planEditorOpen}
        onOpenChange={(open) => {
          setPlanEditorOpen(open);
          if (!open) setPlanEditorPlan(null);
        }}
        plan={planEditorPlan}
        submitting={createPlan.isPending || updatePlan.isPending}
        error={
          (createPlan.error instanceof Error
            ? createPlan.error.message
            : null) ??
          (updatePlan.error instanceof Error
            ? updatePlan.error.message
            : null)
        }
        onCreate={(input) => createPlan.mutate(input)}
        onUpdate={(id, input) => updatePlan.mutate({ id, input })}
      />

      <ArchivePlanDialog
        open={!!archivePlanTarget}
        onOpenChange={(open) => {
          if (!open) setArchivePlanTarget(null);
        }}
        plan={archivePlanTarget}
        itemCount={
          archivePlanTarget
            ? (items ?? []).filter((i) => i.planId === archivePlanTarget.id).length
            : 0
        }
        otherPlans={(plans ?? []).filter(
          (p) => p.id !== archivePlanTarget?.id && p.status === "active",
        )}
        submitting={archivePlan.isPending}
        error={
          archivePlan.error instanceof Error ? archivePlan.error.message : null
        }
        onConfirm={({ moveTo }) => {
          if (!archivePlanTarget) return;
          archivePlan.mutate({ plan: archivePlanTarget, moveTo });
        }}
      />
    </div>
  );
}

/**
 * Quick-capture templates (backlog3.0 D2).
 *
 * Hardcoded defaults that give the most common capture modes an
 * instant head-start. Per-company customization is intentionally
 * deferred — these cover bug ideas, experiments, and doc tasks
 * which are the three shapes real users consistently ask for.
 * Future tickets can promote this to a server-backed collection
 * without touching the dialog contract.
 */
const QUICK_CAPTURE_TEMPLATES: Array<{
  id: string;
  label: string;
  placeholder: string;
  bodyPrefix: string;
  priority: string;
}> = [
  {
    id: "bug",
    label: "Bug idea",
    placeholder: "Something's off…",
    bodyPrefix: "Expected:\n\nActual:\n\nRepro:\n",
    priority: "high",
  },
  {
    id: "experiment",
    label: "Experiment",
    placeholder: "Let's try…",
    bodyPrefix: "Hypothesis:\n\nMeasurement:\n\nSuccess criteria:\n",
    priority: "medium",
  },
  {
    id: "doc",
    label: "Doc task",
    placeholder: "Document…",
    bodyPrefix: "What to document:\n\nAudience:\n\nOutline:\n",
    priority: "low",
  },
];

const QUICK_CAPTURE_PRIORITIES = ["critical", "high", "medium", "low"] as const;

function NewBacklogItemDialog({
  open,
  onOpenChange,
  onSubmit,
  submitting,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    title: string;
    body?: string;
    priority?: string | null;
  }) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<string | null>(null);
  const [placeholderTitle, setPlaceholderTitle] = useState(
    "What should we capture?",
  );
  const [pasteError, setPasteError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTitle("");
      setBody("");
      setPriority(null);
      setPlaceholderTitle("What should we capture?");
      setPasteError(null);
    }
  }, [open]);

  const applyTemplate = (templateId: string) => {
    const tpl = QUICK_CAPTURE_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    setPriority(tpl.priority);
    setPlaceholderTitle(tpl.placeholder);
    // Only overwrite the body if empty so we don't stomp user input.
    setBody((prev) => (prev.trim() ? prev : tpl.bodyPrefix));
  };

  /**
   * Paste-to-capture: pull clipboard contents into the dialog and
   * split into title/body on the first newline so URLs and
   * multi-line quotes fall into the notes field naturally.
   * The first paste wins — we don't clobber user-typed content.
   */
  const handlePasteFromClipboard = async () => {
    setPasteError(null);
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setPasteError("Clipboard is empty");
        return;
      }
      const firstNewline = text.indexOf("\n");
      const titleCandidate =
        firstNewline === -1 ? text : text.slice(0, firstNewline);
      const bodyCandidate = firstNewline === -1 ? "" : text.slice(firstNewline + 1);
      if (!title.trim()) setTitle(titleCandidate.trim().slice(0, 200));
      if (!body.trim()) setBody(bodyCandidate.trim());
    } catch (err) {
      setPasteError(
        err instanceof Error
          ? err.message
          : "Clipboard access was denied by the browser",
      );
    }
  };

  const handleSubmit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onSubmit({
      title: trimmed,
      body: body.trim() || undefined,
      priority: priority ?? null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quick capture</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Template:
            </span>
            {QUICK_CAPTURE_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t.id)}
                className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
              >
                {t.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void handlePasteFromClipboard()}
              className="ml-auto rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
              title="Paste clipboard contents into the capture form"
            >
              Paste
            </button>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={placeholderTitle}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">
              Priority:
            </label>
            <button
              type="button"
              onClick={() => setPriority(null)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px]",
                priority === null
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              none
            </button>
            {QUICK_CAPTURE_PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px]",
                  priority === p
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Notes (optional)
            </label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add context, links, or acceptance criteria."
              rows={5}
            />
          </div>
          {pasteError && (
            <div className="rounded border border-amber-400/40 bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
              {pasteError}
            </div>
          )}
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
