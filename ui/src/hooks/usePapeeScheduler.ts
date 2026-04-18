import { useEffect, useRef } from "react";
import { usePapeeOptional } from "@/context/PapeeContext";
import { PapeeAnimationScheduler, type Priority } from "@/lib/papee-scheduler";
import { pickIdlePose } from "@/lib/papee-idle-pool";
import { usePapeeNavigation } from "./usePapeePosition";
import { usePapeeLayoutAwareness } from "./usePapeeLayoutAwareness";
import { PAGE_STATIONS, resolveStation } from "@/lib/papee-stations";
import { telemetry } from "@/lib/papee-telemetry";
import type { PapeeAnimState } from "@/components/papee/PapeeSprites";

// Match the movement engine's clamp footprint (72x80), not the raw
// sprite box (56x72). The sprite's SVG viewBox extends a few pixels
// beyond the render box, and the movement engine reserves 72/80
// around the edges — using those here keeps targets strictly inside
// both the safe zone AND the movement clamp.
const PAPEE_CHAR_SIZE = { width: 72, height: 80 };
const SAFE_MARGIN = 8;

/** Poses that imply lateral movement — drive a setTargetPosition alongside. */
const MOVING_POSES: ReadonlySet<PapeeAnimState> = new Set([
  "walking",
  "pacing",
  "jumping",
  "celebrating",
]);

/**
 * PAPEE_TOOLS_PLAN.md §Z.6 — wires the central scheduler to the
 * Papee context.
 *
 * Uses a ref to the live context so the setup effect doesn't tear
 * down on every setAnimState. Deps are kept to a stable
 * `(page, muteReactions)` pair exactly like usePapeeIdleVariation does.
 */
