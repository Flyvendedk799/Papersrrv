/**
 * GitHub repo dashboard page (backlog 4.0 B2).
 *
 * Route: /:companyPrefix/github/repos/:owner/:repo
 *
 * Renders a single-screen overview per connected repo, backed by the
 * cached tables (github_repos / github_pull_requests / …) with a live
 * Octokit read as a fallback on cache miss. The live path is already
 * ETag-cached on the server (see server/src/services/github.ts).
 *
 * Panels (backlog 4.0 B2):
 *   - Open PRs (draft / ready split)
 *   - Recent commits on default branch
 *   - Recent releases
 *   - Failing / pending checks
 *   - Branch activity
 *   - Linked project + quick actions
 *
 * The current foundation only wires the open-PRs and repo-overview
 * live reads; the remaining panels render informative empty states
 * until the webhook ingestion back-fills the cache or the companion
 * fetchers in `ui/src/api/github.ts` are extended.
 */

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@/lib/router";
import {
  AlertTriangle,
  ExternalLink,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Github,
  ListChecks,
  Plus,
  Tag,
} from "lucide-react";
import { githubApi } from "../api/github";
import { githubQueryKeys } from "../lib/queryKeys";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { PageHeader } from "../components/boared/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import { ApiError } from "../api/client";
import { cn } from "../lib/utils";

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

