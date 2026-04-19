import { useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { IssuesList } from "../components/IssuesList";
import { IssuesMasthead } from "../components/issues/IssuesMasthead";
import { LeadStory } from "../components/issues/LeadStory";
import { DailyDispatches } from "../components/issues/DailyDispatches";
import { StatusLedger } from "../components/issues/StatusLedger";
import { IssueCloud } from "../components/boared/IssueCloud";
import { CircleDot, Plus, List, Scan } from "lucide-react";
import { cn } from "../lib/utils";

type IssuesView = "list" | "cloud";

export function Issues() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { openNewIssue } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const initialSearch = searchParams.get("q") ?? "";
  const viewParam = searchParams.get("view");
  const view: IssuesView = viewParam === "cloud" ? "cloud" : "list";
  const statusFilter = searchParams.get("status");

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleSearchChange = useCallback((search: string) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmedSearch = search.trim();
      const currentSearch = new URLSearchParams(window.location.search).get("q") ?? "";
      if (currentSearch === trimmedSearch) return;

      const url = new URL(window.location.href);
      if (trimmedSearch) {
        url.searchParams.set("q", trimmedSearch);
      } else {
        url.searchParams.delete("q");
      }

      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState(window.history.state, "", nextUrl);
    }, 300);
  }, []);

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 5000,
  });

  const liveIssueIds = useMemo(() => {
    const ids = new Set<string>();
    for (const run of liveRuns ?? []) {
      if (run.issueId) ids.add(run.issueId);
    }
    return ids;
  }, [liveRuns]);

  useEffect(() => {
    setBreadcrumbs([{ label: "Issues" }]);
  }, [setBreadcrumbs]);

  const { data: issues, isLoading, error } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const updateIssue = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      issuesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
    },
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={CircleDot} message="Select a company to view issues." />;
  }

  const issueList = issues ?? [];
  const liveCount = liveIssueIds.size;

  const cloudIssues = useMemo(() => {
    if (!statusFilter) return issueList;
    return issueList.filter((i) => i.status === statusFilter);
  }, [issueList, statusFilter]);

  return (
    <div className="boared-reveal max-w-[1400px] mx-auto pb-32">
      <IssuesMasthead
        totalEntries={issueList.length}
        liveCount={liveCount}
        rightSlot={
          <div className="flex items-center gap-2">
            {/* View toggle: list / cloud */}
            <div className="flex items-center border border-foreground">
              <button
                className={cn(
                  "p-1.5 transition-colors",
                  view === "list"
                    ? "bg-foreground text-background"
                    : "text-foreground hover:bg-foreground/[0.06]",
                )}
                onClick={() => updateParam("view", null)}
                aria-label="List view"
                title="List view"
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                className={cn(
                  "p-1.5 transition-colors border-l border-foreground",
                  view === "cloud"
                    ? "bg-foreground text-background"
                    : "text-foreground hover:bg-foreground/[0.06]",
                )}
                onClick={() => updateParam("view", "cloud")}
                aria-label="Cloud view"
                title="Point-cloud view"
              >
                <Scan className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => openNewIssue()}
              className="shrink-0 inline-flex items-center gap-2 px-3 h-8 border border-foreground text-foreground hover:bg-foreground hover:text-background transition-colors font-mono text-[0.66rem] uppercase tracking-[0.1em]"
            >
              <Plus className="size-3" strokeWidth={2} />
              New issue
            </button>
          </div>
        }
      />

      {issueList.length > 0 && (
        <>
          <LeadStory issues={issueList} liveIssueIds={liveIssueIds} />
          <DailyDispatches issues={issueList} liveIssueIds={liveIssueIds} />
          <StatusLedger
            issues={issueList}
            activeStatus={statusFilter}
            onFilterStatus={(status) =>
              updateParam("status", statusFilter === status ? null : status)
            }
          />
        </>
      )}

      {view === "list" && (
        <IssuesList
          issues={
            statusFilter
              ? issueList.filter((i) => i.status === statusFilter)
              : issueList
          }
          isLoading={isLoading}
          error={error as Error | null}
          agents={agents}
          liveIssueIds={liveIssueIds}
          viewStateKey="paperclip:issues-view"
          initialAssignees={searchParams.get("assignee") ? [searchParams.get("assignee")!] : undefined}
          initialSearch={initialSearch}
          onSearchChange={handleSearchChange}
          onUpdateIssue={(id, data) => updateIssue.mutate({ id, data })}
        />
      )}

      {view === "cloud" && (
        <IssueCloud
          issues={cloudIssues}
          agents={agents}
          liveIssueIds={liveIssueIds}
          search={initialSearch}
          className="min-h-[640px] border border-[var(--boared-rule)]"
          onSelectIssue={(issue) => {
            if (!selectedCompany) return;
            navigate(
              `/${selectedCompany.issuePrefix}/issues/${issue.identifier ?? issue.id}`,
            );
          }}
        />
      )}
    </div>
  );
}
