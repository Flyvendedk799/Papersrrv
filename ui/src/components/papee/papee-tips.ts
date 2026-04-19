/**
 * Boared-rebrand: minimal tips module stub.
 *
 * The full tips catalogue is being restored from session logs. This
 * stub keeps `usePapeeTips` compiling with predictable empty results
 * until the catalogue lands.
 */

import type { PapeeAnimState } from "./PapeeSprites";

export interface PapeeTip {
  key: string;
  text: string;
  animation: PapeeAnimState;
  durationMs: number;
  bubbleDurationMs: number;
  page?: string;
  weight?: number;
}

export const PAPEE_TIPS: PapeeTip[] = [];

export function getTipsForPage(_page: string): PapeeTip[] {
  return [];
}

/**
 * Pick the next tip the user hasn't seen yet. Stub: always null until
 * the tip catalogue is restored.
 */
export function getNextTip(_ctx: {
  page: string;
  health?: unknown;
  shownTips: ReadonlySet<string> | Set<string>;
  pageEnteredAt?: number;
  consecutiveSuccesses?: number;
  problemsResolved?: boolean;
}): PapeeTip | null {
  return null;
}

/** Read the shown-tip set from localStorage (stub: empty set). */
export function readShownTips(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem("paperclip.papee.shownTips");
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

/** Mark a tip as shown in localStorage. */
export function markTipShown(tipId: string): void {
  if (typeof window === "undefined") return;
  try {
    const shown = readShownTips();
    shown.add(tipId);
    window.localStorage.setItem(
      "paperclip.papee.shownTips",
      JSON.stringify([...shown]),
    );
  } catch {
    /* ignore */
  }
}

export const ISSUE_SCENE_LINES = {
  awaitingApproval: "Waiting on you to approve this.",
  blocked: "This issue is blocked. Someone should look.",
  staleRun: (days: number) =>
    `No movement in ${days} day${days === 1 ? "" : "s"}.`,
} as const;
