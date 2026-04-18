/**
 * GitHub page — foundational shell (backlog 4.0 B1).
 *
 * Foundational scope only:
 *   - Lists GitHub connections for the selected company.
 *   - Allows creating a new PAT-based connection (gated by `github_pat_auth`).
 *   - Allows previewing a repo and its open PRs via the live GitHub API
 *     (ETag-cached on the server).
 *
 * Explicitly deferred (see backlog/backlog4.0-IMPLEMENTATION.md):
 *   - GitHub App OAuth flow, webhooks, sync loop
 *   - PR ↔ Issue linking, review/check surfaces
 *   - PR mutations (comment/approve/merge/close)
 *   - Bulk board view, saved filters, analytics
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Github, Plus, Trash2, ExternalLink, AlertTriangle } from "lucide-react";
import {
  parseRepoUrl,
  type GithubConnection,
} from "@paperclipai/shared";
import { githubApi } from "../api/github";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { isFeatureEnabled } from "../lib/featureFlags";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/boared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "../api/client";
import { cn } from "../lib/utils";

const GITHUB_QK = ["github"] as const;

function connectionsKey(companyId: string) {
  return [...GITHUB_QK, "connections", companyId] as const;
}

function repoKey(companyId: string, owner: string, repo: string) {
  return [...GITHUB_QK, "repo", companyId, owner, repo] as const;
}

function pullsKey(companyId: string, owner: string, repo: string, state: string) {
  return [...GITHUB_QK, "pulls", companyId, owner, repo, state] as const;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

function ApiErrorBanner({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Unknown error";
  return (
    <div className="flex items-start gap-3 border border-destructive/40 bg-destructive/5 px-4 py-3 text-[0.78rem]">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="flex-1">
        <div className="font-medium text-destructive">{message}</div>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function GitHubPage() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const companyId = selectedCompanyId!;

  const [connectOpen, setConnectOpen] = useState(false);
  const [repoInput, setRepoInput] = useState("");
  const [pullState, setPullState] = useState<"open" | "closed" | "all">("open");
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);

  const patAuthEnabled = isFeatureEnabled("github_pat_auth");

  useEffect(() => {
    setBreadcrumbs([{ label: "GitHub" }]);
  }, [setBreadcrumbs]);

  const connectionsQuery = useQuery({
    queryKey: connectionsKey(companyId),
    queryFn: () => githubApi.listConnections(companyId),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    if (!selectedConnectionId && connectionsQuery.data?.length) {
      const firstLive = connectionsQuery.data.find((c) => !c.revokedAt) ?? null;
      setSelectedConnectionId(firstLive?.id ?? null);
    }
  }, [connectionsQuery.data, selectedConnectionId]);

  const parsedRepo = useMemo(() => parseRepoUrl(repoInput.trim()), [repoInput]);

  const repoQuery = useQuery({
    queryKey: parsedRepo
      ? repoKey(companyId, parsedRepo.owner, parsedRepo.repo)
      : ["github", "repo", "none"],
    queryFn: () =>
      githubApi.getRepo(
        companyId,
        parsedRepo!.owner,
        parsedRepo!.repo,
        selectedConnectionId ?? undefined,
      ),
    enabled: !!selectedCompanyId && !!parsedRepo && !!selectedConnectionId,
    retry: false,
  });

  const pullsQuery = useQuery({
    queryKey: parsedRepo
      ? pullsKey(companyId, parsedRepo.owner, parsedRepo.repo, pullState)
      : ["github", "pulls", "none"],
    queryFn: () =>
      githubApi.listPulls(companyId, parsedRepo!.owner, parsedRepo!.repo, {
        state: pullState,
        connectionId: selectedConnectionId ?? undefined,
      }),
    enabled: !!selectedCompanyId && !!parsedRepo && !!selectedConnectionId,
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => githubApi.deleteConnection(companyId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: connectionsKey(companyId) });
      pushToast({ title: "GitHub connection removed", tone: "info" });
    },
    onError: (err) => {
      pushToast({
        title: "Failed to remove connection",
        body: (err as Error).message,
        tone: "error",
      });
    },
  });

  const connections = connectionsQuery.data ?? [];
  const liveConnections = connections.filter((c) => !c.revokedAt);

  if (!selectedCompanyId) {
    return <EmptyState icon={Github} message="Select a company to view GitHub connections." />;
  }

  return (
    <div className="boared-reveal mx-auto max-w-[1400px]">
      <PageHeader
        kicker={<>§§ · GitHub</>}
        title={
          <>
            Connect repos,
            <br />
            preview <em>pull requests</em>.
          </>
        }
        dateline={
          connections.length === 0
            ? "No connections yet"
            : `${liveConnections.length} ${liveConnections.length === 1 ? "connection" : "connections"} on file`
        }
        actions={
          patAuthEnabled ? (
            <Button type="button" onClick={() => setConnectOpen(true)}>
              <Plus className="mr-1.5 size-3.5" />
              New connection
            </Button>
          ) : null
        }
      />

      {connectionsQuery.error && (
        <div className="mb-6">
          <ApiErrorBanner
            error={connectionsQuery.error}
            onRetry={() => connectionsQuery.refetch()}
          />
        </div>
      )}

      <section className="mb-10">
        <h2 className="boared-label mb-3 text-foreground">Connections</h2>
        {connectionsQuery.isLoading ? (
          <div className="border border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Loading connections…
          </div>
        ) : liveConnections.length === 0 ? (
          <EmptyState
            icon={Github}
            message={
              patAuthEnabled
                ? "No GitHub connections yet."
                : "No GitHub connections, and PAT flow is disabled on this instance."
            }
            action={patAuthEnabled ? "New connection" : undefined}
            onAction={patAuthEnabled ? () => setConnectOpen(true) : undefined}
          />
        ) : (
          <ul className="divide-y divide-[var(--boared-rule)] border border-[var(--boared-rule)]">
            {liveConnections.map((conn) => (
              <ConnectionRow
                key={conn.id}
                connection={conn}
                active={conn.id === selectedConnectionId}
                onSelect={() => setSelectedConnectionId(conn.id)}
                onDelete={() => deleteMutation.mutate(conn.id)}
                deleting={deleteMutation.isPending && deleteMutation.variables === conn.id}
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="boared-label mb-3 text-foreground">Repo preview</h2>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[280px] flex-1">
            <Label htmlFor="github-repo-input" className="mb-1 block text-[0.72rem] text-muted-foreground">
              Owner/repo or URL
            </Label>
            <Input
              id="github-repo-input"
              placeholder="e.g. octocat/hello-world or https://github.com/octocat/hello-world"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-1 block text-[0.72rem] text-muted-foreground">PR state</Label>
            <div className="flex gap-1">
              {(["open", "closed", "all"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPullState(s)}
                  className={cn(
                    "border px-3 py-2 text-[0.72rem] uppercase tracking-wide",
                    pullState === s
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!parsedRepo && repoInput.trim().length > 0 && (
          <div className="mb-4 border border-destructive/40 bg-destructive/5 px-4 py-3 text-[0.78rem] text-destructive">
            Couldn't parse that as an <code>owner/repo</code>. Try <code>octocat/hello-world</code>.
          </div>
        )}

        {!selectedConnectionId && parsedRepo && (
          <div className="mb-4 border border-border px-4 py-3 text-[0.78rem] text-muted-foreground">
            Add or select a connection to fetch repo data.
          </div>
        )}

        {parsedRepo && selectedConnectionId && (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <RepoCard
              owner={parsedRepo.owner}
              repo={parsedRepo.repo}
              query={repoQuery}
            />
            <PullRequestList
              query={pullsQuery}
              repoHtmlUrl={repoQuery.data?.data.htmlUrl ?? null}
            />
          </div>
        )}
      </section>

      <ConnectDialog
        open={connectOpen && patAuthEnabled}
        onClose={() => setConnectOpen(false)}
        companyId={companyId}
      />
    </div>
  );
}

function ConnectionRow({
  connection,
  active,
  onSelect,
  onDelete,
  deleting,
}: {
  connection: GithubConnection;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-4 px-4 py-3",
        active ? "bg-foreground/[0.04]" : "",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex flex-1 items-center gap-3 text-left focus:outline-none"
      >
        <span
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center border",
            active ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground",
          )}
        >
          <Github className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[0.82rem] text-foreground">
            {connection.accountLogin ?? "Unnamed PAT"}
          </span>
          <span className="block text-[0.7rem] text-muted-foreground">
            {connection.authType.toUpperCase()} · created {formatDate(connection.createdAt)}
            {connection.lastVerifiedAt ? ` · verified ${formatDate(connection.lastVerifiedAt)}` : ""}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="inline-flex items-center gap-1.5 border border-border px-2 py-1 text-[0.7rem] text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
        aria-label="Remove connection"
      >
        <Trash2 className="size-3.5" />
        Remove
      </button>
    </li>
  );
}

function RepoCard({
  owner,
  repo,
  query,
}: {
  owner: string;
  repo: string;
  query: ReturnType<typeof useQuery<import("../api/github").GithubRepoResponse>>;
}) {
  if (query.isLoading) {
    return (
      <div className="border border-border px-4 py-6 text-[0.78rem] text-muted-foreground">
        Loading repository…
      </div>
    );
  }
  if (query.error) {
    return <ApiErrorBanner error={query.error} onRetry={() => query.refetch()} />;
  }
  const view = query.data?.data;
  if (!view) return null;
  return (
    <div className="flex flex-col gap-3 border border-[var(--boared-rule)] p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="boared-label text-muted-foreground">Repository</div>
          <div className="mt-1 font-serif text-xl text-foreground">
            {owner}/{repo}
          </div>
        </div>
        <a
          href={view.htmlUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[0.72rem] text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="size-3.5" />
          open
        </a>
      </div>
      {view.description && (
        <p className="text-[0.82rem] text-muted-foreground">{view.description}</p>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 text-[0.72rem]">
        <dt className="text-muted-foreground">Default branch</dt>
        <dd className="font-mono text-foreground">{view.defaultBranch ?? "—"}</dd>
        <dt className="text-muted-foreground">Visibility</dt>
        <dd className="font-mono text-foreground">{view.private ? "private" : "public"}</dd>
        <dt className="text-muted-foreground">Archived</dt>
        <dd className="font-mono text-foreground">{view.archived ? "yes" : "no"}</dd>
        <dt className="text-muted-foreground">Updated</dt>
        <dd className="font-mono text-foreground">{formatDate(view.updatedAt)}</dd>
        <dt className="text-muted-foreground">Pushed</dt>
        <dd className="font-mono text-foreground">{formatDate(view.pushedAt)}</dd>
      </dl>
      {view.rateLimit && (
        <div className="mt-2 border-t border-[var(--boared-rule)] pt-2 font-mono text-[0.62rem] text-muted-foreground">
          rate limit: {view.rateLimit.remaining ?? "?"}/{view.rateLimit.limit ?? "?"}
          {view.rateLimit.resetAt ? ` · resets ${formatDate(view.rateLimit.resetAt)}` : ""}
        </div>
      )}
    </div>
  );
}

function PullRequestList({
  query,
  repoHtmlUrl,
}: {
  query: ReturnType<typeof useQuery<import("../api/github").GithubPullRequestListResponse>>;
  repoHtmlUrl: string | null;
}) {
  if (query.isLoading) {
    return (
      <div className="border border-border px-4 py-6 text-[0.78rem] text-muted-foreground">
        Loading pull requests…
      </div>
    );
  }
  if (query.error) {
    return <ApiErrorBanner error={query.error} onRetry={() => query.refetch()} />;
  }
  const items = query.data?.items ?? [];
  if (items.length === 0) {
    return (
      <div className="border border-[var(--boared-rule)] px-4 py-8 text-center text-[0.78rem] text-muted-foreground">
        No pull requests in this state.
        {repoHtmlUrl && (
          <div className="mt-2">
            <a
              href={`${repoHtmlUrl}/pulls`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-foreground hover:underline"
            >
              View on GitHub <ExternalLink className="size-3" />
            </a>
          </div>
        )}
      </div>
    );
  }
  return (
    <ul className="divide-y divide-[var(--boared-rule)] border border-[var(--boared-rule)]">
      {items.map((pr) => (
        <li key={pr.number} className="flex items-start gap-3 px-4 py-3">
          <span
            className={cn(
              "mt-0.5 inline-block size-2 shrink-0",
              pr.merged
                ? "bg-purple-500"
                : pr.state === "open"
                  ? "bg-[var(--boared-acid)]"
                  : "bg-muted-foreground",
            )}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <a
              href={pr.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="block font-mono text-[0.82rem] text-foreground hover:underline"
            >
              #{pr.number} · {pr.title}
            </a>
            <div className="mt-0.5 text-[0.7rem] text-muted-foreground">
              {pr.authorLogin ?? "unknown"}
              {pr.draft ? " · draft" : ""}
              {pr.merged ? " · merged" : pr.state === "closed" ? " · closed" : ""}
              {pr.baseRef && pr.headRef ? ` · ${pr.headRef} → ${pr.baseRef}` : ""}
              {` · updated ${formatDate(pr.updatedAt)}`}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ConnectDialog({
  open,
  onClose,
  companyId,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [token, setToken] = useState("");
  const [accountLogin, setAccountLogin] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      githubApi.createConnection(companyId, {
        token,
        accountLogin: accountLogin.trim() || undefined,
        description: description.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: connectionsKey(companyId) });
      pushToast({ title: "GitHub connection created", tone: "success" });
      setToken("");
      setAccountLogin("");
      setDescription("");
      onClose();
    },
    onError: (err) => {
      pushToast({
        title: "Failed to create connection",
        body: (err as Error).message,
        tone: "error",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New GitHub connection</DialogTitle>
          <DialogDescription>
            Paste a personal access token (classic or fine-grained) with repo read access.
            The token is stored encrypted in the company secret vault; only its hash is kept for
            activity logs.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="gh-token">Personal access token</Label>
            <Input
              id="gh-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_…"
            />
          </div>
          <div>
            <Label htmlFor="gh-login">Account login (optional)</Label>
            <Input
              id="gh-login"
              value={accountLogin}
              onChange={(e) => setAccountLogin(e.target.value)}
              placeholder="e.g. octocat"
            />
          </div>
          <div>
            <Label htmlFor="gh-desc">Note (optional)</Label>
            <Input
              id="gh-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this token for?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!token.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? "Connecting…" : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
