/**
 * Issue file relevance panel (backlog 2.0 B1 / 1.5 A1).
 *
 * Shown on the Issue detail page as a compact ranked list of files
 * most relevant to the issue. Actions per row:
 *   - preview inline
 *   - open in Files with canonical context
 *   - pin/unpin as a summary file
 *   - attach to an evidence set
 *   - compare with prior version (inline tray)
 *
 * Fully gated by `issue_relevance_panel` flag.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { FileText, GitCompare, BookmarkPlus, BookmarkCheck, Bookmark, X, ExternalLink, Layers } from "lucide-react";
import { filesApi } from "../api/files";
import { queryKeys } from "../lib/queryKeys";
import { useFeatureFlag } from "../lib/featureFlags";
import { markFilePerf } from "../lib/filePerf";
import { buildFilesHref } from "../lib/fileContext";
import { FilePreview } from "./FilePreview";
import { InlineCompareTray } from "./InlineCompareTray";
import { EvidenceSetsPanel } from "./EvidenceSetsPanel";
import { cn } from "../lib/utils";
import { useToast } from "../context/ToastContext";
import type { IssueRelevantFile, IssueSummaryFile } from "@paperclipai/shared";

interface Props {
  companyId: string;
  issueId: string;
}

export function IssueFileRelevancePanel({ companyId, issueId }: Props) {
  const enabled = useFeatureFlag("issue_relevance_panel");
  const compareEnabled = useFeatureFlag("issue_inline_compare");
  const evidenceSetsEnabled = useFeatureFlag("evidence_sets");
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [compareTarget, setCompareTarget] = useState<IssueRelevantFile | null>(null);

  const panelOpenTimer = useRef<number>(performance.now());
  const [expanded, setExpanded] = useState(true);

  const { data: relevant, isLoading } = useQuery({
    queryKey: ["issue-relevant-files", companyId, issueId],
    queryFn: () => filesApi.issueRelevant(companyId, issueId, { limit: 15 }),
    enabled: enabled && !!companyId && !!issueId,
  });

  const { data: summaryFiles } = useQuery({
    queryKey: queryKeys.files.summaryFiles(companyId, issueId),
    queryFn: () => filesApi.issueSummaryFiles(companyId, issueId),
    enabled: enabled && !!companyId && !!issueId,
  });

  useEffect(() => {
    if (relevant && !isLoading) {
      markFilePerf("panel_open", performance.now() - panelOpenTimer.current, {
        surface: "issue_relevance",
        count: relevant.length,
      });
    }
  }, [relevant, isLoading]);

  const summaryByPath = useMemo(() => {
    const map = new Map<string, IssueSummaryFile>();
    (summaryFiles ?? []).forEach((f) => map.set(f.filePath, f));
    return map;
  }, [summaryFiles]);

  const pinMutation = useMutation({
    mutationFn: (snapshotId: string) =>
      filesApi.addIssueSummaryFile(companyId, issueId, snapshotId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.files.summaryFiles(companyId, issueId) });
      pushToast({ title: "Pinned to summary", tone: "success" });
    },
    onError: (err) => pushToast({ title: "Could not pin", body: (err as Error).message, tone: "error" }),
  });

  const unpinMutation = useMutation({
    mutationFn: (summaryFileId: string) =>
      filesApi.removeIssueSummaryFile(companyId, issueId, summaryFileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.files.summaryFiles(companyId, issueId) });
      pushToast({ title: "Removed from summary", tone: "info" });
    },
    onError: (err) => pushToast({ title: "Could not remove", body: (err as Error).message, tone: "error" }),
  });

  if (!enabled) return null;

  const preview = previewIdx !== null ? relevant?.[previewIdx] : null;

  return (
    <section
      className="mt-6 border border-[var(--boared-rule)] bg-[var(--boared-paper-2)]"
      aria-labelledby="relevance-panel-heading"
    >
      <header className="flex items-center justify-between px-3 py-2 border-b border-[var(--boared-rule)]">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 font-mono uppercase tracking-[0.08em] text-[0.66rem] text-muted-foreground hover:text-foreground"
          aria-expanded={expanded}
        >
          <Layers className="h-3.5 w-3.5" />
          <span id="relevance-panel-heading">Relevant files</span>
          {relevant && relevant.length > 0 && (
            <span className="text-foreground">({relevant.length})</span>
          )}
        </button>
        <div className="flex items-center gap-2">
          <Link
            to={buildFilesHref({
              filePath: "",
              issueId,
              source: "issue",
            }, { includeFile: false })}
            className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground"
          >
            Open in files ↗
          </Link>
        </div>
      </header>

      {expanded && (
        <div className="divide-y divide-[var(--boared-rule)]">
          {isLoading ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">Loading relevance…</div>
          ) : !relevant?.length ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              No ranked files yet. Files will appear here as agent runs touch paths related to this issue.
            </div>
          ) : (
            relevant.map((f, idx) => {
              const isPinned = summaryByPath.has(f.filePath);
              const summaryRow = summaryByPath.get(f.filePath);
              const active = previewIdx === idx;
              return (
                <div key={f.snapshotId} className={cn("px-3 py-2 group", active && "bg-foreground/[0.03]")}>
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <button
                      onClick={() => setPreviewIdx((v) => v === idx ? null : idx)}
                      className="truncate text-left text-[0.82rem] hover:text-[var(--boared-acid)]"
                    >
                      {f.filePath}
                    </button>

                    <div className="flex items-center gap-1 ml-auto shrink-0">
                      {f.signals.summaryLinked && (
                        <span className="font-mono uppercase text-[0.55rem] tracking-[0.08em] px-1.5 py-0.5 border border-foreground text-foreground">
                          Summary
                        </span>
                      )}
                      <span className="font-mono uppercase text-[0.55rem] tracking-[0.08em] text-muted-foreground">
                        {f.operation}
                      </span>
                      <span className="font-mono text-[0.6rem] text-muted-foreground tabular-nums">
                        score {f.score.toFixed(1)}
                      </span>

                      <button
                        type="button"
                        onClick={() => {
                          if (isPinned && summaryRow) unpinMutation.mutate(summaryRow.id);
                          else pinMutation.mutate(f.snapshotId);
                        }}
                        aria-label={isPinned ? "Remove from summary" : "Pin to summary"}
                        title={isPinned ? "Remove from summary" : "Pin to summary"}
                        className="p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      >
                        {isPinned ? <BookmarkCheck className="h-3.5 w-3.5" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
                      </button>

                      {compareEnabled && (
                        <button
                          type="button"
                          onClick={() => setCompareTarget(f)}
                          aria-label="Compare with previous version"
                          title="Compare with previous version"
                          className="p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                        >
                          <GitCompare className="h-3.5 w-3.5" />
                        </button>
                      )}

                      <Link
                        to={buildFilesHref({
                          filePath: f.filePath,
                          contentHash: f.contentHash,
                          runId: f.runId,
                          agentId: f.agentId,
                          issueId,
                          source: "issue",
                        })}
                        aria-label={`Open ${f.filePath} in Files`}
                        title="Open in Files"
                        className="p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {expanded && preview && (
        <div className="border-t border-[var(--boared-rule)] bg-background">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--boared-rule)]">
            <span className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground truncate">
              {preview.filePath}
            </span>
            <button
              onClick={() => setPreviewIdx(null)}
              className="p-1 hover:text-[var(--boared-acid)]"
              aria-label="Close preview"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <FilePreview
            companyId={companyId}
            filePath={preview.filePath}
            contentHash={preview.contentHash}
            className="max-h-[420px]"
          />
        </div>
      )}

      {compareEnabled && compareTarget && (
        <InlineCompareTray
          companyId={companyId}
          filePath={compareTarget.filePath}
          onClose={() => setCompareTarget(null)}
        />
      )}

      {evidenceSetsEnabled && (
        <div className="border-t border-[var(--boared-rule)]">
          <EvidenceSetsPanel
            companyId={companyId}
            issueId={issueId}
            candidateFiles={relevant ?? []}
          />
        </div>
      )}
    </section>
  );
}
