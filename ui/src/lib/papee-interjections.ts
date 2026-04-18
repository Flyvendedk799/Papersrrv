/**
 * PAPEE_TOOLS_PLAN.md §M.6 — Interjection trigger table + pipeline state.
 *
 * The pipeline lives in `useInterjectionPipeline`; this file is just
 * the data + cooldown ledger.
 */

export type InterjectSeverity = "critical" | "normal" | "low";

export interface InterjectTrigger {
  id: string;
  cooldownMs: number;
  severity: InterjectSeverity;
}

export const INTERJECT_TRIGGERS: Record<string, InterjectTrigger> = {
  agent_error: { id: "agent_error", cooldownMs: 30_000, severity: "critical" },
  run_failed: { id: "run_failed", cooldownMs: 60_000, severity: "normal" },
  issue_reassigned: { id: "issue_reassigned", cooldownMs: 120_000, severity: "normal" },
  user_stalled: { id: "user_stalled", cooldownMs: 120_000, severity: "low" },
  new_comment: { id: "new_comment", cooldownMs: 60_000, severity: "normal" },
  budget_warn: { id: "budget_warn", cooldownMs: 4 * 60 * 60_000, severity: "normal" },
  morning_brief: { id: "morning_brief", cooldownMs: 24 * 60 * 60_000, severity: "low" },
  welcome_back: { id: "welcome_back", cooldownMs: 60 * 60_000, severity: "low" },
  agent_stuck: { id: "agent_stuck", cooldownMs: 5 * 60_000, severity: "normal" },
  thanks_callback: { id: "thanks_callback", cooldownMs: 60 * 60_000, severity: "low" },
};

export interface CooldownLedger {
  [triggerId: string]: number; // last-fired timestamp (performance.now())
}

const SESSION_GLOBAL_COOLDOWN_MS = 20_000;

export function canFire(ledger: CooldownLedger, trigger: InterjectTrigger): boolean {
  const now = performance.now();
  const last = ledger[trigger.id] ?? -Infinity;
  if (now - last < trigger.cooldownMs) return false;
  // Per-session global cooldown — protects from a flurry of triggers
  const lastAny = Math.max(...Object.values(ledger), -Infinity);
  if (Number.isFinite(lastAny) && now - lastAny < SESSION_GLOBAL_COOLDOWN_MS) return false;
  return true;
}

export function markFired(ledger: CooldownLedger, triggerId: string): CooldownLedger {
  return { ...ledger, [triggerId]: performance.now() };
}

/* Escalation ladder (M.6). */
export const ESCALATION_LADDER = [
  { level: 1, delayMs: 0, action: "head-tilt-bubble" },
  { level: 2, delayMs: 10_000, action: "walk-toward-cursor" },
  { level: 3, delayMs: 20_000, action: "alarmed-bubble" },
  { level: 4, delayMs: 30_000, action: "open-chat-panel" },
] as const;
