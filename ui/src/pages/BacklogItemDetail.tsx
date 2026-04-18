/**
 * BacklogItemDetail — single-item view (backlog3.0 D3).
 *
 * Renders an item's title, body, metadata, source provenance, and a
 * comments thread. Intentionally lighter than IssueDetail: backlog
 * items are pre-issue scratchpad content, so we avoid pulling in the
 * full scene/run/attachment machinery.
 *
 * Comments land in this page (D3). On promotion, the server copies
 * these comments onto the resulting Issue so the discussion is not
 * lost.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowLeft, Rocket, Trash2 } from "lucide-react";
import type { BacklogItemComment } from "@paperclipai/shared";
import { backlogApi } from "../api/backlog";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { relativeTime, cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Identity } from "../components/Identity";
import { MarkdownBody } from "../components/MarkdownBody";

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "rounded bg-muted px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

function SourceLink({
  source,
  sourceRef,
}: {
  source: string;
  sourceRef: Record<string, unknown> | null;
}) {
  if (!sourceRef) return null;
  const identifier =
    typeof sourceRef.identifier === "string" ? sourceRef.identifier : null;
  const issueId =
    typeof sourceRef.issueId === "string" ? sourceRef.issueId : null;
  const runId = typeof sourceRef.runId === "string" ? sourceRef.runId : null;
  const workflowId =
    typeof sourceRef.workflowId === "string" ? sourceRef.workflowId : null;
  const chatId = typeof sourceRef.chatId === "string" ? sourceRef.chatId : null;

  if (source === "issue" && issueId) {
    return (
      <Link
        to={`/issues/${issueId}`}
        className="text-xs text-[var(--boared-acid)] hover:underline"
      >
        ↗ {identifier ?? issueId.slice(0, 8)}
      </Link>
    );
  }
  if ((source === "run" || source === "workflow") && runId) {
    const href = workflowId
      ? `/workflows/${workflowId}/runs/${runId}`
      : `/runs/${runId}`;
    return (
      <Link
        to={href}
        className="text-xs text-[var(--boared-acid)] hover:underline"
      >
        ↗ run {runId.slice(0, 8)}
      </Link>
    );
  }
  if (source === "chat" && chatId) {
    return (
      <Link
        to={`/chat/${chatId}`}
        className="text-xs text-[var(--boared-acid)] hover:underline"
      >
        ↗ chat
      </Link>
    );
  }
  return null;
}

export function BacklogItemDetail() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const { data: item, isLoading, error } = useQuery({
    queryKey: queryKeys.backlog.item(selectedCompanyId ?? "", itemId ?? ""),
    queryFn: () => backlogApi.getItem(selectedCompanyId!, itemId!),
    enabled: !!selectedCompanyId && !!itemId,
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: "Backlog", href: "/backlog" },
      { label: item?.title ?? "Item" },
    ]);
  }, [setBreadcrumbs, item?.title]);

  const { data: comments = [] } = useQuery({
    queryKey: queryKeys.backlog.comments(selectedCompanyId ?? "", itemId ?? ""),
    queryFn: () => backlogApi.listComments(selectedCompanyId!, itemId!),
    enabled: !!selectedCompanyId && !!itemId,
  });

  const invalidateItem = () => {
    queryClient.invalidateQueries({
      queryKey: ["backlog", selectedCompanyId],
    });
  };

  const archiveItem = useMutation({
    mutationFn: () => backlogApi.archiveItem(selectedCompanyId!, itemId!),
    onSuccess: () => {
      invalidateItem();
      pushToast({ title: "Archived", tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: "Archive failed",
        body: (err as Error).message,
        tone: "error",
      });
    },
  });

  const promoteItem = useMutation({
    mutationFn: () => backlogApi.promoteItem(selectedCompanyId!, itemId!, {}),
    onSuccess: (result) => {
      invalidateItem();
      pushToast({
        title: "Promoted to Issue",
        body: `${result.issue.identifier ?? result.issue.id.slice(0, 8)} · ${result.item.title.slice(0, 80)}`,
        tone: "success",
      });
      navigate(`/issues/${result.issue.id}`);
    },
    onError: (err) => {
      pushToast({
        title: "Promotion failed",
        body: (err as Error).message,
        tone: "error",
      });
    },
  });

  if (!selectedCompanyId) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">
        Select a company first.
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (error || !item) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">
        <Link to="/backlog" className="inline-flex items-center gap-1 text-[var(--boared-acid)] hover:underline">
          <ArrowLeft className="size-3" /> Back to Backlog
        </Link>
        <p className="mt-4">Item not found.</p>
      </div>
    );
  }

  const canPromote =
    item.status !== "promoted" && item.status !== "archived";

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Link
          to="/backlog"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" /> Back to Backlog
        </Link>
        <div className="flex items-center gap-2">
          {canPromote && (
            <Button
              size="sm"
              onClick={() => promoteItem.mutate()}
              disabled={promoteItem.isPending}
            >
              <Rocket className="size-3" />
              {promoteItem.isPending ? "Promoting…" : "Promote to Issue"}
            </Button>
          )}
          {item.status !== "archived" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => archiveItem.mutate()}
              disabled={archiveItem.isPending}
            >
              <Archive className="size-3" />
              {archiveItem.isPending ? "Archiving…" : "Archive"}
            </Button>
          )}
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-serif tracking-tight text-foreground">
          {item.title}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Chip>{item.status}</Chip>
          <Chip>{item.source}</Chip>
          {item.priority && <Chip>{item.priority}</Chip>}
          {item.promotedIssueId && (
            <Link
              to={`/issues/${item.promotedIssueId}`}
              className="rounded border border-[var(--boared-acid)] px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wide text-[var(--boared-acid)] hover:underline"
            >
              promoted ↗
            </Link>
          )}
          <SourceLink
            source={item.source}
            sourceRef={item.sourceRef as Record<string, unknown> | null}
          />
          <span className="text-[0.6rem] font-mono text-muted-foreground">
            updated {relativeTime(new Date(item.updatedAt))}
          </span>
        </div>
      </div>

      {item.body && (
        <div className="rounded border border-border bg-card p-4">
          <MarkdownBody>{item.body}</MarkdownBody>
        </div>
      )}

      <CommentSection
        companyId={selectedCompanyId}
        itemId={item.id}
        comments={comments}
      />
    </div>
  );
}

function CommentSection({
  companyId,
  itemId,
  comments,
}: {
  companyId: string;
  itemId: string;
  comments: BacklogItemComment[];
}) {
  const [draft, setDraft] = useState("");
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const addComment = useMutation({
    mutationFn: (body: string) =>
      backlogApi.createComment(companyId, itemId, { body }),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({
        queryKey: queryKeys.backlog.comments(companyId, itemId),
      });
    },
    onError: (err) => {
      pushToast({
        title: "Comment failed",
        body: (err as Error).message,
        tone: "error",
      });
    },
  });

  const deleteComment = useMutation({
    mutationFn: (commentId: string) =>
      backlogApi.deleteComment(companyId, commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.backlog.comments(companyId, itemId),
      });
    },
    onError: (err) => {
      pushToast({
        title: "Delete failed",
        body: (err as Error).message,
        tone: "error",
      });
    },
  });

  const ordered = useMemo(
    () =>
      [...comments].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [comments],
  );

  return (
    <section className="space-y-3">
      <h2 className="font-serif text-lg tracking-tight text-foreground">
        Comments
      </h2>
      {ordered.length === 0 ? (
        <p className="text-xs text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="space-y-3">
          {ordered.map((c) => (
            <li
              key={c.id}
              className="rounded border border-border bg-card p-3"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <Identity
                  name={c.authorAgent?.displayName ?? "You"}
                  size="xs"
                />
                <div className="flex items-center gap-2">
                  <time className="text-[0.6rem] font-mono text-muted-foreground">
                    {relativeTime(new Date(c.createdAt))}
                  </time>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Delete this comment?")) {
                        deleteComment.mutate(c.id);
                      }
                    }}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Delete comment"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
              <MarkdownBody>{c.body}</MarkdownBody>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment…"
          rows={3}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              addComment.mutate(draft.trim());
            }
          }}
        />
        <div className="flex items-center justify-between">
          <span className="text-[0.6rem] font-mono text-muted-foreground">
            Comments carry over when the item is promoted to an Issue.
          </span>
          <Button
            size="sm"
            onClick={() => draft.trim() && addComment.mutate(draft.trim())}
            disabled={!draft.trim() || addComment.isPending}
          >
            {addComment.isPending ? "Posting…" : "Post"}
          </Button>
        </div>
      </div>
    </section>
  );
}
