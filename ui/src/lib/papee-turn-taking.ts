/**
 * PAPEE_TOOLS_PLAN.md §M.5 — Turn-taking & interruption rules.
 *
 * Pure functions; the consumer hook (useInterjectPipeline) calls these
 * to decide whether to fire a queued interjection right now or hold it.
 */

export interface UserState {
  /** ms since the user last typed in any focusable input. */
  msSinceTyping: number;
  /** ms since the last scroll. */
  msSinceScroll: number;
  /** ms since the last pointer move / click. */
  msSinceInteraction: number;
  chatOpen: boolean;
}

export type InterjectVerdict = "fire" | "defer" | "drop-non-critical";

export function shouldInterject(
  state: UserState,
  severity: "critical" | "normal" | "low",
): InterjectVerdict {
  // Mid-typing — never start a new bubble unless critical
  if (state.msSinceTyping < 400 && severity !== "critical") return "defer";
  // Mid-scroll — wait for scroll to settle 200ms unless critical
  if (state.msSinceScroll < 200 && severity !== "critical") return "defer";
  // Chat is open — external bubbles muted except critical
  if (state.chatOpen && severity !== "critical") return "drop-non-critical";
  // Otherwise: stationary >3s = window of opportunity, also fine if just idle
  return "fire";
}
