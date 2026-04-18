import { useCallback, useEffect, useRef } from "react";
import { usePapeeOptional } from "@/context/PapeeContext";
import {
  canFire,
  markFired,
  INTERJECT_TRIGGERS,
  type CooldownLedger,
  type InterjectSeverity,
} from "@/lib/papee-interjections";
import { shouldInterject } from "@/lib/papee-turn-taking";
import { telemetry } from "@/lib/papee-telemetry";

/**
 * PAPEE_TOOLS_PLAN.md §M.6 — Interjection pipeline.
 *
 * Other Papee subsystems call `interject(triggerId, text)`. This hook
 * runs the full pipeline:
 *
 *   1. cooldown check (per-trigger + session-global 20s)
 *   2. turn-taking check (M.5) against current user state
 *   3. muteReactions pref check
 *   4. queue + fire via showSpeechBubble + setAnimState
 *   5. on critical: escalate after 30s if user hasn't reacted (open chat)
 *
 * Tracks: msSinceTyping, msSinceScroll, msSinceInteraction.
 */
export function usePapeeInterjectionPipeline() {
  const papee = usePapeeOptional();
  const papeeRef = useRef(papee);
  papeeRef.current = papee;
  const ledgerRef = useRef<CooldownLedger>({});
  const lastTypingRef = useRef(performance.now());
  const lastScrollRef = useRef(performance.now());
  const lastInteractRef = useRef(performance.now());

  useEffect(() => {
    const onType = () => { lastTypingRef.current = performance.now(); };
    const onScroll = () => { lastScrollRef.current = performance.now(); };
    const onInteract = () => { lastInteractRef.current = performance.now(); };
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        onType();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onInteract);
    window.addEventListener("click", onInteract);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onInteract);
      window.removeEventListener("click", onInteract);
    };
  }, []);

  const interject = useCallback(
    (triggerId: string, text: string) => {
      const papee = papeeRef.current;
      if (!papee || papee.prefs.muteReactions) return false;
      const trigger = INTERJECT_TRIGGERS[triggerId];
      if (!trigger) return false;
      if (!canFire(ledgerRef.current, trigger)) return false;

      const userState = {
        msSinceTyping: performance.now() - lastTypingRef.current,
        msSinceScroll: performance.now() - lastScrollRef.current,
        msSinceInteraction: performance.now() - lastInteractRef.current,
        chatOpen: papee.chatOpen,
      };
      const verdict = shouldInterject(userState, trigger.severity as InterjectSeverity);
      telemetry.log("interject.eval", { triggerId, verdict, severity: trigger.severity });
      if (verdict !== "fire") return false;

      ledgerRef.current = markFired(ledgerRef.current, triggerId);
      telemetry.log("interject.fire", { triggerId, severity: trigger.severity, text: text.slice(0, 120) });

      const isCritical = trigger.severity === "critical";
      // §M.6 escalation level 1 — head-tilt + short bubble
      papee.setAnimState(isCritical ? "alarmed" : "head-tilt");
      papee.showSpeechBubble(text, isCritical ? 5000 : 3500);
      papee.pushBubble(text, isCritical ? "critical" : "normal");

      // §M.6 escalation ladder: track the user's reaction baseline
      const baseline = lastInteractRef.current;
      const userReacted = () => lastInteractRef.current !== baseline;

      // Level 2 (10s) — walk 100px toward cursor
      setTimeout(() => {
        const p = papeeRef.current;
        if (!p || userReacted()) return;
        if (p.position) {
          const cursorEvt = (window as unknown as { __papeeLastCursor?: { x: number; y: number } }).__papeeLastCursor;
          if (cursorEvt) {
            const dx = cursorEvt.x - p.position.x;
            const dy = cursorEvt.y - p.position.y;
            const len = Math.hypot(dx, dy) || 1;
            const step = Math.min(100, len);
            p.setTargetPosition({
              x: p.position.x + (dx / len) * step,
              y: p.position.y + (dy / len) * step,
            });
          }
        }
        p.setAnimState("walking");
      }, 10_000);

      if (isCritical) {
        // Level 3 (20s) — alarmed + longer bubble
        setTimeout(() => {
          const p = papeeRef.current;
          if (!p || userReacted()) return;
          p.setAnimState("alarmed");
          p.pushBubble(`${text} (still waiting)`, "critical");
        }, 20_000);
        // Level 4 (30s) — open the chat panel automatically
        setTimeout(() => {
          const p = papeeRef.current;
          if (!p || userReacted()) return;
          p.setChatOpen(true);
        }, 30_000);
      }
      return true;
    },
    [],
  );

  // Track last cursor position so escalation level 2 can walk toward it
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      (window as unknown as { __papeeLastCursor?: { x: number; y: number } }).__papeeLastCursor = {
        x: e.clientX,
        y: e.clientY,
      };
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return { interject };
}
