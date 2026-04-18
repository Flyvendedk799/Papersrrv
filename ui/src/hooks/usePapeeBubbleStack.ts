import { useCallback, useEffect, useState } from "react";
import {
  applyShush,
  EMPTY_STACK,
  makeBubble,
  pruneExpired,
  pushBubble,
  type BubbleSeverity,
  type StackState,
} from "@/lib/papee-bubbles";

/**
 * PAPEE_TOOLS_PLAN.md §Z.7 — bubble stack manager.
 *
 * Sits parallel to the legacy `papee.speechBubble` single-slot bubble.
 * Tools that want stacking + critical preemption call `push()`. The
 * existing `showSpeechBubble()` keeps working unchanged for places that
 * only ever show one transient line.
 */
export function usePapeeBubbleStack() {
  const [state, setState] = useState<StackState>(EMPTY_STACK);

  // Continuous prune so finished bubbles disappear without re-renders
  // depending on the scheduler.
  useEffect(() => {
    if (state.bubbles.length === 0) return;
    const t = setInterval(() => {
      setState((prev) => pruneExpired(prev));
    }, 250);
    return () => clearInterval(t);
  }, [state.bubbles.length]);

  const push = useCallback((text: string, severity: BubbleSeverity = "normal") => {
    setState((prev) => pushBubble(prev, makeBubble(text, severity)));
  }, []);

  const shush = useCallback(() => setState((prev) => applyShush(prev)), []);
  const clear = useCallback(() => setState(EMPTY_STACK), []);

  return { bubbles: state.bubbles, push, shush, clear } as const;
}
