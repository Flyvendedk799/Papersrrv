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
        "relative overflow-hidden border border-[var(--boared-rule)] bg-[var(--boared-paper)]",
        // paper-grain effect via layered radial gradients; subtle
        // but enough to feel textured. renders on every screen with
        // CSS support, noop on legacy.
        "before:absolute before:inset-0 before:pointer-events-none",
        "before:bg-[radial-gradient(circle_at_8%_12%,rgba(0,0,0,0.018),transparent_55%),radial-gradient(circle_at_92%_78%,rgba(0,0,0,0.025),transparent_50%)]",
        "after:absolute after:inset-0 after:pointer-events-none after:opacity-[0.035]",
        "after:bg-[repeating-linear-gradient(45deg,var(--boared-ink)_0px,var(--boared-ink)_1px,transparent_1px,transparent_4px)]",
        className,
      )}
    >
      {/* Top ribbon — kicker + stamp */}
      <div className="relative flex items-start justify-between gap-4 px-6 pt-6 pb-2">
        <div className="flex flex-col gap-1">
          {/* Stamped identifier — feels pressed onto the cover */}
          <div className="inline-flex items-center gap-2">
            <span className="font-mono text-[0.66rem] uppercase tracking-[0.28em] text-[var(--boared-acid)]">
              §
            </span>
            <span className="font-mono text-[0.86rem] uppercase tracking-[0.16em] text-[var(--boared-ink)]">
              {issue.identifier ?? issue.id.slice(0, 8)}
            </span>
          </div>
          <div className="font-mono text-[0.52rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
            Case file · Paperclip register
          </div>
        </div>
        <CaseStamp
          status={issue.status}
          liveNow={hasLiveRuns}
          className="shrink-0 mt-1"
        />
      </div>

      {/* Title — the statement */}
      <div className="relative px-6 pt-3 pb-4">
        <h1
          className={cn(
            "font-serif italic leading-[0.98] tracking-tight text-[var(--boared-ink)]",
            "text-[clamp(2.2rem,5.2vw,3.6rem)]",
            "max-w-[22ch]",
          )}
        >
          <InlineEditor
            value={issue.title}
            onSave={(title) => onUpdate({ title })}
            as="span"
            className="font-serif italic leading-[0.98]"
          />
        </h1>
      </div>

      {/* Abstract — pull-quote with thin left rule and drop cap */}
      <div className="relative px-6 pb-5">
        <div className="border-l-2 border-[var(--boared-acid)]/60 pl-5 py-2 max-w-[62ch]">
          {synthesisQuery.isLoading && !synthesis ? (
            <div className="space-y-2">
              <div className="h-4 w-5/6 bg-[var(--boared-rule)]/50 animate-pulse" />
              <div className="h-4 w-3/4 bg-[var(--boared-rule)]/40 animate-pulse" />
              <div className="h-4 w-1/2 bg-[var(--boared-rule)]/30 animate-pulse" />
            </div>
          ) : synthesis ? (
            <AbstractProse abstract={synthesis.abstract} />
          ) : (
            <p className="font-serif italic text-[1rem] text-[var(--boared-ink-faint)]">
              Couldn't load the summary — the conversation below has
              the full picture.
            </p>
          )}
          {synthesis?.generator === "llm" && (
            <div className="mt-2 inline-flex items-center gap-1 font-mono text-[0.5rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
              <span aria-hidden="true">✦</span>
              Summarised by AI
            </div>
          )}
        </div>
      </div>

      {/* Meta ribbon — under the abstract, smallest type.
       * Dates + live indicator; status stamp is the visible state
       * so we don't repeat it here. */}
      <div className="relative flex items-center gap-3 px-6 py-3 border-t border-[var(--boared-rule)]/60 bg-[var(--boared-paper-2)]/40">
        <span className="font-mono text-[0.56rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
          Opened {ageLabel}
        </span>
        <span aria-hidden="true" className="text-[var(--boared-ink-faint)]">·</span>
        <span className="font-mono text-[0.56rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
          Updated {relativeTime(issue.updatedAt)}
        </span>
        {hasLiveRuns && (
          <>
            <span aria-hidden="true" className="text-[var(--boared-ink-faint)]">·</span>
            <span className="inline-flex items-center gap-1.5 font-mono text-[0.56rem] uppercase tracking-[0.22em] text-[var(--boared-acid)]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--boared-acid)] opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--boared-acid)]" />
              </span>
              Live now
            </span>
          </>
        )}
      </div>
    </header>
  );
}

/** Renders the abstract as a single serif body with a drop-capped
 * first letter. Split to a helper so the typographic effect is
 * isolated and Vite doesn't get upset about the leading whitespace
 * needed for the drop cap. */
function AbstractProse({ abstract }: { abstract: string }) {
  const trimmed = abstract.trim();
  if (!trimmed) return null;
  const first = trimmed[0];
  const rest = trimmed.slice(1);
  return (
    <p className="text-[1.12rem] leading-[1.55] text-[var(--boared-ink)] font-normal">
      <span
        className="float-left font-serif italic text-[3.1rem] leading-[0.85] mr-2 mt-1 text-[var(--boared-acid)]/90"
        aria-hidden="true"
      >
        {first}
      </span>
      <span className="font-serif italic">
        <span className="sr-only">{first}</span>
        {rest}
      </span>
    </p>
  );
}
