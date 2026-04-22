/**
 * CaseHero — the dramatic cover of a case file.
 *
 *     ┌─ paper texture · warm ink ─────────────────────────┐
 *     │  § AIL-230            [stamp: RESOLVED]            │
 *     │                                                     │
 *     │  Engineering: production-ready                      │
 *     │  SnakeGameGodot (Web + desktop)                     │
 *     │                                                     │
 *     │  ╭─ C EO's work is in. Three related cases         │
 *     │  ╰─   resolved along the way. [AI summary]          │
 *     │                                                     │
 *     │  opened 14d ago · updated 2h ago                    │
 *     └─────────────────────────────────────────────────────┘
 *
 * The things that make this feel editorial:
 *   · paper-grain texture backdrop
 *   · huge serif italic title with tight leading
 *   · rubber-stamp status in the top-right
 *   · abstract set as a pull-quote with a thin left rule
 *   · kicker meta tucked UNDER the abstract, not above
 */

import { useQuery } from "@tanstack/react-query";
import type { Issue } from "@paperclipai/shared";
import { issuesApi } from "../../../api/issues";
import { queryKeys } from "../../../lib/queryKeys";
import { cn, relativeTime } from "../../../lib/utils";
import { InlineEditor } from "../../InlineEditor";
import { CaseStamp } from "./CaseStamp";

interface Props {
  issue: Issue;
  hasLiveRuns?: boolean;
  onUpdate: (patch: { title?: string }) => void;
  className?: string;
}

export function CaseHero({ issue, hasLiveRuns, onUpdate, className }: Props) {
  const synthesisQuery = useQuery({
    queryKey: queryKeys.issues.synthesis(issue.id),
    queryFn: () => issuesApi.synthesis(issue.id),
    staleTime: 30_000,
    refetchOnMount: "always",
  });
  const synthesis = synthesisQuery.data ?? null;

  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(issue.createdAt).getTime()) / 86_400_000),
  );
  const ageLabel = ageDays === 0 ? "today" : ageDays === 1 ? "yesterday" : `${ageDays}d old`;

  return (
    <header
      className={cn(
        "relative flex flex-col gap-4",
        className,
      )}
    >
      {/* Identity row — identifier, kind tag, status stamp */}
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 min-w-0">
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.22em] text-[var(--boared-acid)] shrink-0">§</span>
          <span className="font-mono text-[0.78rem] uppercase tracking-[0.14em] text-[var(--boared-ink)] shrink-0">
            {issue.identifier ?? issue.id.slice(0, 8)}
          </span>
          {issue.kind === "planning" && (
            <span className="font-mono text-[0.54rem] uppercase tracking-[0.2em] px-1.5 py-0.5 border border-[var(--boared-acid)] text-[var(--boared-acid)]">
              Plan
            </span>
          )}
        </div>
        <CaseStamp status={issue.status} liveNow={hasLiveRuns} />
      </div>

      {/* Title — tightened to a single clean line, inline-editable. */}
      <h1
        className={cn(
          "font-serif italic leading-[1] tracking-tight text-[var(--boared-ink)]",
          "text-[clamp(1.9rem,4.5vw,3.2rem)]",
          "max-w-[28ch]",
        )}
      >
        <InlineEditor
          value={issue.title}
          onSave={(title) => onUpdate({ title })}
          as="span"
          className="font-serif italic leading-[1]"
        />
      </h1>

      {/* One-line AI summary — compact, no drop cap, no pull quote. */}
      {synthesisQuery.isLoading && !synthesis ? (
        <div className="h-3 w-2/3 bg-[var(--boared-rule)]/50 animate-pulse" />
      ) : synthesis?.abstract ? (
        <p className="text-[0.95rem] leading-[1.5] text-[var(--boared-ink-soft)] max-w-[62ch]">
          {synthesis.abstract}
        </p>
      ) : null}

      {/* Micro-meta */}
      <div className="flex items-center gap-2 font-mono text-[0.52rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)]">
        <span>Opened {ageLabel}</span>
        <span aria-hidden="true">·</span>
        <span>Updated {relativeTime(issue.updatedAt)}</span>
        {hasLiveRuns && (
          <>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 text-[var(--boared-acid)]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--boared-acid)] opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--boared-acid)]" />
              </span>
              Live
            </span>
          </>
        )}
      </div>
    </header>
  );
}

