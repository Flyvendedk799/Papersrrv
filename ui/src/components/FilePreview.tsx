/**
 * Shared file preview (backlog 2.0 A3 / C4a).
 *
 * Used by the Files side-panel and Issue detail so markdown/code/plain
 * rendering is a single source of truth. Wraps content loading with
 * graceful fallbacks:
 *
 *   1. content-hash fetch (primary, immutable)
 *   2. raw-from-disk fallback (when content not yet indexed)
 *   3. explicit empty-state messaging (deleted / unretrievable hash)
 *
 * Includes the smart markdown reader (C4a) when the file is markdown
 * and the `markdown_reader_core` flag is enabled.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { filesApi } from "../api/files";
import { queryKeys } from "../lib/queryKeys";
import { MarkdownReader } from "./MarkdownReader";
import { MarkdownBody } from "./MarkdownBody";
import { useFeatureFlag } from "../lib/featureFlags";
import { markFilePerf } from "../lib/filePerf";
import {
  recordRecentFile,
  saveScrollPosition,
  getScrollPosition,
} from "../lib/recentFiles";
import { cn } from "../lib/utils";

function slugify(text: string): string {
  return text.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80);
}

/**
 * Compute set of heading slugs whose contained body changed between
 * two markdown versions. Intentionally conservative: only reports a
 * heading as "changed" if the slice of non-heading content below it
 * differs string-wise from the prior version.
 */
function computeChangedHeadings(prev: string, next: string): Set<string> {
  const sliceByHeading = (md: string) => {
    const out = new Map<string, string>();
    const lines = md.split("\n");
    let currentSlug: string | null = null;
    let buffer: string[] = [];
    const seen = new Map<string, number>();
    const flush = () => {
      if (currentSlug) out.set(currentSlug, buffer.join("\n"));
    };
    let inFence = false;
    for (const raw of lines) {
      if (/^```/.test(raw)) inFence = !inFence;
      if (!inFence) {
        const m = raw.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
        if (m) {
          flush();
          let slug = slugify(m[2].replace(/`/g, ""));
          if (!slug) slug = `h-${out.size + 1}`;
          const used = seen.get(slug) ?? 0;
          seen.set(slug, used + 1);
          if (used > 0) slug = `${slug}-${used}`;
          currentSlug = slug;
          buffer = [];
          continue;
        }
      }
      buffer.push(raw);
    }
    flush();
    return out;
  };
  const before = sliceByHeading(prev);
  const after = sliceByHeading(next);
  const changed = new Set<string>();
  after.forEach((body, slug) => {
    const prevBody = before.get(slug);
    if (prevBody === undefined || prevBody !== body) changed.add(slug);
  });
  return changed;
}

export interface FilePreviewProps {
  companyId: string;
  filePath: string;
  contentHash?: string | null;
  /** Show loading skeleton instead of empty-state for initial load. */
  showLoadingIndicator?: boolean;
  /** Fallback UI when content is entirely unretrievable. */
  fallback?: React.ReactNode;
  /** If true, enable "remember scroll position" for this file. */
  persistScroll?: boolean;
  /** Class passed onto the scroll container. */
  className?: string;
  /** Optional wrapper class for the inner prose block. */
  bodyClassName?: string;
}

function isMarkdownFile(path: string): boolean {
  return /\.(md|mdx|markdown)$/i.test(path);
}

