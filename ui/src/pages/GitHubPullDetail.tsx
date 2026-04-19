/**
 * GitHub Pull Request detail page (backlog 4.0 B3).
 *
 * Route: /:companyPrefix/github/repos/:owner/:repo/pulls/:number
 *
 * Shows the merged view of a pull request:
 *   - Summary: title, state, author, branches, timestamps, stats
 *   - Reviews (approvals / requested-changes / comments)
 *   - Check runs for the head sha
 *   - Changed files
 *
 * Mutations (comment / approve / merge / mark ready) are gated behind
 * the `pr_actions` feature flag both in the UI and on the server.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@/lib/router";
import {
  AlertTriangle,
  Check,
  CircleDot,
  ExternalLink,
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestDraft,
  Github,
  MessageCircle,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import type {
  GithubCheckRunView,
  GithubPullRequestDetailView,
  GithubPullRequestFileView,
  GithubReviewView,
} from "@paperclipai/shared";
import { githubApi } from "../api/github";
import { githubQueryKeys } from "../lib/queryKeys";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { isFeatureEnabled } from "../lib/featureFlags";
import { PageHeader } from "../components/boared/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

function StateBadge({ pr }: { pr: GithubPullRequestDetailView }) {
  if (pr.merged) {
    return (
      <span className="inline-flex items-center gap-1.5 border border-[var(--boared-acid)] px-2 py-0.5 text-[0.7rem] uppercase tracking-wide text-[var(--boared-acid)]">
        <GitMerge className="size-3.5" />
        merged
      </span>
    );
  }
  if (pr.state === "closed") {
    return (
      <span className="inline-flex items-center gap-1.5 border border-destructive px-2 py-0.5 text-[0.7rem] uppercase tracking-wide text-destructive">
        <X className="size-3.5" />
        closed
      </span>
    );
  }
  if (pr.draft) {
    return (
      <span className="inline-flex items-center gap-1.5 border border-border px-2 py-0.5 text-[0.7rem] uppercase tracking-wide text-muted-foreground">
        <GitPullRequestDraft className="size-3.5" />
        draft
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 border border-[var(--boared-acid)] px-2 py-0.5 text-[0.7rem] uppercase tracking-wide text-[var(--boared-acid)]">
      <CircleDot className="size-3.5" />
      open
    </span>
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

function ChecksPanel({ items }: { items: GithubCheckRunView[] }) {
  if (items.length === 0) {
    return (
      <div className="text-[0.78rem] text-muted-foreground">
        No check runs reported for the head commit.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-[var(--boared-rule)]">
      {items.map((c) => {
        const failing =
          c.conclusion === "failure" ||
          c.conclusion === "timed_out" ||
          c.conclusion === "action_required";
        const pending = c.status !== "completed";
        return (
          <li key={c.id} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <div className="truncate font-mono text-[0.78rem] text-foreground">
                {c.name}
              </div>
              <div className="mt-0.5 text-[0.68rem] text-muted-foreground">
                {c.status}
                {c.conclusion ? ` · ${c.conclusion}` : ""}
                {c.startedAt ? ` · ${formatDate(c.startedAt)}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-block size-2 shrink-0",
                  failing
                    ? "bg-destructive"
                    : pending
                      ? "bg-muted-foreground"
                      : "bg-[var(--boared-acid)]",
                )}
                aria-hidden
              />
              {c.htmlUrl && (
                <a
                  href={c.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[0.68rem] text-muted-foreground hover:text-foreground"
                >
                  ↗
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ReviewsPanel({ items }: { items: GithubReviewView[] }) {
  if (items.length === 0) {
    return (
      <div className="text-[0.78rem] text-muted-foreground">No reviews yet.</div>
    );
  }
  return (
    <ul className="divide-y divide-[var(--boared-rule)]">
      {items.map((r) => {
        const approved = r.state === "APPROVED";
        const changesRequested = r.state === "CHANGES_REQUESTED";
        return (
          <li key={r.id} className="flex items-start gap-3 py-2">
            <div
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center border",
                approved
                  ? "border-[var(--boared-acid)] text-[var(--boared-acid)]"
                  : changesRequested
                    ? "border-destructive text-destructive"
                    : "border-border text-muted-foreground",
              )}
              aria-hidden
            >
              {approved ? (
                <ThumbsUp className="size-3" />
              ) : changesRequested ? (
                <ThumbsDown className="size-3" />
              ) : (
                <MessageCircle className="size-3" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[0.78rem] text-foreground">
                <span className="font-mono">{r.reviewerLogin ?? "unknown"}</span>
                <span className="ml-2 text-muted-foreground">
                  {r.state.toLowerCase().replaceAll("_", " ")}
                </span>
              </div>
              {r.body && (
                <div className="mt-1 whitespace-pre-wrap text-[0.72rem] text-muted-foreground">
                  {r.body}
                </div>
              )}
              <div className="mt-0.5 text-[0.62rem] text-muted-foreground">
                {formatDate(r.submittedAt)}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function FilesPanel({ items }: { items: GithubPullRequestFileView[] }) {
  if (items.length === 0) {
    return (
      <div className="text-[0.78rem] text-muted-foreground">
        No file changes reported.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-[var(--boared-rule)]">
      {items.slice(0, 50).map((f) => (
        <li key={f.filename} className="flex items-start gap-3 py-2">
          <span
            className={cn(
              "mt-1 inline-block size-2 shrink-0",
              f.status === "added"
                ? "bg-[var(--boared-acid)]"
                : f.status === "removed"
                  ? "bg-destructive"
                  : "bg-muted-foreground",
            )}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-[0.72rem] text-foreground">
              {f.filename}
            </div>
            <div className="mt-0.5 text-[0.62rem] text-muted-foreground">
              {f.status} · +{f.additions} / -{f.deletions}
            </div>
          </div>
          {f.blobUrl && (
            <a
              href={f.blobUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-[0.68rem] text-muted-foreground hover:text-foreground"
            >
              ↗
            </a>
          )}
        </li>
      ))}
      {items.length > 50 && (
        <li className="py-2 text-[0.68rem] text-muted-foreground">
          + {items.length - 50} more files…
        </li>
      )}
    </ul>
  );
}

function ActionsPanel({
  companyId,
  owner,
  repo,
  number,
  pr,
  onChanged,
}: {
  companyId: string;
  owner: string;
  repo: string;
  number: number;
  pr: GithubPullRequestDetailView;
  onChanged: () => void;
}) {
  const prActionsEnabled = isFeatureEnabled("pr_actions");
  const { pushToast } = useToast();
  const [commentBody, setCommentBody] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [mergeMethod, setMergeMethod] = useState<"merge" | "squash" | "rebase">(
    "squash",
  );

  const commentMutation = useMutation({
    mutationFn: (body: string) =>
      githubApi.createPullComment(companyId, owner, repo, number, { body }),
    onSuccess: () => {
      pushToast({ title: "Comment posted", tone: "success" });
      setCommentBody("");
      onChanged();
    },
    onError: (err) => {
      pushToast({
        title: "Failed to post comment",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: (input: {
      event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
      body?: string;
    }) =>
      githubApi.createPullReview(companyId, owner, repo, number, {
        event: input.event,
        body: input.body,
      }),
    onSuccess: (_res, variables) => {
      pushToast({
        title:
          variables.event === "APPROVE"
            ? "Approved"
            : variables.event === "REQUEST_CHANGES"
              ? "Changes requested"
              : "Review comment submitted",
        tone: "success",
      });
      setReviewBody("");
      onChanged();
    },
    onError: (err) => {
      pushToast({
        title: "Failed to submit review",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  const mergeMutation = useMutation({
    mutationFn: () =>
      githubApi.mergePullRequest(companyId, owner, repo, number, {
        method: mergeMethod,
      }),
    onSuccess: (res) => {
      pushToast({
        title: res.merged ? "Merged" : "Merge request submitted",
        body: res.sha ? `sha ${res.sha.slice(0, 7)}` : undefined,
        tone: res.merged ? "success" : "info",
      });
      onChanged();
    },
    onError: (err) => {
      pushToast({
        title: "Merge failed",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  const readyMutation = useMutation({
    mutationFn: () => githubApi.markPullReady(companyId, owner, repo, number),
    onSuccess: () => {
      pushToast({ title: "Marked ready for review", tone: "success" });
      onChanged();
    },
    onError: (err) => {
      pushToast({
        title: "Could not mark ready",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  if (!prActionsEnabled) {
    return (
      <div className="text-[0.78rem] text-muted-foreground">
        PR actions are disabled on this instance.
        <div className="mt-1 text-[0.68rem]">
          Enable the <code className="font-mono">pr_actions</code> feature flag
          (server + UI) to post comments, submit reviews, and merge PRs.
        </div>
      </div>
    );
  }

  const canMerge =
    !pr.merged && pr.state === "open" && !pr.draft && (pr.mergeable ?? true);

  return (
    <div className="space-y-5">
      <div>
        <div className="boared-label mb-1 text-muted-foreground">Add comment</div>
        <Textarea
          value={commentBody}
          onChange={(e) => setCommentBody(e.target.value)}
          rows={3}
          placeholder="Leave a comment on this PR…"
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            disabled={!commentBody.trim() || commentMutation.isPending}
            onClick={() => commentMutation.mutate(commentBody.trim())}
          >
            <MessageCircle className="mr-1.5 size-3.5" />
            Comment
          </Button>
        </div>
      </div>

      <div>
        <div className="boared-label mb-1 text-muted-foreground">
          Submit review
        </div>
        <Textarea
          value={reviewBody}
          onChange={(e) => setReviewBody(e.target.value)}
          rows={3}
          placeholder="Optional review message…"
        />
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={reviewMutation.isPending}
            onClick={() =>
              reviewMutation.mutate({
                event: "COMMENT",
                body: reviewBody.trim() || undefined,
              })
            }
          >
            Comment
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={reviewMutation.isPending}
            onClick={() =>
              reviewMutation.mutate({
                event: "REQUEST_CHANGES",
                body: reviewBody.trim() || undefined,
              })
            }
          >
            <ThumbsDown className="mr-1.5 size-3.5" />
            Request changes
          </Button>
          <Button
            size="sm"
            disabled={reviewMutation.isPending}
            onClick={() =>
              reviewMutation.mutate({
                event: "APPROVE",
                body: reviewBody.trim() || undefined,
              })
            }
          >
            <ThumbsUp className="mr-1.5 size-3.5" />
            Approve
          </Button>
        </div>
      </div>

      <div>
        <div className="boared-label mb-1 text-muted-foreground">Merge</div>
        {pr.merged ? (
          <div className="text-[0.78rem] text-muted-foreground">
            Already merged {pr.mergedAt ? `on ${formatDate(pr.mergedAt)}` : ""}.
          </div>
        ) : pr.state === "closed" ? (
          <div className="text-[0.78rem] text-muted-foreground">
            Pull request is closed; reopen on GitHub to merge.
          </div>
        ) : pr.draft ? (
          <div className="space-y-2">
            <div className="text-[0.78rem] text-muted-foreground">
              This PR is still a draft.
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={readyMutation.isPending}
              onClick={() => readyMutation.mutate()}
            >
              Mark ready for review
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={mergeMethod}
              onChange={(e) =>
                setMergeMethod(e.target.value as "merge" | "squash" | "rebase")
              }
              className="h-8 border border-border bg-background px-2 text-[0.72rem]"
            >
              <option value="merge">Create merge commit</option>
              <option value="squash">Squash &amp; merge</option>
              <option value="rebase">Rebase &amp; merge</option>
            </select>
            <Button
              size="sm"
              disabled={!canMerge || mergeMutation.isPending}
              onClick={() => mergeMutation.mutate()}
            >
              <Check className="mr-1.5 size-3.5" />
              Merge PR
            </Button>
            {pr.mergeable === false && (
              <span className="text-[0.68rem] text-destructive">
                Not mergeable (conflicts)
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function GitHubPullDetail() {
  const { owner, repo, number: numberStr } = useParams<{
    owner: string;
    repo: string;
    number: string;
  }>();
  const number = Number(numberStr);
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  const companyId = selectedCompanyId ?? "";
  const ownerLower = (owner ?? "").toLowerCase();
  const repoLower = (repo ?? "").toLowerCase();

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
      {
        label: "Pull requests",
        href:
          selectedCompany && owner && repo
            ? `/${selectedCompany.issuePrefix}/github/repos/${owner}/${repo}/pulls`
            : undefined,
      },
      { label: `#${Number.isFinite(number) ? number : "?"}` },
    ]);
  }, [owner, repo, number, selectedCompany, setBreadcrumbs]);

  const detailQuery = useQuery({
    queryKey: githubQueryKeys.pullDetail(companyId, ownerLower, repoLower, number),
    queryFn: () => githubApi.getPullRequest(companyId, owner!, repo!, number),
    enabled: !!companyId && !!owner && !!repo && Number.isFinite(number) && number > 0,
    retry: false,
  });

  if (!owner || !repo || !Number.isFinite(number) || number <= 0) {
    return <EmptyState icon={Github} message="Invalid PR URL." />;
  }

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: githubQueryKeys.pullDetail(companyId, ownerLower, repoLower, number),
    });
    queryClient.invalidateQueries({
      queryKey: githubQueryKeys.pulls(companyId, ownerLower, repoLower, "open"),
    });
    queryClient.invalidateQueries({
      queryKey: githubQueryKeys.pulls(companyId, ownerLower, repoLower, "all"),
    });
  };

  const pr = detailQuery.data?.data;
  const files = detailQuery.data?.files ?? [];
  const reviews = detailQuery.data?.reviews ?? [];
  const checks = detailQuery.data?.checks ?? [];

  return (
    <div className="boared-reveal mx-auto max-w-[1400px]">
      <PageHeader
        kicker={
          <>
            §§ · GitHub · {owner}/{repo}
          </>
        }
        title={
          pr ? (
            <>
              <span className="text-muted-foreground">#{pr.number}</span>{" "}
              {pr.title}
            </>
          ) : (
            <>Loading…</>
          )
        }
        dateline={
          pr ? (
            <>
              by {pr.authorLogin ?? "unknown"} · updated {formatDate(pr.updatedAt)}
            </>
          ) : (
            "Fetching pull request…"
          )
        }
        actions={
          pr ? (
            <div className="flex items-center gap-2">
              <StateBadge pr={pr} />
              <a
                href={pr.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-[0.72rem] text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3.5" />
                GitHub
              </a>
            </div>
          ) : null
        }
      />

      {detailQuery.error && (
        <div className="mb-4">
          <ErrorBanner error={detailQuery.error} />
        </div>
      )}

      {detailQuery.isLoading && (
        <div className="border border-[var(--boared-rule)] bg-[var(--boared-paper)] p-6 text-[0.78rem] text-muted-foreground">
          Loading…
        </div>
      )}

      {pr && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <Panel title="Summary" icon={GitPullRequest}>
              <dl className="grid grid-cols-2 gap-y-2 text-[0.78rem]">
                <dt className="text-muted-foreground">Author</dt>
                <dd className="font-mono">{pr.authorLogin ?? "unknown"}</dd>
                <dt className="text-muted-foreground">Branches</dt>
                <dd className="inline-flex items-center gap-1 font-mono">
                  <GitBranch className="size-3" />
                  {pr.headRef ?? "?"} → {pr.baseRef ?? "?"}
                </dd>
                <dt className="text-muted-foreground">Stats</dt>
                <dd className="font-mono">
                  {pr.commits} commits · +{pr.additions} / -{pr.deletions}
                  {" · "}
                  {pr.changedFiles} files
                </dd>
                <dt className="text-muted-foreground">Labels</dt>
                <dd className="flex flex-wrap gap-1">
                  {pr.labels.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    pr.labels.map((l) => (
                      <span
                        key={l}
                        className="border border-border px-1.5 py-[1px] text-[0.62rem]"
                      >
                        {l}
                      </span>
                    ))
                  )}
                </dd>
                <dt className="text-muted-foreground">Assignees</dt>
                <dd className="font-mono">
                  {pr.assignees.length === 0 ? "—" : pr.assignees.join(", ")}
                </dd>
                <dt className="text-muted-foreground">Reviewers</dt>
                <dd className="font-mono">
                  {pr.requestedReviewers.length === 0
                    ? "—"
                    : pr.requestedReviewers.join(", ")}
                </dd>
                <dt className="text-muted-foreground">Created</dt>
                <dd>{formatDate(pr.createdAt)}</dd>
                <dt className="text-muted-foreground">Updated</dt>
                <dd>{formatDate(pr.updatedAt)}</dd>
                {pr.mergedAt && (
                  <>
                    <dt className="text-muted-foreground">Merged</dt>
                    <dd>{formatDate(pr.mergedAt)}</dd>
                  </>
                )}
                {pr.closedAt && !pr.mergedAt && (
                  <>
                    <dt className="text-muted-foreground">Closed</dt>
                    <dd>{formatDate(pr.closedAt)}</dd>
                  </>
                )}
              </dl>
              {pr.body && (
                <div className="mt-3 whitespace-pre-wrap border-t border-[var(--boared-rule)] pt-3 text-[0.78rem] text-foreground">
                  {pr.body}
                </div>
              )}
            </Panel>

            <Panel title="Files changed" icon={GitPullRequest}>
              <FilesPanel items={files} />
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel title="Checks" icon={Check}>
              <ChecksPanel items={checks} />
            </Panel>

            <Panel title="Reviews" icon={MessageCircle}>
              <ReviewsPanel items={reviews} />
            </Panel>

            <Panel title="Actions" icon={GitMerge}>
              <ActionsPanel
                companyId={companyId}
                owner={owner}
                repo={repo}
                number={number}
                pr={pr}
                onChanged={invalidate}
              />
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
