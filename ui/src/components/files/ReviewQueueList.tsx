/**
 * ReviewQueueList — files waiting on reviewer eyes because an issue
 * in review references them (summary, comment evidence, evidence-set).
 *
 * Each row routes to the Reader with context so the issue appears in
 * the Inspector. Rows are intentionally lean — this is a lane, not a
 * detail view, and stacking more per-row metadata would dilute the
 * "act on this" signal.
 */

import type { ReviewQueueItem } from "@paperclipai/shared";
import { FileQuestion, ArrowUpRight, Inbox } from "lucide-react";
import { Link } from "@/lib/router";
import { timeAgo } from "@/lib/timeAgo";
import { buildFilesHref } from "@/lib/fileContext";
import { cn } from "@/lib/utils";

function filenameOf(p: string): string {
  return p.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? p;
}

const REASON_LABEL: Record<ReviewQueueItem["reason"], string> = {
  summary: "summary",
  evidence: "evidence",
  checklist: "checklist",
};

export function ReviewQueueList({
  items,
  onOpen,
  className,
  max = 8,
}: {
  items: ReviewQueueItem[];
  onOpen?: (item: ReviewQueueItem) => void;
  className?: string;
  max?: number;
}) {
  if (!items.length) {
    return (
      <div className={cn(
        "flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground border border-dashed border-[var(--boared-rule)] rounded-md",
        className,
      )}>
        <Inbox className="h-4 w-4" />
        <span>Nothing waiting on review right now.</span>
      </div>
    );
  }

  const visible = items.slice(0, max);
  const overflow = items.length - visible.length;

  return (
    <ul
      className={cn("border border-[var(--boared-rule)] rounded-md divide-y divide-[var(--boared-rule)] overflow-hidden", className)}
      role="list"
      aria-label="Review queue"
    >
      {visible.map((it) => (
        <li
          key={`${it.issueId}::${it.filePath}`}
          className="group flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50"
        >
          <FileQuestion className="h-3.5 w-3.5 text-violet-300 shrink-0" />
          <button
            type="button"
            onClick={() => onOpen?.(it)}
            className="min-w-0 flex-1 text-left"
          >
            <div className="truncate font-medium text-foreground">{filenameOf(it.filePath)}</div>
            <div className="truncate font-mono text-[0.6rem] text-muted-foreground">
              {it.filePath}
            </div>
          </button>
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <span className="font-mono text-[0.55rem] uppercase tracking-[0.08em] text-muted-foreground px-1 py-[1px] border border-[var(--boared-rule)] rounded-sm">
              {REASON_LABEL[it.reason]}
            </span>
            <Link
              to={`/issues/${it.issueId}`}
              className="font-mono text-[0.6rem] text-muted-foreground hover:text-foreground truncate max-w-[220px] inline-flex items-center gap-1"
              title={it.issueTitle ?? undefined}
            >
              <span>{it.issueKey}</span>
              <span className="truncate">{it.issueTitle}</span>
            </Link>
            <span className="font-mono text-[0.58rem] text-muted-foreground">
              {timeAgo(it.waitingSince ?? it.queuedAt)}
            </span>
          </div>
          <Link
            to={buildFilesHref({
              filePath: it.filePath,
              issueId: it.issueId,
              source: "issue",
            })}
            aria-label={`Open ${it.filePath} in reader`}
            className="shrink-0 p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            title="Open in reader"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </li>
      ))}
      {overflow > 0 && (
        <li className="px-3 py-1.5 text-[0.62rem] font-mono text-muted-foreground text-center">
          +{overflow} more
        </li>
      )}
    </ul>
  );
}
