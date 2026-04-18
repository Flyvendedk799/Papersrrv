/**
 * Papee companion types (Boared rebrand).
 *
 * Shared type surface used by the server `papee-companion` service,
 * its rules helper, and UI companion surfaces. Shapes are derived
 * directly from current service usage so the two halves stay in sync.
 */

export type PapeeRitualId = "pulse_sweep" | "focus_sprint" | "wrap_prepare";

export type PapeeCompanionMode = "balanced" | "playful" | "guardian";

export type PapeeInteractionKind =
  | "pet"
  | "cue"
  | "toy"
  | "mission_step"
  | "swipe"
  | "chat_prompt"
  | "focus_action";

export interface PapeeInteractionEvent {
  type: PapeeInteractionKind | (string & {});
  ritualId?: PapeeRitualId | null;
  idempotencyKey?: string | null;
  payload?: Record<string, unknown>;
  occurredAt?: string;
}

export interface PapeeRitualTrack {
  id: PapeeRitualId;
  title: string;
  steps: string[];
  activeStep: number;
  completedAt?: string | null;
}

export interface PapeeRitualState {
  suggestedRitualId: PapeeRitualId;
  activeRitualId: PapeeRitualId;
  tracks: PapeeRitualTrack[];
}

export interface PapeeLiveSignal {
  liveRuns: number;
  runningAgents: number;
  criticalIssues: number;
  warningIssues: number;
  pendingApprovals: number;
  currentIssueIdentifier?: string | null;
  currentIssueTitle?: string | null;
  currentAgentName?: string | null;
}

export interface PapeeCompanionProfile {
  bondPoints: number;
  checkInStreak: number;
  energyLevel: number;
  companionMode: PapeeCompanionMode;
  activeRitualId: PapeeRitualId | null;
  lastCheckInAt: string | null;
  lastMissionAt: string | null;
  lastSeenAt: string | null;
  updatedAt: string;
}

export interface PapeeInteractionReward {
  bondDelta: number;
  energyDelta: number;
  note: string;
}

export interface PapeeInteractionResponse {
  profile: PapeeCompanionProfile;
  ritualState: PapeeRitualState;
  idempotent: boolean;
  reward?: PapeeInteractionReward;
}

export interface PapeeRitualProgressResponse {
  profile: PapeeCompanionProfile;
  ritualState: PapeeRitualState;
  ritualId: PapeeRitualId;
  progressed: boolean;
}

export type PapeeAmbientPhase = "dawn" | "day" | "dusk" | "night";
export type PapeeAmbientVibe = "calm" | "alert" | "urgent";

export interface PapeeAmbient {
  phase: PapeeAmbientPhase;
  vibe: PapeeAmbientVibe;
  title: string;
  subtitle: string;
  sinceLastVisitLabel: string;
}

export interface PapeeMobileSnapshot {
  profile: PapeeCompanionProfile;
  liveSignal: PapeeLiveSignal;
  ritualState: PapeeRitualState;
  ambient: PapeeAmbient;
}
