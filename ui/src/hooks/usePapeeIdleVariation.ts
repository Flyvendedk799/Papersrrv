import { useEffect, useRef } from "react";
import { usePapeeOptional } from "../context/PapeeContext";
import { usePapeeNavigation } from "./usePapeePosition";
import { getPagePersonality } from "../lib/papee-personality";

/**
 * Runs idle sub-animations (blink, look-around) at frequencies determined by
 * the current page's personality. Replaces the hardcoded intervals that used
 * to live inline in PapeeContext.
 */
export function usePapeeIdleVariation() {
  const papee = usePapeeOptional();
  const pageInfo = usePapeeNavigation();
  const blinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blinkResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mirror papee into a ref so the scheduling effect doesn't re-run on every
  // animState change. Timers check papeeRef.current.animState at fire time.
  const papeeRef = useRef(papee);
  papeeRef.current = papee;

  const muteReactions = papee?.prefs.muteReactions ?? false;

  useEffect(() => {
    if (muteReactions) return;

    const personality = getPagePersonality(pageInfo.page);

    function scheduleBlink() {
      const variance = personality.blinkIntervalMs * 0.3;
      const delay = personality.blinkIntervalMs + (Math.random() * 2 - 1) * variance;
      blinkTimerRef.current = setTimeout(() => {
        const p = papeeRef.current;
        if (p && p.animState === "idle") {
          p.setAnimState("idle-blink");
          blinkResetRef.current = setTimeout(() => {
            const pp = papeeRef.current;
            if (pp && pp.animState === "idle-blink") pp.setAnimState("idle");
          }, 180);
        }
        scheduleBlink();
      }, Math.max(500, delay));
    }

    function scheduleLookAround() {
      const variance = personality.lookAroundIntervalMs * 0.4;
      const delay = personality.lookAroundIntervalMs + (Math.random() * 2 - 1) * variance;
      lookTimerRef.current = setTimeout(() => {
        const p = papeeRef.current;
        if (p && p.animState === "idle") {
          p.setAnimState("idle-look-around");
          lookResetRef.current = setTimeout(() => {
            const pp = papeeRef.current;
            if (pp && pp.animState === "idle-look-around") pp.setAnimState("idle");
          }, 1200);
        }
        scheduleLookAround();
      }, Math.max(1000, delay));
    }

    scheduleBlink();
    scheduleLookAround();

    return () => {
      if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current);
      if (lookTimerRef.current) clearTimeout(lookTimerRef.current);
      if (blinkResetRef.current) clearTimeout(blinkResetRef.current);
      if (lookResetRef.current) clearTimeout(lookResetRef.current);
    };
  }, [pageInfo.page, muteReactions]);
}