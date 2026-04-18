/**
 * FilesReader — IDE-style reading surface in the center of the shell.
 *
 * Wraps FilePreview with:
 *   - breadcrumb of the file path (clickable segments)
 *   - open-file tabs for jumping between recently opened files
 *   - version pager ([ / ]) driven by file history
 *
 * Reader is read-only; edits still go through agent flows. This keeps
 * the Reader fast, focused, and safe to keep open.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  X as CloseIcon,
  FileText,
  Copy,
  Check,
} from "lucide-react";
import { filesApi } from "@/api/files";
import { queryKeys } from "@/lib/queryKeys";
import { FilePreview } from "@/components/FilePreview";
import { timeAgo } from "@/lib/timeAgo";
import { cn } from "@/lib/utils";

function filenameOf(p: string): string {
  return p.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? p;
}

export interface OpenTab {
  filePath: string;
  contentHash: string | null;
}

export interface FilesReaderProps {
  companyId: string;
  tabs: OpenTab[];
  activeIndex: number;
  onActivate: (idx: number) => void;
  onCloseTab: (idx: number) => void;
  onPickHash: (hash: string) => void;
  className?: string;
}

export function FilesReader({
  companyId,
  tabs,
  activeIndex,
  onActivate,
  onCloseTab,
  onPickHash,
  className,
}: FilesReaderProps) {
  const active = tabs[activeIndex] ?? null;
  const [copied, setCopied] = useState(false);

  const { data: history = [] } = useQuery({
    queryKey: queryKeys.files.history(companyId, active?.filePath ?? ""),
    queryFn: () => filesApi.history(companyId, active!.filePath),
    enabled: !!active,
    staleTime: 30_000,
  });

  /**
   * Auto-resolve the latest snapshot hash when a tab was opened without
   * one. Without this, FilePreview falls through to its raw-from-disk
   * fallback — and since agent-captured paths are frequently relative to
   * a different workspace than the server's cwd, that fallback surfaces
   * "Content unavailable" even though a perfectly good snapshot exists
   * in the database. We promote the latest indexed version to the tab
   * as soon as history is known.
   */
  const autoResolvedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!active) return;
    if (active.contentHash) return;
    if (history.length === 0) return;
    const latest = history[0]?.contentHash;
    if (!latest) return;
    const key = `${active.filePath}::auto`;
    if (autoResolvedRef.current === key) return;
    autoResolvedRef.current = key;
    onPickHash(latest);
  }, [active, history, onPickHash]);

  // Reset the auto-resolve guard whenever the active file path changes.
  useEffect(() => {
    autoResolvedRef.current = null;
  }, [active?.filePath]);

  const effectiveHash = active?.contentHash ?? history[0]?.contentHash ?? null;

  const versionIdx = useMemo(() => {
    if (!active || !effectiveHash) return 0;
    const idx = history.findIndex((h) => h.contentHash === effectiveHash);
    return idx < 0 ? 0 : idx;
  }, [history, active, effectiveHash]);

  useEffect(() => {
    if (copied) {
      const t = setTimeout(() => setCopied(false), 1200);
      return () => clearTimeout(t);
    }
  }, [copied]);

  const onOlder = () => {
    if (!active) return;
    const next = history[versionIdx + 1]?.contentHash;
    if (next) onPickHash(next);
  };
  const onNewer = () => {
    if (!active) return;
    const next = history[Math.max(0, versionIdx - 1)]?.contentHash;
    if (next) onPickHash(next);
  };

  if (!active) {
    return (
      <div className={cn("flex flex-1 items-center justify-center text-center text-sm text-muted-foreground", className)}>
        <div className="max-w-md px-6">
          <div className="mx-auto mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--boared-rule)] bg-[var(--boared-paper-2)] text-muted-foreground">
            <FileText className="h-5 w-5" />
          </div>
          <p className="mb-1 text-base font-semibold text-foreground">No file open</p>
          <p className="text-xs text-muted-foreground">
            Pick a file from the rail, jump from the overview, or press{" "}
            <kbd className="font-mono border border-[var(--boared-rule)] px-1 py-[1px] rounded-sm bg-[var(--boared-paper-2)]">⌘P</kbd>{" "}
            for quick open.
          </p>
        </div>
      </div>
    );
  }

  const parts = active.filePath.replace(/\\/g, "/").split("/").filter(Boolean);

  return (
    <div className={cn("flex flex-col min-h-0 bg-[var(--boared-paper)]", className)}>
      <div
        role="tablist"
        aria-label="Open files"
        className="flex items-stretch overflow-x-auto border-b border-[var(--boared-rule)] bg-[var(--boared-paper-2)] min-h-[32px]"
      >
        {tabs.map((t, i) => {
          const isActive = i === activeIndex;
          return (
            <div
              key={`${t.filePath}-${i}`}
              role="tab"
              aria-selected={isActive}
              className={cn(
                "group relative flex items-center gap-1.5 pl-3 pr-1 py-1.5 border-r border-[var(--boared-rule)] text-[0.72rem] shrink-0 max-w-[240px]",
                isActive
                  ? "bg-[var(--boared-paper)] text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/40",
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-0 h-[2px] w-full bg-foreground" aria-hidden="true" />
              )}
              <button
                type="button"
                onClick={() => onActivate(i)}
                className="truncate text-left font-medium"
                title={t.filePath}
              >
                {filenameOf(t.filePath)}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(i);
                }}
                aria-label={`Close ${t.filePath}`}
                className={cn(
                  "p-0.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent/70",
                  "opacity-0 group-hover:opacity-100 focus:opacity-100",
                  isActive && "opacity-60",
                )}
              >
                <CloseIcon className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 border-b border-[var(--boared-rule)] px-3 h-9 bg-[var(--boared-paper)]">
        <nav aria-label="File path" className="flex items-center gap-1 min-w-0 flex-1 font-mono text-[0.68rem] overflow-hidden">
          {parts.map((seg, i) => {
            const last = i === parts.length - 1;
            return (
              <span key={`${seg}-${i}`} className="inline-flex items-center gap-1 min-w-0">
                <span className={cn("truncate", last ? "text-foreground font-semibold" : "text-muted-foreground")}>
                  {seg}
                </span>
                {!last && <span className="text-muted-foreground/40">/</span>}
              </span>
            );
          })}
        </nav>

        <div className="shrink-0 flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(active.filePath).then(() => setCopied(true)).catch(() => {});
            }}
            aria-label="Copy path"
            title="Copy path"
            className={cn(
              "inline-flex items-center gap-1 h-6 px-2 rounded-sm border text-[0.6rem] font-mono",
              copied
                ? "border-emerald-400/40 text-emerald-400"
                : "border-[var(--boared-rule)] text-muted-foreground hover:text-foreground hover:border-foreground/40",
            )}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "copied" : "copy"}
          </button>

          {history.length > 1 && (
            <div className="flex items-center h-6 rounded-sm border border-[var(--boared-rule)] bg-[var(--boared-paper-2)] overflow-hidden">
              <button
                type="button"
                onClick={onOlder}
                disabled={versionIdx >= history.length - 1}
                aria-label="Older version"
                title="Older version  ( [ )"
                className="flex items-center justify-center h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-accent/50 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span
                className="px-2 font-mono text-[0.6rem] text-muted-foreground tabular-nums border-x border-[var(--boared-rule)]"
                title={history[versionIdx] ? `captured ${timeAgo(history[versionIdx].capturedAt)}` : undefined}
              >
                {versionIdx + 1}/{history.length}
              </span>
              <button
                type="button"
                onClick={onNewer}
                disabled={versionIdx <= 0}
                aria-label="Newer version"
                title="Newer version  ( ] )"
                className="flex items-center justify-center h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-accent/50 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <FilePreview
          companyId={companyId}
          filePath={active.filePath}
          contentHash={effectiveHash}
          className="h-full"
        />
      </div>
    </div>
  );
}
