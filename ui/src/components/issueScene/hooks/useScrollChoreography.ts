/* ─────────────────────────────────────────────────────────────────────
 *  useScrollChoreography — ties scene camera to case-file scroll.
 *
 *  Sets up an IntersectionObserver over the anchor ids listed in the
 *  current chapters. Whichever anchor is "most in view" becomes the
 *  active chapter. Active chapter → camera pose is emitted via the
 *  returned `targetPose` state so IssueScene can feed it into the
 *  CameraChoreographer.
 *
 *  Also returns `activeKey` so the Companion can scroll-spy highlight
 *  the current chapter in its TOC.
 *
 *  Respects `prefers-reduced-motion`: reads the pref once and, when
 *  set, does NOT emit camera poses on scroll — only activeKey. The
 *  user still gets TOC highlighting without motion sickness.
 *
 *  Debounced: at most one pose change per 450ms.
 * ───────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Chapter } from "../data/chapters";
import type { CameraPoseKey } from "../scene/cinematography";

interface UseScrollChoreographyOptions {
  /** Source of truth for which anchors to observe. */
  chapters: Chapter[];
  /** Disable camera emission (e.g. while the guided tour is running). */
  suspended?: boolean;
  /** Debounce window between pose changes. Default 450ms. */
  debounceMs?: number;
}

interface UseScrollChoreographyResult {
  /** Pose IssueScene should animate toward. Null at first. */
  targetPose: CameraPoseKey | null;
  /** Key of the currently-active chapter (for TOC highlighting). */
  activeKey: Chapter["key"] | null;
}

export function useScrollChoreography({
  chapters,
  suspended = false,
  debounceMs = 450,
}: UseScrollChoreographyOptions): UseScrollChoreographyResult {
  const [activeKey, setActiveKey] = useState<Chapter["key"] | null>(null);
  const [targetPose, setTargetPose] = useState<CameraPoseKey | null>(null);

  const reducedMotionRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reducedMotionRef.current = mq.matches;
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  /* We build a map of anchorId → chapter so the IO callback can look up
   * which chapter an entry belongs to in O(1). */
  const byAnchor = useMemo(() => {
    const m = new Map<string, Chapter>();
    for (const ch of chapters) m.set(ch.anchorId, ch);
    return m;
  }, [chapters]);

  const lastEmitRef = useRef(0);
  const pendingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    if (chapters.length === 0) return;

    const elements: HTMLElement[] = [];
    for (const ch of chapters) {
      const el = document.getElementById(ch.anchorId);
      if (el) elements.push(el);
    }
    if (elements.length === 0) return;

    /* Keep a rolling "which anchor is most visible" tally. IO gives us
     * intersectionRatio per entry; we pick the entry whose top is
     * closest to (but past) the top of the viewport with ratio > 0. */
    const visibilityMap = new Map<string, number>();

    const apply = () => {
      // Find the anchor with the highest currently-observed ratio.
      let best: { id: string; ratio: number } | null = null;
      for (const [id, ratio] of visibilityMap) {
        if (ratio <= 0) continue;
        if (!best || ratio > best.ratio) best = { id, ratio };
      }
      if (!best) return;
      const ch = byAnchor.get(best.id);
      if (!ch) return;

      if (ch.key !== activeKey) {
        setActiveKey(ch.key);

        if (!suspended && !reducedMotionRef.current) {
          // Debounce pose emissions.
          const now = performance.now();
          const elapsed = now - lastEmitRef.current;
          const doEmit = () => {
            setTargetPose(ch.pose);
            lastEmitRef.current = performance.now();
          };
          if (elapsed >= debounceMs) {
            doEmit();
          } else {
            if (pendingTimerRef.current !== null) {
              window.clearTimeout(pendingTimerRef.current);
            }
            pendingTimerRef.current = window.setTimeout(
              doEmit,
              debounceMs - elapsed,
            );
          }
        }
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).id;
          if (!id) continue;
          visibilityMap.set(id, e.intersectionRatio);
        }
        apply();
      },
      {
        /* Give the top of the viewport a bit of slack so the active
         * chapter is the one the user is actually reading, not just
         * the one scrolling past. */
        rootMargin: "-20% 0px -50% 0px",
        threshold: [0, 0.1, 0.3, 0.6, 1],
      },
    );

    for (const el of elements) observer.observe(el);

    return () => {
      observer.disconnect();
      if (pendingTimerRef.current !== null) {
        window.clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters, suspended, debounceMs]);

  return { targetPose, activeKey };
}
