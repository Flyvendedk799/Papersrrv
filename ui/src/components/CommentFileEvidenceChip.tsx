/**
 * Comment file evidence chip + attach menu (backlog 2.0 B3 / 1.5 B2).
 *
 * Rendered inline in the comment composer (attach) and inside the
 * comment row (list). Each chip is an immutable pointer to a file
 * version that was part of the comment's evidence.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Paperclip, X, FileText } from "lucide-react";
import { Link } from "@/lib/router";
import { filesApi } from "../api/files";
import { queryKeys } from "../lib/queryKeys";
import { useToast } from "../context/ToastContext";
import { markFilePerf } from "../lib/filePerf";
import { useFeatureFlag } from "../lib/featureFlags";
import { buildFilesHref } from "../lib/fileContext";
import { cn } from "../lib/utils";
import type { CommentFileEvidence, IssueRelevantFile } from "@paperclipai/shared";

export function CommentEvidenceChipList({
  companyId,
  issueId,
  commentId,
  canEdit,
}: {
  companyId: string;
  issueId: string;
  commentId: string;
  canEdit?: boolean;
}) {
  const enabled = useFeatureFlag("comment_file_evidence");
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const { data: all } = useQuery({
    queryKey: queryKeys.files.commentEvidence(issueId),
    queryFn: () => filesApi.listCommentEvidence(companyId, issueId),
    enabled: enabled && !!issueId,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => filesApi.deleteCommentEvidence(companyId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.files.commentEvidence(issueId) });
      pushToast({ title: "Evidence removed", tone: "info" });
    },
  });

  if (!enabled) return null;
  const items = (all ?? []).filter((e) => e.commentId === commentId);
  if (!items.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {items.map((e) => (
        <EvidenceChip
          key={e.id}
          evidence={e}
          issueId={issueId}
          onRemove={canEdit ? () => removeMutation.mutate(e.id) : undefined}
        />
      ))}
    </div>
  );
}

function EvidenceChip({
  evidence,
  issueId,
  onRemove,
}: {
  evidence: CommentFileEvidence;
  issueId: string;
  onRemove?: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 border border-[var(--boared-rule)] px-1.5 py-0.5 text-[0.7rem] bg-[var(--boared-paper-2)] max-w-full">
      <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
      <Link
        to={buildFilesHref({
          filePath: evidence.filePath,
          contentHash: evidence.contentHash,
          issueId,
          source: "comment",
        })}
        className="truncate max-w-[220px] hover:text-[var(--boared-acid)]"
        title={evidence.filePath}
      >
        {basename(evidence.filePath)}
      </Link>
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label="Remove evidence"
          className="text-muted-foreground hover:text-[var(--boared-acid)]"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export function CommentEvidenceAttachMenu({
  companyId,
  issueId,
  commentId,
  candidates,
}: {
  companyId: string;
  issueId: string;
  commentId: string;
  candidates: IssueRelevantFile[];
}) {
  const enabled = useFeatureFlag("comment_file_evidence");
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const addMutation = useMutation({
    mutationFn: (f: IssueRelevantFile) => {
      const t0 = performance.now();
      return filesApi.addCommentEvidence(companyId, issueId, commentId, {
        filePath: f.filePath,
        contentHash: f.contentHash,
        snapshotId: f.snapshotId,
      }).finally(() => markFilePerf("evidence_attach", performance.now() - t0, { target: "comment" }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.files.commentEvidence(issueId) });
      pushToast({ title: "File attached as evidence", tone: "success" });
      setOpen(false);
    },
    onError: (err) => pushToast({ title: "Attach failed", body: (err as Error).message, tone: "error" }),
  });

  if (!enabled) return null;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 font-mono uppercase text-[0.62rem] tracking-[0.08em] text-muted-foreground hover:text-foreground"
        aria-expanded={open}
      >
        <Paperclip className="h-3 w-3" />
        Attach file
      </button>
      {open && (
        <div className={cn(
          "absolute bottom-full left-0 mb-1 z-20 w-72 bg-background border border-[var(--boared-rule)] shadow-md",
        )}>
          <div className="px-2 py-1 border-b border-[var(--boared-rule)] flex items-center justify-between">
            <span className="font-mono uppercase text-[0.6rem] tracking-[0.08em] text-muted-foreground">
              Relevant files
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="max-h-60 overflow-auto">
            {!candidates.length ? (
              <div className="px-2 py-3 text-xs text-muted-foreground italic">
                No candidate files available yet. Run an agent touching relevant files first.
              </div>
            ) : (
              <ul className="divide-y divide-[var(--boared-rule)]">
                {candidates.slice(0, 15).map((f) => (
                  <li key={f.snapshotId}>
                    <button
                      type="button"
                      onClick={() => addMutation.mutate(f)}
                      disabled={addMutation.isPending}
                      className="w-full text-left px-2 py-1 hover:bg-foreground/[0.04] flex items-center gap-2"
                    >
                      <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="truncate text-[0.7rem]">{f.filePath}</span>
                      <span className="ml-auto font-mono text-[0.55rem] text-muted-foreground shrink-0">
                        {f.operation}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}
