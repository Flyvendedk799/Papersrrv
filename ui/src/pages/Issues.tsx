import { useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "@/lib/router";
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
import { CircleDot, Plus } from "lucide-react";

export function Issues() {
  const { selectedCompanyId } = useCompany();
  const { openNewIssue } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const initialSearch = searchParams.get("q") ?? "";
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

  return (
    <div className="boared-reveal max-w-[1400px] mx-auto pb-32">
      {/* Editorial masthead — asymmetric two-column header. */}
      <header className="grid grid-cols-12 gap-6 pb-8 mb-8 border-b-2 border-foreground">
        <div className="col-span-12 md:col-span-4 flex flex-col justify-end gap-3">
          <div className="boared-label text-foreground">§04 · The Docket</div>
          <div className="font-mono text-[0.7rem] leading-relaxed text-muted-foreground">
            <span className="block">
              {isLoading
                ? "Fetching the wire"
                : `${issueList.length} ${issueList.length === 1 ? "entry on file" : "entries on file"}`}
            </span>
            {liveCount > 0 && (
              <span className="block mt-1 text-foreground">
                <span className="inline-block size-1.5 bg-[var(--boared-acid)] mr-1.5 align-middle" />
                {liveCount} live
              </span>
            )}
          </div>
        </div>
        <div className="col-span-12 md:col-span-8 flex items-start justify-between gap-6">
          <h1 className="boared-display text-[clamp(3rem,7vw,5.25rem)] leading-[0.92] text-foreground">
            On the
            <br />
            <em className="not-italic font-normal">desk.</em>
          </h1>
          <button
            type="button"
            onClick={() => openNewIssue()}
            className="shrink-0 inline-flex items-center gap-2 px-3 h-8 mt-2 border border-foreground text-foreground hover:bg-foreground hover:text-background transition-colors font-mono text-[0.66rem] uppercase tracking-[0.1em]"
          >
            <Plus className="size-3" strokeWidth={2} />
            New issue
          </button>
        </div>
      </header>

      <IssuesList
        issues={issueList}
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
    </div>
  );
}
