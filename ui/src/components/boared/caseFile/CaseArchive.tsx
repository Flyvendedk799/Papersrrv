/**
 * CaseArchive — single bottom surface that folds Files, Activity,
 * Attachments, and Approvals into tabs.
 *
 * Replaces four separate bottom chapters. Tabs appear only when
 * their tab has content (so an issue without attachments doesn't
 * see an empty "Attachments" tab). The first tab with content is
 * auto-active.
 *
 * Presentation is a flat bar with mono-caps tab labels and a count
 * pill. Active tab gets an acid underline. Content renders below.
 */

import { useMemo, useState } from "react";
import { cn } from "../../../lib/utils";

export interface ArchiveTab {
  /** Stable key, used for active-tab state and URL anchor. */
  id: string;
  /** Mono-caps label, e.g. "Files". */
  label: string;
  /** Optional count, rendered after the label in mono. */
  count?: number;
  /** Tab is rendered only if `show` is true. */
  show: boolean;
  /** Lazy content renderer — only called when the tab is active. */
  render: () => React.ReactNode;
  /** Optional action rendered inline on the right of the tab bar. */
  action?: React.ReactNode;
}

export function CaseArchive({
  tabs,
  className,
}: {
  tabs: ArchiveTab[];
  className?: string;
}) {
  const visible = useMemo(() => tabs.filter((t) => t.show), [tabs]);
  const [activeId, setActiveId] = useState<string | null>(
    visible[0]?.id ?? null,
  );
  // Reset active when visibility changes (e.g., attachments just
  // appeared / disappeared).
  const effectiveActive =
    visible.find((t) => t.id === activeId)?.id ?? visible[0]?.id ?? null;

  if (visible.length === 0) return null;

  const active = visible.find((t) => t.id === effectiveActive);

  return (
    <section
      id="chapter-archive"
      className={cn(
        "scroll-mt-20 border-t border-[var(--boared-rule)] pt-5",
        className,
      )}
    >
      {/* Tab bar */}
      <nav
        role="tablist"
        aria-label="Case archive"
        className="flex items-center gap-0 mb-4 border-b border-[var(--boared-rule)]"
      >
        {visible.map((t) => {
          const isActive = t.id === effectiveActive;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => setActiveId(t.id)}
              className={cn(
                "group/tab relative inline-flex items-center gap-1.5 py-2.5 px-3 font-mono text-[0.62rem] uppercase tracking-[0.18em] transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]",
                isActive
                  ? "text-[var(--boared-ink)]"
                  : "text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)]",
              )}
            >
              {t.label}
              {typeof t.count === "number" && t.count > 0 && (
                <span
                  className={cn(
                    "tabular-nums text-[0.56rem]",
                    isActive
                      ? "text-[var(--boared-acid)]"
                      : "text-[var(--boared-ink-faint)]",
                  )}
                >
                  {t.count}
                </span>
              )}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-0 right-0 -bottom-px h-[2px] transition-opacity",
                  isActive
                    ? "opacity-100 bg-[var(--boared-acid)]"
                    : "opacity-0",
                )}
              />
            </button>
          );
        })}
        <span aria-hidden="true" className="flex-1" />
        {active?.action && <span className="shrink-0 pr-2">{active.action}</span>}
      </nav>

      {/* Active panel */}
      <div
        role="tabpanel"
        aria-labelledby={`tab-${active?.id ?? ""}`}
        className="min-h-[40px]"
      >
        {active?.render()}
      </div>
    </section>
  );
}
