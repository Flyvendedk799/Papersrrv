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
          "before:content-[''] before:absolute before:top-0 before:left-0 before:w-8 before:h-8 before:border-t-2 before:border-l-2 before:border-[var(--boared-acid)]/70 before:pointer-events-none",
          "after:content-[''] after:absolute after:bottom-0 after:right-0 after:w-8 after:h-8 after:border-b-2 after:border-r-2 after:border-[var(--boared-acid)]/70 after:pointer-events-none",
          className,
        )}
      >
        <button
          type="button"
          onClick={() => setImmersive(true)}
          title="Open immersive view"
          aria-label="Open immersive graph view"
          className="absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 px-2 py-1 bg-[var(--boared-paper)] border border-[var(--boared-rule)] font-mono text-[0.56rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)] hover:text-[var(--boared-acid)] hover:border-[var(--boared-acid)] transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--boared-acid)]"
        >
          <Maximize2 className="h-3 w-3" aria-hidden="true" />
          Immersive
        </button>
        <CaseGraph
          graph={graph}
          synthesis={synthesis}
          loading={loading}
          className="px-4 pt-4 pb-3 min-h-[560px]"
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