export function usePapeeScheduler() {
  const papee = usePapeeOptional();
  const pageInfo = usePapeeNavigation();
  const { safeZone, isMobile } = usePapeeLayoutAwareness();
  const schedulerRef = useRef<PapeeAnimationScheduler | null>(null);
  const recentRef = useRef<string[]>([]);
  const pageStartRef = useRef(performance.now());
  const patrolIdxRef = useRef(0);
  /** PAPEE_TOOLS_PLAN.md — Papee is almost always pacing. Direction
   *  flips between 'right' and 'left' at each edge. */
  const paceDirRef = useRef<"right" | "left">("right");

  // Mirror live context into a ref so the effect body reads fresh state
  // without re-running on every animState change.
  const papeeRef = useRef(papee);
  papeeRef.current = papee;
  const pageRef = useRef(pageInfo.page);
  pageRef.current = pageInfo.page;
  const safeZoneRef = useRef(safeZone);
  safeZoneRef.current = safeZone;

  const muteReactions = papee?.prefs.muteReactions ?? false;

  useEffect(() => {
    pageStartRef.current = performance.now();
  }, [pageInfo.page]);

  useEffect(() => {
    if (!papeeRef.current) return;
    if (muteReactions) return;
    if (isMobile) return;

    /** Pick the next pose from the mood × page weighted pool. */
    const tickPose = () => {
      const p = papeeRef.current;
      if (!p) return;
      return pickIdlePose({
        mood: p.mood,
        page: pageRef.current,
        msOnPage: performance.now() - pageStartRef.current,
        hour: new Date().getHours(),
        recent: recentRef.current as never[],
      });
    };

    /**
     * The default pacing destination — bounces Papee between the
     * left edge and the right edge of the safe zone. Flips
     * `paceDirRef` once per call.
     *
     * Fallback path: if the safe zone is too narrow for horizontal
     * pacing (e.g. issue-detail with a wide right panel), we fall
     * back to the raw viewport so Papee can still traverse the full
     * window width even if he has to cross the panel.
     *
     * Y target: a fresh pick in the lower 60% of the available
     * height, with ±8px jitter — keeps him grounded and avoids
     * getting stuck at top/bottom edges.
     */
    const paceDestination = (): { x: number; y: number } | null => {
      telemetry.log("pace.enter", { hasZone: !!safeZoneRef.current });
      const zone = safeZoneRef.current;
      if (!zone) {
        telemetry.log("pace.bail", { reason: "no-zone" });
        return null;
      }

      // Authoritative viewport bounds.
      const vpMinX = SAFE_MARGIN;
      const vpMinY = SAFE_MARGIN;
      const vpMaxX = Math.max(0, window.innerWidth - PAPEE_CHAR_SIZE.width - SAFE_MARGIN);
      const vpMaxY = Math.max(0, window.innerHeight - PAPEE_CHAR_SIZE.height - SAFE_MARGIN);

      // Safe-zone bounds (may be narrower than viewport).
      const zoneMinX = Math.max(vpMinX, zone.left);
      const zoneMinY = Math.max(vpMinY, zone.top);
      const zoneMaxX = Math.min(vpMaxX, zone.right - PAPEE_CHAR_SIZE.width);
      const zoneMaxY = Math.min(vpMaxY, zone.bottom - PAPEE_CHAR_SIZE.height);

      // Horizontal room check. If the safe zone is too narrow (under
      // 200px of travel), fall back to the raw viewport so he still
      // paces even if the panel visually overlaps him.
      const hasZoneRoom = zoneMaxX - zoneMinX > 200;
      const minX = hasZoneRoom ? zoneMinX : vpMinX;
      const maxX = hasZoneRoom ? zoneMaxX : vpMaxX;
      const minY = hasZoneRoom ? zoneMinY : vpMinY;
      const maxY = hasZoneRoom ? zoneMaxY : vpMaxY;

      if (maxX <= minX + 20 || maxY <= minY + 20) {
        telemetry.log("pace.bail", { reason: "narrow", minX, maxX, minY, maxY, hasZoneRoom });
        return null;
      }

      // Pick a fresh y in the lower 40-80% of the available height
      // so Papee stays grounded and doesn't camp at the top/bottom edges.
      const yLo = minY + (maxY - minY) * 0.4;
      const yHi = minY + (maxY - minY) * 0.8;
      const baseY = yLo + Math.random() * (yHi - yLo);
      const targetY = baseY + (Math.random() * 16 - 8);

      // Short-range step in the current direction, not an edge-to-edge
      // traversal. Pick a random distance between 120 and 360px. If we
      // would walk off the edge, reverse and step back from that edge
      // instead. Papee reads as walking around rather than teleporting
      // across the full screen width every tick.
      const curX = papeeRef.current?.position?.x ?? (minX + maxX) / 2;
      const dirBefore = paceDirRef.current;
      const stepMin = 120;
      const stepMax = 360;
      const step = stepMin + Math.random() * (stepMax - stepMin);
      let targetX = dirBefore === "right" ? curX + step : curX - step;
      let dirAfter = dirBefore;
      if (targetX > maxX) {
        targetX = Math.max(minX, maxX - step);
        dirAfter = "left";
      } else if (targetX < minX) {
        targetX = Math.min(maxX, minX + step);
        dirAfter = "right";
      }
      paceDirRef.current = dirAfter;
      telemetry.log("pace.step", {
        dirBefore,
        dirAfter,
        curX: Math.round(curX),
        targetX: Math.round(targetX),
        step: Math.round(step),
        minX,
        maxX,
      });
      return { x: targetX, y: Math.max(minY, Math.min(maxY, targetY)) };
    };

    /**
     * Occasional station / random destination — used for the small
     * fraction of ticks where Papee breaks from pacing and hops to
     * a page-specific station instead.
     */
    const stationDestination = (): { x: number; y: number } | null => {
      const zone = safeZoneRef.current;
      if (!zone) return null;
      const stations = PAGE_STATIONS[pageRef.current] ?? PAGE_STATIONS.other ?? [];
      if (stations.length > 1) {
        patrolIdxRef.current = (patrolIdxRef.current + 1) % stations.length;
        const station = stations[patrolIdxRef.current]!;
        return resolveStation(station, zone, PAPEE_CHAR_SIZE);
      }
      return paceDestination();
    };

    const scheduler = new PapeeAnimationScheduler({
      apply: (pose) => {
        const p = papeeRef.current;
        if (!p) return;
        p.setAnimState(pose);
        recentRef.current = [pose, ...recentRef.current].slice(0, 2);

        telemetry.log("scheduler.apply", { pose });
        // If the picked pose implies motion, drive it via the pacer.
        if (MOVING_POSES.has(pose)) {
          const dest = paceDestination();
          if (dest) {
            p.setTargetPosition(dest);
            telemetry.log("scheduler.move", { pose, dest, dir: paceDirRef.current });
          }
        }
      },
      forceIdlePick: () => {
        scheduler.schedule({ pose: "walking", priority: "idle", durationMs: 2400 });
      },
    });
    schedulerRef.current = scheduler;

    /**
     * PAPEE_TOOLS_PLAN.md — Default state: PACING.
     * Every tick Papee walks to the opposite edge. ~25% of ticks
     * substitute a non-walking pose from the mood pool so he keeps
     * variety (magnifying, thinking, humming, etc). Whole-body
     * poses like celebrating/alarmed still come in via the behavior
     * loop and narrative arcs at higher priority.
     */
    const VARIETY_CHANCE = 0.25;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      const p = papeeRef.current;
      if (!p) {
        timer = setTimeout(tick, 2500);
        return;
      }
      const useVariety = Math.random() < VARIETY_CHANCE;
      let pose: PapeeAnimState = "walking";
      if (useVariety) {
        const alt = tickPose();
        // Only accept alt if it's not walking itself (otherwise boring repeat)
        if (alt && alt !== "walking") pose = alt;
      }
      telemetry.log("scheduler.tick", {
        pose,
        mood: p.mood,
        page: pageRef.current,
        variety: useVariety,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        currentPos: p.position,
      });

      // Hand off to the scheduler. Its `apply` callback owns all
      // movement — calling paceDestination here too would double-
      // flip paceDirRef each tick (net zero) and clobber the first
      // setTargetPosition with the second one.
      scheduler.schedule({ pose, priority: "idle", durationMs: 2400 });

      // Non-motion poses: occasional drift to a page station.
      if (!MOVING_POSES.has(pose) && Math.random() < 0.4) {
        const dest = stationDestination();
        if (dest) {
          p.setTargetPosition(dest);
          telemetry.log("scheduler.drift", { pose, dest });
        }
      }

      // Shorter cadence so pacing feels continuous: 1.8-3s
      const next = 1800 + Math.random() * 1200;
      timer = setTimeout(tick, next);
    };
    // On mount: if Papee's current position is outside the viewport
    // (stale state from a prior bug, sidebar toggle, etc), drag him
    // back inside before the first pace tick.
    {
      const p = papeeRef.current;
      if (p?.position) {
        const vpMaxX = Math.max(0, window.innerWidth - PAPEE_CHAR_SIZE.width - SAFE_MARGIN);
        const vpMaxY = Math.max(0, window.innerHeight - PAPEE_CHAR_SIZE.height - SAFE_MARGIN);
        const cx = Math.max(SAFE_MARGIN, Math.min(p.position.x, vpMaxX));
        const cy = Math.max(SAFE_MARGIN, Math.min(p.position.y, vpMaxY));
        if (cx !== p.position.x || cy !== p.position.y) {
          p.setPosition({ x: cx, y: cy });
          p.setTargetPosition({ x: cx, y: cy });
          telemetry.log("scheduler.rescue", { from: p.position, to: { x: cx, y: cy } });
        }
      }
    }

    timer = setTimeout(tick, 400);
    telemetry.log("scheduler.mount", {});

    return () => {
      if (timer) clearTimeout(timer);
      scheduler.dispose();
      schedulerRef.current = null;
    };
  }, [muteReactions, isMobile]);

  return schedulerRef;
}

export function schedulePose(
  schedulerRef: ReturnType<typeof usePapeeScheduler>,
  pose: import("@/components/papee/PapeeSprites").PapeeAnimState,
  priority: Priority,
  durationMs?: number,
) {
  schedulerRef.current?.schedule({ pose, priority, durationMs });
}
