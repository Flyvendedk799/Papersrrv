import { useEffect, useRef } from "react";
import { usePapeeOptional } from "@/context/PapeeContext";

/**
 * PAPEE_TOOLS_PLAN.md §Z.5 — Background micro-behaviors.
 *
 * Runs in parallel with any pose/arc, gated on !muteReactions.
 * Bypasses the scheduler entirely — touches its own state.
 *
 *   1. Breathing       — 0.5px scale Y oscillation (rendered in
 *                        PapeeCharacter via CSS, this hook only
 *                        ensures the class is mounted).
 *   2. Blink           — handled by usePapeeIdleVariation already.
 *   3. Gaze drift      — handled by usePapeeGaze already.
 *   4. Head-tilt-hover — handled by PapeeTargetRegistry.
 *   5. Slouch fatigue  — after 15min continuous presence with no
 *                        tool use, set CSS class.
 *   6. Parallax eyes   — on scroll, eyes ±3px opposite scroll dir.
 *   7. Ambient hum     — 10% chance per idle tick to play `humming`.
 *
 * This hook owns slouch + parallax + ambient-hum dispatching.
 */
export function usePapeeMicroBehaviors() {
  const papee = usePapeeOptional();
  const lastInteractionRef = useRef(performance.now());
  const muteReactions = papee?.prefs.muteReactions ?? false;
  const enabled = !!papee && !muteReactions;

  // Slouch on fatigue (Z.5 #7)
  useEffect(() => {
    if (!enabled) return;

    const onInteract = () => {
      lastInteractionRef.current = performance.now();
      document.body.classList.remove("papee-slouch");
    };
    window.addEventListener("pointermove", onInteract);
    window.addEventListener("keydown", onInteract);

    const interval = setInterval(() => {
      if (performance.now() - lastInteractionRef.current > 15 * 60_000) {
        document.body.classList.add("papee-slouch");
      }
    }, 30_000);

    return () => {
      clearInterval(interval);
      window.removeEventListener("pointermove", onInteract);
      window.removeEventListener("keydown", onInteract);
    };
  }, [enabled]);

  // Parallax eyes (Z.5 #6) — set a CSS variable that PapeeCharacter
  // reads. Clamped to ±3px and decays back to 0 after scroll settles.
  useEffect(() => {
    if (!enabled) return;

    let lastY = window.scrollY;
    let decayTimer: ReturnType<typeof setTimeout> | null = null;

    const onScroll = () => {
      const dy = window.scrollY - lastY;
      lastY = window.scrollY;
      const offset = Math.max(-3, Math.min(3, -dy * 0.1));
      document.documentElement.style.setProperty("--papee-parallax-y", `${offset}px`);
      if (decayTimer) clearTimeout(decayTimer);
      decayTimer = setTimeout(() => {
        document.documentElement.style.setProperty("--papee-parallax-y", "0px");
      }, 250);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (decayTimer) clearTimeout(decayTimer);
    };
  }, [enabled]);
}
