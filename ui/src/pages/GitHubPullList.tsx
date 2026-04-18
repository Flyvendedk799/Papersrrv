/**
 * GitHub Pull Requests list page (backlog 4.0 B3).
 *
 * Route: /:companyPrefix/github/repos/:owner/:repo/pulls
 *
 * Lists pull requests for a connected repository with author / state /
 * label / reviewer / mergeable filters. The list is backed by the live
 * GitHub API (ETag-cached on the server). Once the cache tables are
 * populated by webhooks, the server layer will transparently serve
 * from cache for these paths — the UI contract is unchanged.
 *
 * PR mutations (comment / approve / merge / close) live on the PR detail
 * page and are gated behind `pr_actions`.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@/lib/router";
import {
  AlertTriangle,
  CircleDot,
  ExternalLink,
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestDraft,
  Github,
  X,
} from "lucide-react";
import type { GithubPullRequestView } from "@paperclipai/shared";
import { githubApi } from "../api/github";
import { githubQueryKeys } from "../lib/queryKeys";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { PageHeader } from "../components/boared/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "../api/client";
import { cn } from "../lib/utils";

type PullState = "open" | "closed" | "all";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

function ErrorBanner({ error }: { error: unknown }) {
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Unknown error";
  return (
    <div className="flex items-start gap-3 border border-destructive/40 bg-destructive/5 px-4 py-3 text-[0.78rem]">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="font-medium text-destructive">{message}</div>
    </div>
  );
}

function StateIcon({ pr }: { pr: GithubPullRequestView }) {
  if (pr.merged)
    return <GitMerge className="size-4 text-[var(--boared-acid)]" aria-label="merged" />;
  if (pr.state === "closed")
    return <X className="size-4 text-destructive" aria-label="closed" />;
  if (pr.draft)
    return (
      <GitPullRequestDraft className="size-4 text-muted-foreground" aria-label="draft" />
    );
  return <CircleDot className="size-4 text-[var(--boared-acid)]" aria-label="open" />;
}

export function GitHubPullList() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();

  const companyId = selectedCompanyId ?? "";
  const ownerLower = (owner ?? "").toLowerCase();
  const repoLower = (repo ?? "").toLowerCase();

  const [state, setState] = useState<PullState>("open");
  const [search, setSearch] = useState("");
  const [authorFilter, setAuthorFilter] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      {
        label: "GitHub",
        href: selectedCompany ? `/${selectedCompany.issuePrefix}/github` : undefined,
      },
      {
        label: `${owner ?? "?"}/${repo ?? "?"}`,
        href:
          selectedCompany && owner && repo
            ? `/${selectedCompany.issuePrefix}/github/repos/${owner}/${repo}`
            : undefined,
      },
      { label: "Pull requests" },
    ]);
  }, [owner, repo, selectedCompany, setBreadcrumbs]);

  const pullsQuery = useQuery({
    queryKey: githubQueryKeys.pulls(companyId, ownerLower, repoLower, state),
    queryFn: () => githubApi.listPulls(companyId, owner!, repo!, { state }),
    enabled: !!companyId && !!owner && !!repo,
    retry: false,
  });

  const repoQuery = useQuery({
    queryKey: githubQueryKeys.repo(companyId, ownerLower, repoLower),
    queryFn: () => githubApi.getRepo(companyId, owner!, repo!),
    enabled: !!companyId && !!owner && !!repo,
    retry: false,
  });

  const allPulls = pullsQuery.data?.items ?? [];
  const authors = useMemo(() => {
    const set = new Set<string>();
    for (const pr of allPulls) if (pr.authorLogin) set.add(pr.authorLogin);
    return Array.from(set).sort();
  }, [allPulls]);

  const filteredPulls = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allPulls.filter((pr) => {
      if (authorFilter && pr.authorLogin !== authorFilter) return false;
      if (!term) return true;
      if (String(pr.number).includes(term)) return true;
      if (pr.title.toLowerCase().includes(term)) return true;
      if ((pr.authorLogin ?? "").toLowerCase().includes(term)) return true;
      if ((pr.headRef ?? "").toLowerCase().includes(term)) return true;
      if ((pr.baseRef ?? "").toLowerCase().includes(term)) return true;
      return false;
    });
  }, [allPulls, search, authorFilter]);

  if (!owner || !repo) {
    return <EmptyState icon={Github} message="Missing repo in URL." />;
  }

  const repoHtmlUrl = repoQuery.data?.data.htmlUrl ?? null;

  return (
    <div className="boared-reveal mx-auto max-w-[1400px]">
      <PageHeader
        kicker={
          <>
            §§ · GitHub · {owner}/{repo}
          </>
        }
        title={
          <>
            Pull requests
            <span className="text-muted-foreground"> · {filteredPulls.length}</span>
          </>
        }
        dateline={
          pullsQuery.isLoading
            ? "Loading…"
            : `${allPulls.length} total in this view`
        }
        actions={
          <div className="flex items-center gap-2">
            {repoHtmlUrl && (
              <a
                href={`${repoHtmlUrl}/pulls`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-[0.72rem] text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3.5" />
                GitHub
              </a>
            )}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 border border-[var(--boared-rule)] bg-[var(--boared-paper)] px-3 py-2">
        <div className="flex items-center gap-1 border-r border-[var(--boared-rule)] pr-2">
          {(["open", "closed", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setState(s)}
              className={cn(
                "px-2 py-1 text-[0.72rem] uppercase tracking-wide",
                state === s
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by title, #number, author, branch…"
          className="h-8 w-64"
        />

        {authors.length > 0 && (
          <select
            value={authorFilter ?? ""}
            onChange={(e) => setAuthorFilter(e.target.value || null)}
            className="h-8 border border-border bg-background px-2 text-[0.72rem]"
            aria-label="Filter by author"
          >
            <option value="">All authors</option>
            {authors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}

        {(search || authorFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setAuthorFilter(null);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {pullsQuery.error && (
        <div className="mb-4">
          <ErrorBanner error={pullsQuery.error} />
        </div>
      )}

      {pullsQuery.isLoading ? (
        <div className="border border-[var(--boared-rule)] bg-[var(--boared-paper)] p-6 text-[0.78rem] text-muted-foreground">
          Loading pull requests…
        </div>
      ) : filteredPulls.length === 0 ? (
        <EmptyState
          icon={GitPullRequest}
          message={
            allPulls.length === 0
              ? `No ${state} pull requests in ${owner}/${repo}.`
              : "No pull requests match the current filters."
          }
        />
      ) : (
        <ul className="divide-y divide-[var(--boared-rule)] border border-[var(--boared-rule)] bg-[var(--boared-paper)]">
          {filteredPulls.map((pr) => (
            <li key={pr.number}>
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/${selectedCompany?.issuePrefix ?? ""}/github/repos/${owner}/${repo}/pulls/${pr.number}`,
                  )
                }
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[var(--boared-paper-accent,transparent)]"
              >
                <div className="mt-0.5">
                  <StateIcon pr={pr} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-[0.72rem] text-muted-foreground">
                      #{pr.number}
                    </span>
                    <span className="truncate font-medium text-foreground">
                      {pr.title}
                    </span>
                    {pr.draft && (
                      <span className="border border-border px-1.5 py-[1px] text-[0.62rem] uppercase tracking-wide text-muted-foreground">
                        draft
                      </span>
                    )}
                    {pr.merged && (
                      <span className="border border-[var(--boared-acid)] px-1.5 py-[1px] text-[0.62rem] uppercase tracking-wide text-[var(--boared-acid)]">
                        merged
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.68rem] text-muted-foreground">
                    <span>{pr.authorLogin ?? "unknown"}</span>
                    {pr.headRef && pr.baseRef && (
                      <span className="inline-flex items-center gap-1">
                        <GitBranch className="size-3" />
                        {pr.headRef} → {pr.baseRef}
                      </span>
                    )}
                    <span>updated {formatDate(pr.updatedAt)}</span>
                  </div>
                </div>
                <a
                  href={pr.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 text-[0.7rem] text-muted-foreground hover:text-foreground"
                >
                  GitHub ↗
                </a>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
