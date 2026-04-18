/**
 * Smart markdown reader (backlog 2.0 C4a + C4b).
 *
 * Wraps the existing MarkdownBody renderer and layers:
 *   - auto-generated sticky TOC from headings
 *   - overview strip (title, estimated read time)
 *   - heading-level in-page jump (#anchor)
 *   - optional version-aware highlighting (C4b) for changed sections
 *   - graceful fallback if rendering fails
 *
 * Intentionally a thin, self-contained component so it can be reused
 * by Files preview, Issue preview, and the full modal.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { MarkdownBody } from "./MarkdownBody";
import { cn } from "../lib/utils";
import { useFeatureFlag } from "../lib/featureFlags";
import { markFilePerf } from "../lib/filePerf";

interface HeadingEntry {
  level: number;
  text: string;
  id: string;
}

export interface MarkdownReaderProps {
  filePath: string;
  content: string;
  className?: string;
  /** Set of heading slug ids changed between two versions (C4b). */
  changedHeadingIds?: Set<string>;
  /** Optional sidebar layout; defaults to inline if false. */
  showToc?: boolean;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function extractHeadings(md: string): HeadingEntry[] {
  const out: HeadingEntry[] = [];
  const seen = new Map<string, number>();
  // Ignore code blocks
  const lines = md.split("\n");
  let inFence = false;
  for (const raw of lines) {
    const fence = raw.match(/^```/);
    if (fence) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = raw.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const text = m[2].replace(/`/g, "").trim();
    let slug = slugify(text);
    if (!slug) slug = `h-${out.length + 1}`;
    const used = seen.get(slug) ?? 0;
    seen.set(slug, used + 1);
    if (used > 0) slug = `${slug}-${used}`;
    out.push({ level: m[1].length, text, id: slug });
  }
  return out;
}

function estimateReadTime(text: string): string {
  const words = text.trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.round(words / 220));
  return `${minutes} min read`;
}

export function MarkdownReader({
  filePath,
  content,
  className,
  changedHeadingIds,
  showToc: showTocProp,
}: MarkdownReaderProps) {
  const versionHighlightOn = useFeatureFlag("markdown_version_highlight");
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const headings = useMemo(() => {
    try { return extractHeadings(content); }
    catch { return []; }
  }, [content]);

  const readTime = useMemo(() => estimateReadTime(content), [content]);
  const title = useMemo(() => {
    const first = headings.find((h) => h.level === 1);
    if (first) return first.text;
    const base = filePath.split(/[\\/]/).pop() ?? filePath;
    return base.replace(/\.(md|mdx|markdown)$/i, "");
  }, [headings, filePath]);

  const autoShowToc = showTocProp ?? headings.length >= 4;

  // Assign IDs to headings in DOM for anchor nav (post-render).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const t0 = performance.now();
    try {
      const nodes = Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6"));
      const seen = new Map<string, number>();
      nodes.forEach((node) => {
        const text = (node.textContent ?? "").trim();
        let slug = slugify(text);
        if (!slug) slug = `h-${nodes.indexOf(node) + 1}`;
        const used = seen.get(slug) ?? 0;
        seen.set(slug, used + 1);
        if (used > 0) slug = `${slug}-${used}`;
        (node as HTMLElement).id = slug;
        if (versionHighlightOn && changedHeadingIds?.has(slug)) {
          (node as HTMLElement).setAttribute("data-changed", "true");
        } else {
          (node as HTMLElement).removeAttribute("data-changed");
        }
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      markFilePerf("markdown_render", performance.now() - t0, {
        filePath,
        bytes: content.length,
      });
    }
  }, [content, filePath, changedHeadingIds, versionHighlightOn]);

  return (
    <div className={cn("markdown-reader", className)} role="document">
      {/* Overview strip */}
      <div className="mb-4 pb-3 border-b border-[var(--boared-rule)]">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-lg font-semibold leading-snug text-foreground m-0">
            {title}
          </h1>
          <span className="font-mono uppercase tracking-[0.08em] text-[0.58rem] text-muted-foreground shrink-0">
            {readTime}
          </span>
          {versionHighlightOn && changedHeadingIds && changedHeadingIds.size > 0 && (
            <span className="font-mono uppercase tracking-[0.08em] text-[0.58rem] text-[var(--boared-acid)] shrink-0">
              {changedHeadingIds.size} section{changedHeadingIds.size !== 1 ? "s" : ""} changed
            </span>
          )}
        </div>
        <p className="mt-1 text-[11px] font-mono text-muted-foreground truncate">{filePath}</p>
      </div>

      <div className={cn("flex gap-6", autoShowToc ? "flex-col md:flex-row" : "flex-col")}>
        {autoShowToc && headings.length > 0 && (
          <aside
            className="md:w-48 md:shrink-0 md:sticky md:top-4 md:self-start"
            aria-label="Table of contents"
          >
            <div className="font-mono uppercase tracking-[0.08em] text-[0.58rem] text-muted-foreground mb-2">
              Contents
            </div>
            <ul className="space-y-0.5 text-[12px]">
              {headings.map((h) => (
                <li key={h.id} style={{ paddingLeft: `${(h.level - 1) * 8}px` }}>
                  <a
                    href={`#${h.id}`}
                    className={cn(
                      "block truncate hover:text-foreground transition-colors",
                      changedHeadingIds?.has(h.id)
                        ? "text-[var(--boared-acid)]"
                        : "text-muted-foreground",
                    )}
                    onClick={(e) => {
                      e.preventDefault();
                      const el = document.getElementById(h.id);
                      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </aside>
        )}

        <div ref={rootRef} className="flex-1 min-w-0 prose prose-sm dark:prose-invert max-w-none markdown-reader-body">
          <MarkdownBody>{content}</MarkdownBody>
          {error && (
            <p className="text-xs text-muted-foreground italic mt-4">
              Some markdown failed to render cleanly: {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
