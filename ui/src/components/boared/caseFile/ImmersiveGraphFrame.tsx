/**
 * ImmersiveGraphFrame — wraps <CaseGraph/> with:
 *   · acid corner accents that treat the graph like a framed artwork
 *   · an "Enter immersive" button that takes the graph full-viewport
 *     (fixed, covers the page until Escape / close)
 *   · a taller default min-height so the graph isn't cramped
 *
 * Keeps the underlying CaseGraph unchanged; this is a presentational
 * skin + a portal-less fullscreen overlay.
 */

import { useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import type { CaseSynthesisPayload } from "../../../api/issues";
import { CaseGraph } from "./CaseGraph";
import { cn } from "../../../lib/utils";

interface Props {
  graph: CaseSynthesisPayload["graph"];
  synthesis?: CaseSynthesisPayload | null;
  loading?: boolean;
  className?: string;
}

export function ImmersiveGraphFrame({
  graph,
  synthesis,
  loading,
  className,
}: Props) {
  const [immersive, setImmersive] = useState(false);

  useEffect(() => {
    if (!immersive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setImmersive(false);
    };
    window.addEventListener("keydown", onKey);
    // Prevent background scrolling while immersive.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [immersive]);

  return (
    <>
      <div
        className={cn(
          "relative border border-[var(--boared-rule)] bg-[var(--boared-paper)] overflow-hidden",
          // Ambient glow so the graph feels lit from within rather
          // than flat on paper.
          "before:content-[''] before:absolute before:inset-0 before:pointer-events-none",
          "before:bg-[radial-gradient(ellipse_at_center,rgba(226,50,50,0.05)_0%,transparent_60%)]",
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
        {/* Edge fades so the graph feels like it continues
         * off-frame instead of getting clipped at a hard border. */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-16 z-[1] pointer-events-none"
          style={{
            background:
              "linear-gradient(to right, var(--boared-paper), transparent)",
          }}
        />
        <span
          aria-hidden="true"
          className="absolute inset-y-0 right-0 w-16 z-[1] pointer-events-none"
          style={{
            background:
              "linear-gradient(to left, var(--boared-paper), transparent)",
          }}
        />
        <button
          type="button"
          onClick={() => setImmersive(true)}
          title="Open immersive view"
          aria-label="Open immersive graph view"
          className="absolute top-3 right-3 z-[2] inline-flex items-center gap-1.5 px-2 py-1 bg-[var(--boared-paper)] border border-[var(--boared-rule)] font-mono text-[0.56rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-acid)] hover:border-[var(--boared-acid)] transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]"
        >
          <Maximize2 className="h-3 w-3" aria-hidden="true" />
          Immersive
        </button>
        <CaseGraph
          graph={graph}
          synthesis={synthesis}
          loading={loading}
          className="px-6 pt-5 pb-4 min-h-[640px]"
        />
      </div>

      {immersive && (
        <div
          className="fixed inset-0 z-[90] bg-[var(--boared-paper)] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Immersive case graph"
        >
          <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--boared-rule)]">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--boared-acid)]">
                Chapter · How it got here
              </span>
              <span className="font-mono text-[0.54rem] uppercase tracking-[0.18em] text-[var(--boared-ink-faint)]">
                {graph.nodes.length} {graph.nodes.length === 1 ? "step" : "steps"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setImmersive(false)}
              title="Close (Esc)"
              aria-label="Close immersive graph view"
              className="inline-flex items-center gap-1.5 px-2 py-1 border border-[var(--boared-rule)] font-mono text-[0.58rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)] hover:border-[var(--boared-ink)] transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]"
            >
              <Minimize2 className="h-3 w-3" aria-hidden="true" />
              Close · Esc
            </button>
          </header>
          <div className="flex-1 min-h-0 overflow-hidden">
            <CaseGraph
              graph={graph}
              synthesis={synthesis}
              loading={loading}
              className="h-full px-6 py-4"
            />
          </div>
        </div>
      )}
    </>
  );
}