export function FilePreview({
  companyId,
  filePath,
  contentHash,
  showLoadingIndicator = true,
  fallback,
  persistScroll = true,
  className,
  bodyClassName,
}: FilePreviewProps) {
  const markdownReaderOn = useFeatureFlag("markdown_reader_core");
  const recentOn = useFeatureFlag("recently_viewed_files");
  const versionHighlightOn = useFeatureFlag("markdown_version_highlight");

  const { data: content, isLoading: contentLoading, error: contentError } = useQuery({
    queryKey: queryKeys.files.content(companyId, contentHash ?? ""),
    queryFn: () => filesApi.content(companyId, contentHash!),
    enabled: !!contentHash,
    retry: 1,
  });

  /**
   * Raw-from-disk fallback. Triggered in two scenarios:
   *   (a) the file has no known content hash (never indexed), or
   *   (b) the hash fetch 404'd — e.g. the snapshot row exists but the
   *       content was garbage-collected or never persisted. In that
   *       case we'd rather surface the current on-disk version than a
   *       dead-end "Content unavailable".
   */
  const needsRaw =
    (!contentLoading && !content && !contentHash) ||
    (!!contentHash && !contentLoading && !!contentError && !content);
  const { data: raw, isLoading: rawLoading, error: rawError } = useQuery({
    queryKey: queryKeys.files.raw(companyId, filePath),
    queryFn: () => filesApi.rawContent(companyId, filePath),
    enabled: needsRaw,
    retry: false,
  });

  const display = content
    ? { content: content.content, isMarkdown: content.isMarkdown }
    : raw
    ? { content: raw.content, isMarkdown: raw.isMarkdown }
    : null;

  // Track recents + perf once on success.
  const openTimerRef = useRef<number | null>(null);
  useEffect(() => {
    openTimerRef.current = performance.now();
  }, [filePath, contentHash]);
  useEffect(() => {
    if (display && openTimerRef.current != null) {
      markFilePerf("quick_preview_open", performance.now() - openTimerRef.current, {
        filePath,
        source: content ? "hash" : "raw",
      });
      openTimerRef.current = null;
      if (recentOn) recordRecentFile(filePath, contentHash ?? null);
    }
  }, [display, filePath, contentHash, content, recentOn]);

  // Persist scroll position per file (D4 quality heuristic).
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!persistScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    const restore = getScrollPosition(filePath);
    if (typeof restore === "number") el.scrollTop = restore;
    const onScroll = () => saveScrollPosition(filePath, el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [filePath, persistScroll, display]);

  const loading = contentLoading || (needsRaw && rawLoading);
  const contentUnavailable =
    // Hash present, fetch 404'd, and raw fallback also failed
    (!!contentHash && !!contentError && !content && (!needsRaw || (!!rawError && !raw))) ||
    // No hash and raw fallback also failed
    (!contentHash && !!rawError && !raw);

  const isMarkdownByExt = useMemo(() => isMarkdownFile(filePath), [filePath]);
  const renderAsMarkdown = markdownReaderOn && (display?.isMarkdown ?? isMarkdownByExt);

  // Version-aware highlighting (backlog 2.0 C4b). When we have both a
  // current hash and a prior snapshot, fetch the prior content and
  // compute a set of changed heading slugs for MarkdownReader.
  const { data: history } = useQuery({
    queryKey: queryKeys.files.history(companyId, filePath),
    queryFn: () => filesApi.history(companyId, filePath),
    enabled: versionHighlightOn && renderAsMarkdown && !!filePath && !!contentHash,
    staleTime: 30_000,
  });
  const prevHash = useMemo(() => {
    if (!history || !contentHash) return null;
    const idx = history.findIndex((s) => s.contentHash === contentHash);
    if (idx < 0) return history[0]?.contentHash ?? null;
    return history[idx + 1]?.contentHash ?? null;
  }, [history, contentHash]);
  const { data: prevContent } = useQuery({
    queryKey: queryKeys.files.content(companyId, prevHash ?? ""),
    queryFn: () => filesApi.content(companyId, prevHash!),
    enabled: versionHighlightOn && renderAsMarkdown && !!prevHash,
  });
  const changedHeadingIds = useMemo(() => {
    if (!versionHighlightOn || !renderAsMarkdown) return undefined;
    if (!display || !prevContent) return undefined;
    try {
      return computeChangedHeadings(prevContent.content, display.content);
    } catch {
      return undefined;
    }
  }, [versionHighlightOn, renderAsMarkdown, display, prevContent]);

  return (
    <div
      ref={scrollRef}
      className={cn("overflow-auto", className)}
      role="document"
      aria-label={`Preview of ${filePath}`}
    >
      {loading ? (
        showLoadingIndicator ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading preview…</div>
        ) : null
      ) : contentUnavailable ? (
        fallback ?? (
          <div className="px-4 py-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4" />
              <span className="font-medium text-foreground">Content unavailable</span>
            </div>
            <p className="text-xs leading-relaxed">
              This file version is no longer retrievable. The snapshot may have been
              garbage-collected, or the content hash has been superseded. Reindex or
              open a newer version from history.
            </p>
          </div>
        )
      ) : !display ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No content available.
        </div>
      ) : needsRaw ? (
        <>
          <RawFallbackNotice />
          {renderBody(display, filePath, renderAsMarkdown, bodyClassName, changedHeadingIds)}
        </>
      ) : (
        renderBody(display, filePath, renderAsMarkdown, bodyClassName, changedHeadingIds)
      )}
    </div>
  );
}

function RawFallbackNotice() {
  return (
    <div className="text-xs text-muted-foreground italic px-4 pt-3">
      Showing file from disk — not yet indexed by an agent run.
    </div>
  );
}

function renderBody(
  display: { content: string; isMarkdown: boolean },
  filePath: string,
  asMarkdown: boolean,
  bodyClassName?: string,
  changedHeadingIds?: Set<string>,
) {
  if (asMarkdown) {
    return (
      <MarkdownReader
        filePath={filePath}
        content={display.content}
        changedHeadingIds={changedHeadingIds}
        className={cn("p-4", bodyClassName)}
      />
    );
  }
  // Fallback: simple markdown body if it *looks* markdown (for hosts
  // where MarkdownReader is disabled but we still want readable output).
  if (display.isMarkdown || isMarkdownFile(filePath)) {
    return (
      <div className={cn("prose prose-sm dark:prose-invert max-w-none p-4", bodyClassName)}>
        <MarkdownBody>{display.content}</MarkdownBody>
      </div>
    );
  }
  return (
    <pre
      className={cn(
        "text-xs font-mono bg-[var(--boared-paper-2)] p-4 overflow-x-auto whitespace-pre-wrap break-words",
        bodyClassName,
      )}
    >
      {display.content}
    </pre>
  );
}
