/* ─────────────────────────────────────────────────────────────────────
 *  atmosphere — derive a scene "mood" from the issue state.
 *
 *  The visualization's main purpose is to let a user read the MATTER's
 *  state before they read a word. A resolved case should feel serene.
 *  A critical blocker should feel tense — denser fog, warmer ambient
 *  tint, a heavier vignette. This module is the single place that maps
 *  (status, priority, live activity) → atmospheric parameters.
 *
 *  One function. One object out. Used by IssueScene to wire up fog,
 *  ambient light, vignette tint, and the title-card tone class.
 * ───────────────────────────────────────────────────────────────────── */

import type { Issue, IssueStatus } from "@paperclipai/shared";

export type Mood = "serene" | "neutral" | "alert" | "urgent";

export interface Atmosphere {
  mood: Mood;

  /** Scene <fog> params — tighter fog = claustrophobic / urgent. */
  fogColor: string;
  fogNear: number;
  fogFar: number;

  /** <ambientLight> — tints every surface in the scene. */
  ambientColor: string;
  ambientIntensity: number;

  /** Secondary <hemisphereLight> upper / lower tints. */
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;

  /** Post-processing vignette — red for urgent, deep-blue for serene. */
  vignetteColor: string;
  vignetteDarkness: number;

  /** Human-readable phrase for the title card. */
  statusPhrase: string;

  /** Optional atmospheric tagline — short, poetic, matches mood. */
  tagline: string;
}

/** Map status + priority + live activity to a mood tier. */
function moodFor(
  status: IssueStatus,
  priority: string,
  liveCount: number,
): Mood {
  if (status === "blocked") return "urgent";
  if (liveCount > 0 && priority === "critical") return "urgent";
  if (priority === "critical" && status !== "done" && status !== "cancelled")
    return "alert";
  if (status === "done" || status === "cancelled") return "serene";
  return "neutral";
}

const STATUS_PHRASE: Record<IssueStatus, string> = {
  backlog: "BACKLOG",
  todo: "TO DO",
  in_progress: "IN PROGRESS",
  in_review: "IN REVIEW",
  done: "DONE",
  blocked: "BLOCKED",
  cancelled: "CANCELLED",
};

/** Human-friendly "X days" since a timestamp. */
function daysSince(ms: number | null): number {
  if (!ms) return 0;
  return Math.max(0, Math.floor((Date.now() - ms) / 86_400_000));
}

function toMs(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Age phrase for the title card. Tells the story of where this case
 *  sits in time. "OPEN 4 DAYS" tells a user more than "in_progress". */
export function ageTagline(issue: Issue): string {
  const created = toMs(issue.createdAt);
  const updated = toMs(issue.updatedAt);
  if (issue.status === "done") {
    const n = daysSince(updated);
    if (n === 0) return "RESOLVED TODAY";
    if (n === 1) return "RESOLVED YESTERDAY";
    return `RESOLVED ${n} DAYS AGO`;
  }
  if (issue.status === "cancelled") {
    const n = daysSince(updated);
    return n === 0 ? "CANCELLED TODAY" : `CANCELLED ${n} DAYS AGO`;
  }
  const open = daysSince(created);
  if (open === 0) return "OPEN · FRESH";
  if (open === 1) return "OPEN · 1 DAY";
  return `OPEN · ${open} DAYS`;
}

/** Compose the full atmosphere for a given issue + live-activity state. */
export function atmosphereFor(
  issue: Issue,
  opts: { liveRunCount: number } = { liveRunCount: 0 },
): Atmosphere {
  const mood = moodFor(
    issue.status as IssueStatus,
    issue.priority as string,
    opts.liveRunCount,
  );

  const tagline = ageTagline(issue);
  const statusPhrase = STATUS_PHRASE[issue.status as IssueStatus] ?? "—";

  /* Mood palettes — handpicked to match the existing deep-void
   * background and cream/acid accent palette. Fog near/far tightens
   * on urgent moods to sell claustrophobia. */
  switch (mood) {
    case "urgent":
      return {
        mood,
        fogColor: "#140608",
        fogNear: 22,
        fogFar: 58,
        ambientColor: "#ff8a7a", // warm red-amber cast
        ambientIntensity: 0.18,
        hemiSky: "#3a0c14",
        hemiGround: "#060004",
        hemiIntensity: 0.22,
        vignetteColor: "#3a0a10",
        vignetteDarkness: 1.2,
        statusPhrase,
        tagline,
      };
    case "alert":
      return {
        mood,
        fogColor: "#0e0a10",
        fogNear: 28,
        fogFar: 66,
        ambientColor: "#f3a47a", // amber warmth
        ambientIntensity: 0.16,
        hemiSky: "#2a1a10",
        hemiGround: "#050008",
        hemiIntensity: 0.2,
        vignetteColor: "#241014",
        vignetteDarkness: 1.1,
        statusPhrase,
        tagline,
      };
    case "serene":
      return {
        mood,
        fogColor: "#07080c",
        fogNear: 34,
        fogFar: 78, // airy, long draw — reads "closed, settled"
        ambientColor: "#8ec4c8", // soft teal calm
        ambientIntensity: 0.16,
        hemiSky: "#0f2330",
        hemiGround: "#050008",
        hemiIntensity: 0.2,
        vignetteColor: "#05101a",
        vignetteDarkness: 0.95,
        statusPhrase,
        tagline,
      };
    case "neutral":
    default:
      return {
        mood: "neutral",
        fogColor: "#050508",
        fogNear: 30,
        fogFar: 70,
        ambientColor: "#6a7290",
        ambientIntensity: 0.14,
        hemiSky: "#0f0f28",
        hemiGround: "#050008",
        hemiIntensity: 0.18,
        vignetteColor: "#000000",
        vignetteDarkness: 1.05,
        statusPhrase,
        tagline,
      };
  }
}
