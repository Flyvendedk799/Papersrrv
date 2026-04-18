import type { PapeeAnimState } from "../components/papee/PapeeSprites";

export type PapeeMood = "calm" | "alert" | "urgent" | "happy" | "curious" | "guarding" | "sleepy";

export interface PagePersonality {
  /** Base idle variant for the page — affects default animation */
  idleVariant: PapeeAnimState;
  /** Blink interval in ms (randomized around this) */
  blinkIntervalMs: number;
  /** Look-around interval in ms */
  lookAroundIntervalMs: number;
  /** Description of scan behavior for the page */
  scanDescription: string;
}

export interface PapeeHealthSnapshot {
  healthy: boolean;
  criticalCount: number;
  warningCount: number;
}

/**
 * Derive Papee's mood from current health status and recent successes.
 * - urgent: any critical issues
 * - alert: warnings present
 * - happy: 3+ consecutive healthy polls
 * - calm: healthy, fewer than 3 consecutive
 * - curious: unknown/no data yet
 */
export function deriveMood(
  health: PapeeHealthSnapshot | undefined,
  consecutiveHealthy: number
): PapeeMood {
  if (!health) return "curious";
  if (health.criticalCount > 0) return "urgent";
  if (health.warningCount > 0) return "alert";
  if (consecutiveHealthy >= 3) return "happy";
  return "calm";
}

/** Mood → glow color token for the character */
export const MOOD_GLOW_COLORS: Record<PapeeMood, string> = {
  calm: "bg-emerald-400/15 dark:bg-emerald-400/10",
  alert: "bg-amber-400/25 dark:bg-amber-400/15",
  urgent: "bg-red-400/30 dark:bg-red-400/20",
  happy: "bg-yellow-400/25 dark:bg-yellow-400/15",
  curious: "bg-blue-400/20 dark:bg-blue-400/10",
  guarding: "bg-violet-400/20 dark:bg-violet-400/10",
  sleepy: "bg-slate-400/15 dark:bg-slate-400/10",
};

/** Mood → glow animation class name */
export const MOOD_GLOW_ANIMATIONS: Record<PapeeMood, string> = {
  calm: "",
  alert: "papee-glow-think",
  urgent: "papee-glow-alarm",
  happy: "papee-glow-celebrate",
  curious: "papee-glow-think",
  guarding: "papee-glow-think",
  sleepy: "",
};

export const PAGE_PERSONALITIES: Record<string, PagePersonality> = {
  dashboard: {
    idleVariant: "idle",
    blinkIntervalMs: 3500,
    lookAroundIntervalMs: 7000, // scan mode — frequent
    scanDescription: "scanning the dashboard",
  },
  agents: {
    idleVariant: "idle",
    blinkIntervalMs: 4000,
    lookAroundIntervalMs: 9000, // inspecting agents
    scanDescription: "inspecting agents",
  },
  "agent-detail": {
    idleVariant: "idle",
    blinkIntervalMs: 4500,
    lookAroundIntervalMs: 12000, // focused on one agent
    scanDescription: "focused on agent",
  },
  "agent-run": {
    idleVariant: "thinking", // watching the run
    blinkIntervalMs: 5000,
    lookAroundIntervalMs: 15000,
    scanDescription: "watching run execute",
  },
  issues: {
    idleVariant: "idle",
    blinkIntervalMs: 4000,
    lookAroundIntervalMs: 6000, // reading through issues
    scanDescription: "reading the list",
  },
  "issue-detail": {
    idleVariant: "idle",
    blinkIntervalMs: 4500,
    lookAroundIntervalMs: 8000,
    scanDescription: "reading issue details",
  },
  secrets: {
    idleVariant: "idle",
    blinkIntervalMs: 6000, // vigilant, slow blinks
    lookAroundIntervalMs: 20000, // rarely looks away
    scanDescription: "guarding the vault",
  },
  costs: {
    idleVariant: "thinking", // contemplating
    blinkIntervalMs: 4000,
    lookAroundIntervalMs: 10000,
    scanDescription: "crunching numbers",
  },
  activity: {
    idleVariant: "idle",
    blinkIntervalMs: 3500,
    lookAroundIntervalMs: 5000, // watching activity feed
    scanDescription: "watching activity",
  },
  workflows: {
    idleVariant: "idle",
    blinkIntervalMs: 4000,
    lookAroundIntervalMs: 9000,
    scanDescription: "reviewing workflows",
  },
  org: {
    idleVariant: "idle",
    blinkIntervalMs: 4000,
    lookAroundIntervalMs: 8000,
    scanDescription: "reviewing org chart",
  },
  projects: {
    idleVariant: "idle",
    blinkIntervalMs: 4000,
    lookAroundIntervalMs: 9000,
    scanDescription: "reviewing projects",
  },
  inbox: {
    idleVariant: "idle",
    blinkIntervalMs: 3500,
    lookAroundIntervalMs: 6000,
    scanDescription: "checking inbox",
  },
  other: {
    idleVariant: "idle",
    blinkIntervalMs: 4000,
    lookAroundIntervalMs: 10000,
    scanDescription: "idling",
  },
};

export function getPagePersonality(page: string): PagePersonality {
  return PAGE_PERSONALITIES[page] ?? PAGE_PERSONALITIES.other;
}

/**
 * Time-of-day aware greeting text.
 * Uses local time.
 */
export function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning! Ready to check on the team?";
  if (hour >= 12 && hour < 17) return "Good afternoon! Let me know if you need anything.";
  if (hour >= 17 && hour < 22) return "Good evening! Winding down or still going?";
  return "Working late? I'm here if you need me.";
}

export type ReactionIntensity = "mild" | "moderate" | "intense";

/**
 * Escalate reaction intensity based on repeated events.
 * First failure = mild (concerned), 2-3 = moderate (worried), 4+ = intense (panicked).
 */
export function getReactionIntensity(eventCount: number): ReactionIntensity {
  if (eventCount <= 1) return "mild";
  if (eventCount <= 3) return "moderate";
  return "intense";
}

/** Map reaction intensity to animation duration multiplier (amplifies shakes/glows) */
export const INTENSITY_DURATION_MULTIPLIER: Record<ReactionIntensity, number> = {
  mild: 1,
  moderate: 1.3,
  intense: 1.7,
};

/** Idle variant override based on mood — used to make Papee look "alert" or "worried" while idle */
export function moodIdleVariant(mood: PapeeMood, basePersonality: PagePersonality): PapeeAnimState {
  if (mood === "urgent") return "alarmed"; // constantly worried
  if (mood === "happy") return "idle"; // happy idle
  return basePersonality.idleVariant;
}