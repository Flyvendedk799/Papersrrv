/**
 * ImmersiveGraphFrame — hosts the Neurolayer thought-space for an
 * issue's "How it got here" chapter, with:
 *   · acid corner accents that treat the scene like a framed artwork
 *   · an "Immersive" button that takes the scene full-viewport
 *   · a taller default min-height so the 3D scene has room to breathe
 *
 * The actual renderer is <CaseBrainGraph/>, which iframes the vanilla
 * Three.js app under ui/public/neurolayer/ and posts it a normalized
 * CASE built from the issue's comments/runs/activity/children.
 */

import { useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import type {
  ActivityEvent,
  Agent,
  Issue,
  IssueComment,
} from "@paperclipai/shared";
import type { RunForIssue } from "../../../api/activity";
import { CaseBrainGraph } from "./CaseBrainGraph";
import { cn } from "../../../lib/utils";

interface Props {
  issue: Issue;
  comments?: IssueComment[];
  activity?: ActivityEvent[];
  childIssues?: Issue[];
  linkedRuns?: RunForIssue[];
  agentMap: Map<string, Agent>;
  loading?: boolean;
  className?: string;
  /** Toggles the "Live" badge when the issue has in-flight runs. */
  live?: boolean;
}

export function ImmersiveGraphFrame({
  issue,
  comments,
  activity,
  childIssues,
  linkedRuns,
  agentMap,
  loading,
  className,
  live,
}: Props) {
  const [immersive, setImmersive] = useState(false);

  useEffect(() => {
    if (!immersive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setImmersive(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [immersive]);

  /* Shared bundle we thread into both mount points. Same object
   * identity is fine — buildNeurolayerCase memoizes downstream. */
  const brainProps = {
    issue,
    comments,
    activity,
    childIssues,
    linkedRuns,
    agentMap,
    loading,
    live,
  };

  return (
    <>
      <div
        className={cn(
          "relative border border-[var(--boared-rule)] bg-[#1A1815] overflow-hidden",
          // Top-left acid bracket — framed artwork cue.
          "after:content-[''] after:absolute after:top-0 after:left-0 after:w-10 after:h-10 after:border-t-2 after:border-l-2 after:border-[var(--boared-acid)]/80 after:pointer-events-none",
          className,
        )}
      >
        {/* Bottom-right bracket */}
        <span
          aria-hidden="true"
          className="absolute bottom-0 right-0 w-10 h-10 border-b-2 border-r-2 border-[var(--boared-acid)]/80 pointer-events-none z-[1]"
        />
        <button
          type="button"
          onClick={() => setImmersive(true)}
          title="Open immersive view"
          aria-label="Open immersive graph view"
          className="absolute top-3 right-3 z-[2] inline-flex items-center gap-1.5 px-2 py-1 bg-[#1A1815]/85 border border-[#F2E6C4]/25 font-mono text-[0.56rem] uppercase tracking-[0.14em] text-[#F2E6C4]/70 hover:text-[var(--boared-acid)] hover:border-[var(--boared-acid)] transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]"
        >
          <Maximize2 className="h-3 w-3" aria-hidden="true" />
          Immersive
        </button>
        <CaseBrainGraph {...brainProps} minHeight={640} />
      </div>

      {immersive && (
        <div
          className="fixed inset-0 z-[90] bg-[#1A1815] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Immersive case thought-space"
        >
          <header className="flex items-center justify-between px-6 py-3 border-b border-[#F2E6C4]/15">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--boared-acid)]">
                Chapter · How it got here
              </span>
              <span className="font-mono text-[0.54rem] uppercase tracking-[0.18em] text-[#F2E6C4]/55">
                {issue.identifier ?? issue.id.slice(0, 8)} · {issue.title}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setImmersive(false)}
              title="Close (Esc)"
              aria-label="Close immersive graph view"
              className="inline-flex items-center gap-1.5 px-2 py-1 border border-[#F2E6C4]/25 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-[#F2E6C4]/70 hover:text-[#F2E6C4] hover:border-[#F2E6C4] transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]"
            >
              <Minimize2 className="h-3 w-3" aria-hidden="true" />
              Close · Esc
            </button>
          </header>
          <div className="flex-1 min-h-0 overflow-hidden">
            <CaseBrainGraph
              {...brainProps}
              className="h-full"
              minHeight={0}
            />
          </div>
        </div>
      )}
    </>
  );
}
