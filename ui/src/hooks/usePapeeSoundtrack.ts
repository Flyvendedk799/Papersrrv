import { useEffect, useRef } from "react";
import { usePapeeOptional } from "@/context/PapeeContext";
import { CUE_URLS, POSE_TO_CUE, type PapeeCue } from "@/lib/papee-soundtrack";

const POOL_SIZE = 8;
const SAME_CUE_DEBOUNCE_MS = 120;

/**
 * PAPEE_TOOLS_PLAN.md §Z.9 — Soundtrack hook.
 *
 * Watches papee.animState transitions; when a pose has a registered
 * cue and `prefs.enableSounds` is true, picks a free <audio> from a
 * pool of 8 and plays it. Same-cue plays within 120ms are dropped to
 * prevent clicky overlaps.
 */
export function usePapeeSoundtrack() {
  const papee = usePapeeOptional();
  const poolRef = useRef<HTMLAudioElement[]>([]);
  const lastFiredAtRef = useRef<Partial<Record<PapeeCue, number>>>({});
  const lastPoseRef = useRef<string | null>(null);

  // Build the pool lazily — only after we know sounds are enabled.
  useEffect(() => {
    if (!papee?.prefs.enableSounds) {
      poolRef.current = [];
      return;
    }
    if (poolRef.current.length > 0) return;
    const pool: HTMLAudioElement[] = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const a = new Audio();
      a.preload = "auto";
      pool.push(a);
    }
    poolRef.current = pool;
  }, [papee?.prefs.enableSounds]);

  useEffect(() => {
    if (!papee) return;
    if (!papee.prefs.enableSounds) return;
    const pose = papee.animState;
    if (pose === lastPoseRef.current) return;
    lastPoseRef.current = pose;

    const cue = POSE_TO_CUE[pose];
    if (!cue) return;

    const now = performance.now();
    const last = lastFiredAtRef.current[cue] ?? -Infinity;
    if (now - last < SAME_CUE_DEBOUNCE_MS) return;
    lastFiredAtRef.current[cue] = now;

    // Find a free audio element (paused or ended); if none, recycle the oldest
    const pool = poolRef.current;
    const free = pool.find((a) => a.paused || a.ended) ?? pool[0];
    if (!free) return;
    try {
      free.src = CUE_URLS[cue];
      free.currentTime = 0;
      void free.play().catch(() => {
        // Browsers may block autoplay before user gesture — silent fallback
      });
    } catch {
      // ignore
    }
  }, [papee?.animState, papee?.prefs.enableSounds]);
}
