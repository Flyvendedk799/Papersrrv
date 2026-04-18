import { useEffect, useRef } from "react";
import { usePapeeOptional } from "@/context/PapeeContext";
import { usePapeeInterjectionPipeline } from "./usePapeeInterjectionPipeline";

/**
 * PAPEE_TOOLS_PLAN.md §M.9 — Proactive summaries.
 *
 * Periodic structured summaries Papee volunteers without being asked,
 * routed through the interjection pipeline so cooldowns + turn-taking
 * apply uniformly.
 *
 * Wired triggers:
 *   - morning_brief    — first login of the local day
 *   - welcome_back     — returning after >1h away
 *   - end-of-session   — visibility-change to hidden + idle (logged
 *                        only; the bubble is suppressed if the tab is
 *                        actually closing).
 *   - post-incident    — see the urgent → calm mood-engine bridge
 *                        (handled in usePapeeMood; this hook listens
 *                        for the transition via a custom window event).
 */
const STORAGE_LAST_LOGIN = "paperclip:papee:lastLoginAt";
const STORAGE_LAST_VISIT = "paperclip:papee:lastVisitAt";

export function usePapeeProactiveSummaries() {
  const papee = usePapeeOptional();
  const { interject } = usePapeeInterjectionPipeline();
  const firedMorningRef = useRef(false);

  // Morning brief + welcome-back on mount
  useEffect(() => {
    if (!papee) return;
    const now = Date.now();
    const lastLoginRaw = localStorage.getItem(STORAGE_LAST_LOGIN);
    const lastVisitRaw = localStorage.getItem(STORAGE_LAST_VISIT);
    const lastLogin = lastLoginRaw ? Number(lastLoginRaw) : 0;
    const lastVisit = lastVisitRaw ? Number(lastVisitRaw) : 0;

    const sameLocalDay =
      lastLogin > 0 &&
      new Date(lastLogin).toDateString() === new Date(now).toDateString();
    if (!sameLocalDay && !firedMorningRef.current) {
      firedMorningRef.current = true;
      setTimeout(() => {
        interject(
          "morning_brief",
          "Morning! A few things changed overnight — want the rundown?",
        );
      }, 4500);
      localStorage.setItem(STORAGE_LAST_LOGIN, String(now));
    }

    if (lastVisit > 0 && now - lastVisit > 60 * 60 * 1000) {
      setTimeout(() => {
        interject("welcome_back", "Welcome back — status still green.");
      }, 6000);
    }
    localStorage.setItem(STORAGE_LAST_VISIT, String(now));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // End-of-session — fire on visibility hidden after 10m idle
  useEffect(() => {
    if (!papee) return;
    let lastInteract = Date.now();
    const onAct = () => {
      lastInteract = Date.now();
    };
    window.addEventListener("pointermove", onAct);
    window.addEventListener("keydown", onAct);
    const onVis = () => {
      if (document.visibilityState === "hidden" && Date.now() - lastInteract > 10 * 60 * 1000) {
        // Bubble may not paint if the tab is unloading; that's fine —
        // the audit log entry inside interject() persists what we tried.
        interject("user_stalled", "Heading out? I'll keep watching.");
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pointermove", onAct);
      window.removeEventListener("keydown", onAct);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Post-incident bridge — listen for a custom event the mood engine fires
  // when transitioning urgent → calm. (Wired in usePapeeMood as needed.)
  useEffect(() => {
    if (!papee) return;
    const onCleared = () => {
      interject("run_failed", "All clear. Want a recap of what just happened?");
    };
    window.addEventListener("papee:incident-cleared", onCleared);
    return () => window.removeEventListener("papee:incident-cleared", onCleared);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
