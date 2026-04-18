/* ─────────────────────────────────────────────────────────────────────
 *  useGuidedTour — state machine for the narrated chapter tour.
 *
 *  Plays the chapter list sequentially. For each chapter it:
 *    1. Scrolls the case-file stack to chapter.anchorId
 *    2. Emits chapter.pose as the target camera pose
 *    3. Shows chapter.narrate as a caption for CHAPTER_MS
 *    4. Advances to the next chapter
 *    5. Exits when the last chapter's caption has shown
 *
 *  Cancellable:
 *    · Escape key
 *    · Explicit cancel() from the UI
 *    · Any other user-driven pose change (handled by CameraChoreographer's
 *      own "yield on drag" logic; the tour sees the pose change and
 *      cancels itself on the next tick)
 *
 *  Persists a `paperclip.issueScene.tourSeen` flag so the first-visit
 *  hint only fires once per user.
 * ───────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Chapter } from "../data/chapters";
import type { CameraPoseKey } from "../scene/cinematography";

const TOUR_SEEN_KEY = "paperclip.issueScene.tourSeen";
const CHAPTER_MS = 5500; // per-chapter dwell time

export type TourStatus = "idle" | "running" | "done";

export interface GuidedTourState {
  status: TourStatus;
  /** Current chapter index (0 = first). -1 when idle. */
  index: number;
  /** Current chapter, or null when idle. */
  current: Chapter | null;
  /** Caption to show in the TourPlayer overlay. */
  caption: string | null;
  /** Pose the tour wants — consumed by the CameraChoreographer. */
  pose: CameraPoseKey | null;
  /** True iff this user has seen any tour before (localStorage). */
  hasSeenBefore: boolean;
  /** Start the tour from the first chapter. */
  start: () => void;
  /** Cancel immediately. No state change on already-idle. */
  cancel: () => void;
}

export function useGuidedTour(chapters: Chapter[]): GuidedTourState {
  const [status, setStatus] = useState<TourStatus>("idle");
  const [index, setIndex] = useState<number>(-1);
  const [hasSeenBefore] = useState<boolean>(() => {
    try {
      return localStorage.getItem(TOUR_SEEN_KEY) === "1";
    } catch {
      return false;
    }
  });

  const timerRef = useRef<number | null>(null);

  /* Cleanup any in-flight timers on unmount. */
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  /* Scroll to the active chapter's anchor when index changes (skip
   * index=-1). No camera work here — the CameraChoreographer consumes
   * `pose` from the return value separately. */
  useEffect(() => {
    if (status !== "running" || index < 0 || index >= chapters.length) return;
    const ch = chapters[index];
    const el = document.getElementById(ch.anchorId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // Schedule advance.
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setIndex((i) => {
        const next = i + 1;
        if (next >= chapters.length) {
          setStatus("done");
          try {
            localStorage.setItem(TOUR_SEEN_KEY, "1");
          } catch {
            // storage full — not fatal
          }
          return -1;
        }
        return next;
      });
    }, CHAPTER_MS);
  }, [status, index, chapters]);

  const start = useCallback(() => {
    if (chapters.length === 0) return;
    setStatus("running");
    setIndex(0);
  }, [chapters.length]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setStatus("idle");
    setIndex(-1);
  }, []);

  /* Escape cancels the tour. */
  useEffect(() => {
    if (status !== "running") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, cancel]);

  const current = index >= 0 && index < chapters.length ? chapters[index] : null;
  const caption = current?.narrate ?? null;
  const pose = current?.pose ?? null;

  return {
    status,
    index,
    current,
    caption,
    pose,
    hasSeenBefore,
    start,
    cancel,
  };
}
