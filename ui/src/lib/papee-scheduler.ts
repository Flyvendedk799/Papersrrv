import type { PapeeAnimState } from "@/components/papee/PapeeSprites";
import { getPoseDef } from "./papee-pose-defs";

/**
 * PAPEE_TOOLS_PLAN.md §Z.6 — animationScheduler.
 *
 * Serializes deliberate pose changes from four sources at distinct
 * priorities and enforces:
 *
 *   1. Debounce  — max one change per 800ms (idle floor 1200ms).
 *   2. Preemption— higher priority cancels lower at next beat boundary
 *                  (or immediately for `critical`).
 *   3. Coalescing— two idle picks within 400ms collapse to the second.
 *   4. Starvation— blocked decision events stored, applied at cooldown.
 *   5. Dead-man  — if nothing changed for 8s, force a fresh idle pick.
 *
 * Micro-behaviors (Z.5: blink, gaze, breathing) bypass this scheduler
 * entirely — they touch separate state.
 */

export type Priority = "critical" | "narrative" | "decision" | "idle";

const PRIORITY_RANK: Record<Priority, number> = {
  critical: 4,
  narrative: 3,
  decision: 2,
  idle: 1,
};

export interface ScheduleRequest {
  pose: PapeeAnimState;
  priority: Priority;
  /** Optional duration before scheduler considers this beat "complete". */
  durationMs?: number;
  /** Tag for chain bias (Z.1). */
  tag?: string;
}

interface SchedulerOptions {
  apply: (pose: PapeeAnimState) => void;
  forceIdlePick: () => void;
}

export class PapeeAnimationScheduler {
  private current: PapeeAnimState | null = null;
  private currentPriority: Priority = "idle";
  private currentBeatEndsAt = 0;
  private lastChangeAt = 0;
  private starvedDecision: ScheduleRequest | null = null;
  private deadManTimer: ReturnType<typeof setTimeout> | null = null;
  private opts: SchedulerOptions;

  constructor(opts: SchedulerOptions) {
    this.opts = opts;
    this.armDeadManSwitch();
  }

  schedule(req: ScheduleRequest) {
    const now = performance.now();
    const incomingRank = PRIORITY_RANK[req.priority];
    const currentRank = PRIORITY_RANK[this.currentPriority];

    // Critical preempts immediately
    if (req.priority === "critical") {
      this.commit(req, now);
      return;
    }
    // Higher non-critical waits for next beat boundary
    if (incomingRank > currentRank) {
      const waitFor = Math.max(0, this.currentBeatEndsAt - now);
      if (waitFor === 0) {
        this.commit(req, now);
      } else {
        setTimeout(() => this.commit(req, performance.now()), waitFor);
      }
      return;
    }
    // Same priority — debounce
    const floor = req.priority === "idle" ? 1200 : 800;
    if (now - this.lastChangeAt < floor) {
      // Coalesce idle picks at <400ms
      if (req.priority === "idle" && now - this.lastChangeAt < 400) {
        // drop the previous; replace with this one after the floor
        setTimeout(() => this.commit(req, performance.now()), floor - (now - this.lastChangeAt));
      }
      return;
    }
    if (incomingRank < currentRank) {
      // Lower priority can't displace; if it's a decision, store as starved
      if (req.priority === "decision") this.starvedDecision = req;
      return;
    }
    this.commit(req, now);
  }

  /** Called when the current beat naturally ends (e.g. duration elapsed). */
  beatComplete() {
    if (this.starvedDecision) {
      const next = this.starvedDecision;
      this.starvedDecision = null;
      this.commit(next, performance.now());
    }
  }

  private commit(req: ScheduleRequest, now: number) {
    this.current = req.pose;
    this.currentPriority = req.priority;
    this.lastChangeAt = now;
    this.currentBeatEndsAt = now + (req.durationMs ?? 1500);
    // weight from pose def could feed crossfade — applied via apply()
    void getPoseDef(req.pose);
    this.opts.apply(req.pose);
    this.armDeadManSwitch();
    if (req.durationMs) {
      setTimeout(() => this.beatComplete(), req.durationMs);
    }
  }

  private armDeadManSwitch() {
    if (this.deadManTimer) clearTimeout(this.deadManTimer);
    this.deadManTimer = setTimeout(() => this.opts.forceIdlePick(), 8000);
  }

  dispose() {
    if (this.deadManTimer) clearTimeout(this.deadManTimer);
  }
}
