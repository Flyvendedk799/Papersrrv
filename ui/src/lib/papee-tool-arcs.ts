import type { PapeeAnimState } from "@/components/papee/PapeeSprites";

/**
 * A narrative arc for a single Papee tool call (PAPEE_TOOLS_PLAN.md
 * Phase Z.3). Each beat is a pose plus optional speech bubble.
 *
 * `runToolArc(papee, arc, beat)` is a thin helper so usePapeeEnact
 * stays declarative — extend the per-tool arc table in usePapeeEnact,
 * not this file.
 */

export type ArcBeat = "pre" | "during" | "success" | "error";

export interface ArcStep {
  pose: PapeeAnimState;
  speech?: string;
  durationMs?: number;
}

export interface ToolArc {
  pre: ArcStep;
  during: ArcStep;
  success: ArcStep;
  error: ArcStep;
  /** Optional title shown in the tier-2 confirm modal. */
  confirmTitle?: string;
}

interface PapeeLike {
  setAnimState: (s: PapeeAnimState) => void;
  showSpeechBubble: (text: string, durationMs?: number) => void;
}

const DEFAULT_BEAT_HOLD: Record<ArcBeat, number> = {
  pre: 600,
  during: 1200,
  success: 1500,
  error: 1800,
};

export function runToolArc(papee: PapeeLike, arc: ToolArc, beat: ArcBeat) {
  const step = arc[beat];
  if (!step) return;
  papee.setAnimState(step.pose);
  if (step.speech) {
    papee.showSpeechBubble(step.speech, step.durationMs ?? DEFAULT_BEAT_HOLD[beat]);
  }
}