function Panel({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-[var(--boared-rule)] bg-[var(--boared-paper)]">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--boared-rule)] px-4 py-2">
        <div className="flex items-center gap-2">
          <Icon className="size-3.5 text-muted-foreground" />
          <h3 className="boared-label text-foreground">{title}</h3>
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function GitHubRepoDashboard() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();

  const companyId = selectedCompanyId ?? "";
  const ownerLower = (owner ?? "").toLowerCase();
  const repoLower = (repo ?? "").toLowerCase();

  useEffect(() => {
    setBreadcrumbs([
      {
        label: "GitHub",
        href: selectedCompany ? `/${selectedCompany.issuePrefix}/github` : undefined,
      },
      { label: `${owner ?? "?"}/${repo ?? "?"}` },
    ]);
  }, [owner, repo, selectedCompany, setBreadcrumbs]);

  const repoQuery = useQuery({
    queryKey: githubQueryKeys.repo(companyId, ownerLower, repoLower),
    queryFn: () => githubApi.getRepo(companyId, owner!, repo!),
    enabled: !!companyId && !!owner && !!repo,
    retry: false,
  });

  const openPullsQuery = useQuery({
    queryKey: githubQueryKeys.pulls(companyId, ownerLower, repoLower, "open"),
    queryFn: () => githubApi.listPulls(companyId, owner!, repo!, { state: "open" }),
    enabled: !!companyId && !!owner && !!repo,
    retry: false,
  });

  const openPulls = openPullsQuery.data?.items ?? [];
  const draftCount = useMemo(
    () => openPulls.filter((p) => p.draft).length,
    [openPulls],
  );
  const readyCount = openPulls.length - draftCount;

  const repoHtmlUrl = repoQuery.data?.data.htmlUrl ?? null;

  if (!owner || !repo) {
    return <EmptyState icon={Github} message="Missing repo in URL." />;
  }

  return (
    <div className="boared-reveal mx-auto max-w-[1400px]">
      <PageHeader
        kicker={<>§§ · GitHub · {owner}/{repo}</>}
        title={
          <>
            {repo}
            <span className="text-muted-foreground"> — at a glance</span>
          </>
        }
        dateline={
          repoQuery.data
            ? `default branch ${repoQuery.data.data.defaultBranch ?? "?"}${
                repoQuery.data.data.archived ? " · archived" : ""
              }`
            : "Loading…"
        }
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigate(
                  `/${selectedCompany?.issuePrefix ?? ""}/github/repos/${owner}/${repo}/pulls`,
                )
              }
            >
              <GitPullRequest className="mr-1.5 size-3.5" />
              Pull requests
            </Button>
            {repoHtmlUrl && (
              <a
                href={repoHtmlUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-[0.72rem] text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3.5" />
                Open in GitHub
              </a>
            )}
          </div>
        }
      />

      {repoQuery.error && (
        <div className="mb-6">
          <ErrorBanner error={repoQuery.error} />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* Open PRs panel */}
        <Panel
          title="Open pull requests"
          icon={GitPullRequest}
          action={
            <a
              href={repoHtmlUrl ? `${repoHtmlUrl}/pulls` : "#"}
              target="_blank"
              rel="noreferrer"
              className="text-[0.7rem] text-muted-foreground hover:text-foreground"
            >
              GitHub ↗
            </a>
          }
        >
          {openPullsQuery.isLoading ? (
            <div className="text-[0.78rem] text-muted-foreground">Loading…</div>
          ) : openPullsQuery.error ? (
            <ErrorBanner error={openPullsQuery.error} />
          ) : openPulls.length === 0 ? (
            <div className="text-[0.78rem] text-muted-foreground">No open PRs.</div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-4 text-[0.72rem]">
                <div>
                  <span className="font-mono text-foreground">{readyCount}</span>
                  <span className="ml-1 text-muted-foreground">ready</span>
                </div>
                <div>
                  <span className="font-mono text-foreground">{draftCount}</span>
                  <span className="ml-1 text-muted-foreground">draft</span>
                </div>
              </div>
              <ul className="divide-y divide-[var(--boared-rule)] border-t border-[var(--boared-rule)]">
                {openPulls.slice(0, 6).map((pr) => (
                  <li key={pr.number} className="flex items-start gap-2 py-2">
                    <span
                      className={cn(
                        "mt-1 inline-block size-2 shrink-0",
                        pr.draft ? "bg-muted-foreground" : "bg-[var(--boared-acid)]",
                      )}
                      aria-hidden
                    />
                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          `/${selectedCompany?.issuePrefix ?? ""}/github/repos/${owner}/${repo}/pulls/${pr.number}`,
                        )
                      }
                      className="flex-1 text-left"
                    >
                      <div className="truncate font-mono text-[0.78rem] text-foreground hover:underline">
                        #{pr.number} · {pr.title}
                      </div>
                      <div className="mt-0.5 text-[0.68rem] text-muted-foreground">
                        {pr.authorLogin ?? "unknown"}
                        {pr.draft ? " · draft" : ""}
                        {pr.baseRef && pr.headRef ? ` · ${pr.headRef} → ${pr.baseRef}` : ""}
                        {` · updated ${formatDate(pr.updatedAt)}`}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              {openPulls.length > 6 && (
                <div className="pt-1 text-right text-[0.7rem]">
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `/${selectedCompany?.issuePrefix ?? ""}/github/repos/${owner}/${repo}/pulls`,
                      )
                    }
                    className="text-muted-foreground hover:text-foreground"
                  >
                    View all {openPulls.length} →
                  </button>
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel title="Recent commits" icon={GitCommit}>
          <div className="text-[0.78rem] text-muted-foreground">
            Recent commits populate once webhook ingestion or the background
            sync writes into <code className="font-mono">github_commits</code>.
          </div>
        </Panel>

        <Panel title="Releases" icon={Tag}>
          <div className="text-[0.78rem] text-muted-foreground">
            Releases populate via the <code className="font-mono">release</code>
            {" "}webhook into <code className="font-mono">github_releases</code>.
          </div>
        </Panel>

        <Panel title="Failing / pending checks" icon={ListChecks}>
          <div className="text-[0.78rem] text-muted-foreground">
            Check runs arrive via the <code className="font-mono">check_run</code>
            {" "}webhook and surface failures here.
          </div>
        </Panel>

        <Panel title="Branch activity" icon={GitBranch}>
          <div className="text-[0.78rem] text-muted-foreground">
            Branches populate from <code className="font-mono">push</code>
            {" "}events. Default branch:{" "}
            <span className="font-mono text-foreground">
              {repoQuery.data?.data.defaultBranch ?? "—"}
            </span>
          </div>
        </Panel>

        <Panel
          title="Quick actions"
          icon={Plus}
          action={null}
        >
          <div className="space-y-2 text-[0.78rem]">
            <a
              href={repoHtmlUrl ? `${repoHtmlUrl}/compare` : "#"}
              target="_blank"
              rel="noreferrer"
              className="block border border-border px-3 py-2 text-foreground hover:border-foreground"
            >
              <div className="font-medium">Create PR</div>
              <div className="text-muted-foreground">Opens compare view on GitHub</div>
            </a>
            <a
              href={repoHtmlUrl ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="block border border-border px-3 py-2 text-foreground hover:border-foreground"
            >
              <div className="font-medium">Open repo in GitHub</div>
              <div className="text-muted-foreground">{repoHtmlUrl ?? "—"}</div>
            </a>
          </div>
        </Panel>
      </div>
    </div>
  );
}
