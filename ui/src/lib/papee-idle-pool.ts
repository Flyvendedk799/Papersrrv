import type { PapeeAnimState } from "@/components/papee/PapeeSprites";
import type { PapeeMood } from "@/lib/papee-personality";

/**
 * PAPEE_TOOLS_PLAN.md §Z.1 — Mood-driven idle pool.
 *
 * Replaces the old single "idle" state with a weighted pool selected by
 * mood × page × time-of-session. The picker:
 *   • Picks from PoolEntry[] (mood-specific weights)
 *   • Applies page bias (additive weight on certain poses)
 *   • Applies time-of-day bias (sleepy/yawning after-hours)
 *   • Applies session-length bias (pacing/quick-glance after 20min)
 *   • Never repeats the previous two picks
 */

export interface PoolEntry {
  pose: PapeeAnimState;
  weight: number;
}

export const MOOD_POOLS: Record<PapeeMood, PoolEntry[]> = {
  calm: [
    { pose: "idle-blink", weight: 35 },
    { pose: "idle-look-around", weight: 25 },
    { pose: "scanning", weight: 15 },
    { pose: "stretching", weight: 15 },
    { pose: "jumping", weight: 5 },
    { pose: "humming", weight: 5 },
  ],
  alert: [
    { pose: "scanning", weight: 35 },
    { pose: "thinking", weight: 25 },
    { pose: "head-tilt", weight: 20 },
    { pose: "walking", weight: 15 },
    { pose: "alarmed", weight: 5 },
  ],
  urgent: [
    { pose: "alarmed", weight: 35 },
    { pose: "pointing-right", weight: 25 },
    { pose: "walking", weight: 20 },
    { pose: "thinking", weight: 10 },
    { pose: "pacing", weight: 10 },
  ],
  happy: [
    { pose: "celebrating", weight: 15 },
    { pose: "waving", weight: 20 },
    { pose: "thumbs-up", weight: 15 },
    { pose: "jumping", weight: 30 },
    { pose: "humming", weight: 20 },
  ],
  curious: [
    { pose: "magnifying", weight: 25 },
    { pose: "scanning", weight: 25 },
    { pose: "thinking", weight: 20 },
    { pose: "digging", weight: 15 },
    { pose: "head-tilt", weight: 15 },
  ],
  guarding: [
    { pose: "guarding", weight: 45 },
    { pose: "stopping", weight: 15 },
    { pose: "scanning", weight: 25 },
    { pose: "squint", weight: 15 },
  ],
  sleepy: [
    { pose: "sleepy-nod", weight: 40 },
    { pose: "yawning", weight: 30 },
    { pose: "idle-blink", weight: 20 },
    { pose: "stretching", weight: 10 },
  ],
};

/** Page personality biases (Z.1). Additive weight per page. */
export const PAGE_BIAS: Record<string, Partial<Record<PapeeAnimState, number>>> = {
  dashboard: { scanning: 15 },
  agents: { magnifying: 15 },
  "agent-detail": { magnifying: 10, thinking: 10 },
  "agent-run": { thinking: 25, typing: 15 },
  issues: { ledger: 10, scanning: 5 },
  "issue-detail": { writing: 15, thinking: 10 },
  secrets: { guarding: 25, squint: 10 },
  costs: { ledger: 25 },
  activity: { scanning: 15 },
  workflows: { "throwing-switch": 5, thinking: 10 },
};

interface PickInput {
  mood: PapeeMood;
  page: string;
  /** ms since the page was last changed; biases pacing/quick-glance after 20min */
  msOnPage: number;
  /** local hour 0–23, biases sleepy after 22:00 */
  hour: number;
  /** last-arc tag from Z.3 chain bias */
  lastArcEnd?: PapeeAnimState | null;
  /** last two picked poses; never re-pick */
  recent: PapeeAnimState[];
}

const CHAIN_BIAS: Partial<Record<PapeeAnimState, Partial<Record<PapeeAnimState, number>>>> = {
  celebrating: { waving: 25, "thumbs-up": 25, humming: 20 },
  alarmed: { scanning: 25, pacing: 20, thinking: 15 },
  walking: { "idle-look-around": 30 },
  guarding: { scanning: 20, squint: 15 },
  typing: { stretching: 20, "head-tilt": 15 },
  writing: { "idle-look-around": 15, ledger: 20 },
};

export function pickIdlePose(input: PickInput): PapeeAnimState {
  const base = MOOD_POOLS[input.mood] ?? MOOD_POOLS.calm;
  const weights = new Map<PapeeAnimState, number>();
  for (const e of base) weights.set(e.pose, e.weight);

  // page bias
  const bias = PAGE_BIAS[input.page] ?? {};
  for (const [pose, w] of Object.entries(bias)) {
    weights.set(pose as PapeeAnimState, (weights.get(pose as PapeeAnimState) ?? 0) + w!);
  }
  // time-of-day bias
  if (input.hour >= 22 || input.hour < 6) {
    weights.set("sleepy-nod", (weights.get("sleepy-nod") ?? 0) + 15);
    weights.set("yawning", (weights.get("yawning") ?? 0) + 10);
  }
  if (input.hour >= 6 && input.hour < 9) {
    weights.set("yawning", (weights.get("yawning") ?? 0) + 10);
  }
  // session length bias
  if (input.msOnPage > 20 * 60_000) {
    weights.set("pacing", (weights.get("pacing") ?? 0) + 10);
    weights.set("idle-look-around", (weights.get("idle-look-around") ?? 0) + 10);
  }
  // chain bias from last arc
  if (input.lastArcEnd) {
    const chain = CHAIN_BIAS[input.lastArcEnd];
    if (chain) {
      for (const [pose, w] of Object.entries(chain)) {
        weights.set(pose as PapeeAnimState, (weights.get(pose as PapeeAnimState) ?? 0) + w!);
      }
    }
  }
  // forbid recent two
  for (const r of input.recent) weights.set(r, 0);

  const entries = [...weights.entries()].filter(([, w]) => w > 0);
  if (entries.length === 0) return "idle-blink";

  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [pose, w] of entries) {
    r -= w;
    if (r <= 0) return pose;
  }
  return entries[entries.length - 1]![0];
}
