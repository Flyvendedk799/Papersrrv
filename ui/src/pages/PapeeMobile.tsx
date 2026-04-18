import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties, type PointerEvent } from "react";
import type { Issue } from "@paperclipai/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@/lib/router";
import { agentsApi } from "../api/agents";
import { authApi, type AuthSession } from "../api/auth";
import { dashboardApi } from "../api/dashboard";
import { heartbeatsApi } from "../api/heartbeats";
import { issuesApi } from "../api/issues";
import {
  papeeApi,
  type PapeeAction,
  type PapeeCompanionMode,
  type PapeeInteractionEventType,
  type PapeeMobileSnapshot,
  type PapeeRitualId,
  type PapeeRitualState,
  type PapeeTool,
} from "../api/papee";
import { LiveRunWidget } from "../components/LiveRunWidget";
import { MarkdownBody } from "../components/MarkdownBody";
import { StatusBadge } from "../components/StatusBadge";
import { ToastViewport } from "../components/ToastViewport";
import { PapeeCharacter } from "../components/papee/PapeeCharacter";
import type { PapeeAnimState } from "../components/papee/PapeeSprites";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { usePapeeOptional, type ChatMessage } from "../context/PapeeContext";
import { usePapeeChat } from "../hooks/usePapeeChat";
import type { PapeeMood } from "../lib/papee-personality";
import { queryKeys } from "../lib/queryKeys";
import { agentUrl, cn, issueUrl, relativeTime } from "../lib/utils";
import {
  mergeProfileWithMirror,
  normalizeCompanionMode,
  sanitizeCompanionProfile,
  sinceLastSeenLabel,
} from "../lib/papee-mobile-profile";
import {
  ArrowUpRight,
  Bot,
  ChevronRight,
  CircleDot,
  Gamepad2,
  Gauge,
  HeartHandshake,
  Home,
  ListChecks,
  LoaderCircle,
  MessageCircle,
  Moon,
  Shield,
  Sparkles,
  Volume2,
  VolumeX,
  Waves,
  Zap,
  TriangleAlert,
} from "lucide-react";

type AmbientState = {
  title: string;
  subtitle: string;
  animState: PapeeAnimState;
  mood: PapeeMood;
  badge: string;
  energy: "low" | "medium" | "high";
};

type CompanionActionId = "pet" | "focus" | "quiet";
type ViewMode = "companion" | "control" | "chat";
type RoamStation = { x: number; y: number; label: string };
type HabitatCueId = "celebrate" | "inspect" | "salute";
type HabitatToyId = "treat" | "hype" | "scan" | "story";
type CompanionMode = PapeeCompanionMode;
type CompanionVibeId = "cozy" | "tactical" | "showtime";
type MissionId = "triage" | "live" | "inbox" | "bond";
type ScenePresetId = "steady" | "boost" | "guard";
type HabitatPhase = "dawn" | "day" | "dusk" | "night";
type BondTier = {
  title: string;
  min: number;
  max: number;
  summary: string;
};
type HabitatBurstTone = "spark" | "heart" | "alert";
type HabitatBurst = {
  id: number;
  x: number;
  y: number;
  tone: HabitatBurstTone;
  bornAt: number;
};
type PersonalityFacetId = "warmth" | "focus" | "curiosity" | "play";
type PersonalityMomentTone = "warm" | "signal" | "alert";
type PersonalityMoment = {
  id: number;
  text: string;
  tone: PersonalityMomentTone;
  at: number;
};
type PersonalityFacetMeta = {
  label: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
};
type CompanionModeConfig = {
  label: string;
  short: string;
  description: string;
  legMinMs: number;
  legMaxMs: number;
  retargetMs: number;
  chatterRoamMs: number;
  chatterActiveMs: number;
};
type CompanionMission = {
  id: MissionId;
  title: string;
  detail: string;
  cta: string;
  urgency: "normal" | "warning" | "critical";
};
type MotionProfile = "full" | "lite" | "reduced";
type ProfileMirror = {
  version: number;
  profile: PapeeMobileSnapshot["profile"];
  savedAt: string;
};
type ScenePreset = {
  id: ScenePresetId;
  title: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
};
type CompanionVibe = {
  id: CompanionVibeId;
  title: string;
  subtitle: string;
  mode: CompanionMode;
  ritualId: PapeeRitualId;
  reaction: PapeeAnimState;
  tone: HabitatBurstTone;
  ambientLine: string;
};
type PowerActionTone = "read" | "act" | "danger";
type PowerActionDefinition = {
  id: string;
  title: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  tool: PapeeTool | null;
  tone: PowerActionTone;
  disabledReason?: string;
};

const ROAM_LANE_Y = 46;
const HABITAT_SWIPE_THRESHOLD_PX = 34;
const HABITAT_TAP_COMBO_WINDOW_MS = 1500;
const PAPEE_PROFILE_MIRROR_VERSION = 1;
const RITUAL_ORDER: PapeeRitualId[] = ["pulse_sweep", "focus_sprint", "wrap_prepare"];
const RITUAL_LABELS: Record<PapeeRitualId, string> = {
  pulse_sweep: "Pulse Sweep",
  focus_sprint: "Focus Sprint",
  wrap_prepare: "Wrap & Prepare",
};
const RITUAL_MISSION_MAP: Record<PapeeRitualId, MissionId> = {
  pulse_sweep: "triage",
  focus_sprint: "live",
  wrap_prepare: "bond",
};
const VIEW_MODE_LABELS: Record<
  ViewMode,
  { title: string; subtitle: string; icon: ComponentType<{ className?: string }>; hint: string }
> = {
  companion: { title: "Companion", subtitle: "Habitat + personality", icon: HeartHandshake, hint: "Bond" },
  control: { title: "Control", subtitle: "Live signals + queue", icon: Gauge, hint: "Ops" },
  chat: { title: "Chat", subtitle: "Decision-grade convo", icon: MessageCircle, hint: "Voice" },
};
const SCENE_PRESETS: ScenePreset[] = [
  { id: "steady", title: "Steady", subtitle: "Calm patrol", icon: Gauge },
  { id: "boost", title: "Boost", subtitle: "High energy", icon: Zap },
  { id: "guard", title: "Guard", subtitle: "Risk posture", icon: Shield },
];
const ACTIVE_CONTEXT_STATES = new Set<PapeeAnimState>([
  "typing",
  "writing",
  "alarmed",
  "celebrating",
  "jumping",
  "thumbs-up",
  "magnifying",
  "digging",
  "unlocking",
  "throwing-switch",
  "stopping",
  "broom",
  "ledger",
  "speaking-gesture",
  "guarding",
  "pointing-left",
  "pointing-right",
  "shush",
]);
const WORK_STATION: RoamStation = { x: 50, y: ROAM_LANE_Y, label: "Workbench" };
const ROAM_STATIONS: RoamStation[] = [
  { x: 16, y: ROAM_LANE_Y, label: "Inbox lane" },
  { x: 30, y: ROAM_LANE_Y, label: "Pulse lookout" },
  { x: 44, y: ROAM_LANE_Y, label: "Workbench" },
  { x: 58, y: ROAM_LANE_Y, label: "Signal ridge" },
  { x: 72, y: ROAM_LANE_Y, label: "Gate watch" },
  { x: 84, y: ROAM_LANE_Y, label: "Deep sweep" },
];
const BOND_TIERS: BondTier[] = [
  { title: "Acquainted", min: 0, max: 19, summary: "Getting to know your rhythm." },
  { title: "Trusted pal", min: 20, max: 59, summary: "Reads your patterns and priorities." },
  { title: "Co-pilot", min: 60, max: 119, summary: "High-context companion with strong intuition." },
  { title: "Legendary duo", min: 120, max: 9999, summary: "Deep sync. Papee anticipates your moves." },
];
const MODE_CONFIG: Record<CompanionMode, CompanionModeConfig> = {
  balanced: {
    label: "Balanced",
    short: "default",
    description: "Steady patrol with practical, concise updates.",
    legMinMs: 1650,
    legMaxMs: 2550,
    retargetMs: 1900,
    chatterRoamMs: 7600,
    chatterActiveMs: 6200,
  },
  playful: {
    label: "Playful",
    short: "fun",
    description: "Lively motion, more chatter, and expressive reactions.",
    legMinMs: 950,
    legMaxMs: 1700,
    retargetMs: 1250,
    chatterRoamMs: 4800,
    chatterActiveMs: 4300,
  },
  guardian: {
    label: "Guardian",
    short: "strict",
    description: "Disciplined scans, slower pacing, escalation-focused signal.",
    legMinMs: 2200,
    legMaxMs: 3400,
    retargetMs: 2500,
    chatterRoamMs: 9300,
    chatterActiveMs: 6800,
  },
};
const COMPANION_VIBES: CompanionVibe[] = [
  {
    id: "cozy",
    title: "Cozy",
    subtitle: "Warm, reassuring and softly proactive.",
    mode: "balanced",
    ritualId: "wrap_prepare",
    reaction: "waving",
    tone: "heart",
    ambientLine: "Cozy vibe loaded. I will keep things warm, clear, and grounded.",
  },
  {
    id: "tactical",
    title: "Tactical",
    subtitle: "Sharper filtering and tighter execution posture.",
    mode: "guardian",
    ritualId: "pulse_sweep",
    reaction: "guarding",
    tone: "alert",
    ambientLine: "Tactical vibe loaded. I will prioritize signal and escalation.",
  },
  {
    id: "showtime",
    title: "Showtime",
    subtitle: "High expression with fast, energetic loops.",
    mode: "playful",
    ritualId: "focus_sprint",
    reaction: "celebrating",
    tone: "spark",
    ambientLine: "Showtime vibe loaded. Big personality and fast loops are live.",
  },
];
const MODE_TO_VIBE: Record<CompanionMode, CompanionVibeId> = {
  balanced: "cozy",
  guardian: "tactical",
  playful: "showtime",
};
const PERSONALITY_FACET_META: Record<PersonalityFacetId, PersonalityFacetMeta> = {
  warmth: {
    label: "Warmth",
    hint: "How caring and emotionally attuned Papee feels.",
    icon: HeartHandshake,
  },
  focus: {
    label: "Focus",
    hint: "How strict Papee is about high-signal actions.",
    icon: Shield,
  },
  curiosity: {
    label: "Curiosity",
    hint: "How exploratory Papee is while scanning context.",
    icon: Sparkles,
  },
  play: {
    label: "Play",
    hint: "How expressive and lively Papee behaves.",
    icon: Gamepad2,
  },
};
const PERSONALITY_BASELINE: Record<PersonalityFacetId, number> = {
  warmth: 56,
  focus: 54,
  curiosity: 58,
  play: 52,
};
const PERSONALITY_VIBE_BIAS: Record<CompanionVibeId, Partial<Record<PersonalityFacetId, number>>> = {
  cozy: { warmth: 4, focus: 1, curiosity: 1, play: 2 },
  tactical: { warmth: -2, focus: 5, curiosity: 2, play: -3 },
  showtime: { warmth: 2, focus: -2, curiosity: 2, play: 5 },
};

function pickNextRoamStation(previous: number) {
  if (ROAM_STATIONS.length <= 1) return previous;
  let next = previous;
  while (next === previous) {
    next = Math.floor(Math.random() * ROAM_STATIONS.length);
  }
  return next;
}

function nearestRoamStationIndex(xPercent: number) {
  let bestIdx = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < ROAM_STATIONS.length; index += 1) {
    const station = ROAM_STATIONS[index];
    const distance = Math.abs(station.x - xPercent);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIdx = index;
    }
  }
  return bestIdx;
}

function getBondTier(points: number): BondTier {
  return BOND_TIERS.find((tier) => points >= tier.min && points <= tier.max) ?? BOND_TIERS[0];
}

function getBondProgress(points: number, tier: BondTier): number {
  if (tier.max >= 9999) return 100;
  const span = tier.max - tier.min + 1;
  const offset = Math.max(0, Math.min(span, points - tier.min + 1));
  return Math.round((offset / span) * 100);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function dominantPersonalityFacet(scores: Record<PersonalityFacetId, number>): PersonalityFacetId {
  const ordered = Object.entries(scores) as Array<[PersonalityFacetId, number]>;
  ordered.sort((a, b) => b[1] - a[1]);
  return ordered[0]?.[0] ?? "curiosity";
}

function toneFromBurst(tone: HabitatBurstTone): PersonalityMomentTone {
  if (tone === "heart") return "warm";
  if (tone === "alert") return "alert";
  return "signal";
}

function buildAmbientLines(args: {
  firstName: string;
  companyName: string;
  bondTitle: string;
  vibeTitle: string;
  temperamentLabel: string;
  isRoaming: boolean;
  energyLevel: number;
  criticalIssueCount: number;
  healthIssueCount: number;
  currentRunAgentName: string | null;
  currentIssueIdentifier: string | null;
}): string[] {
  const {
    firstName,
    companyName,
    bondTitle,
    vibeTitle,
    temperamentLabel,
    isRoaming,
    energyLevel,
    criticalIssueCount,
    healthIssueCount,
    currentRunAgentName,
    currentIssueIdentifier,
  } = args;

  if (energyLevel < 25) {
    return [
      "I am on low-energy personality mode.",
      "Tap or hype me and I will snap back faster.",
      `${vibeTitle} vibe still active. ${temperamentLabel} instincts are intact.`,
      "Still patrolling, just with smaller footsteps.",
    ];
  }

  if (criticalIssueCount > 0) {
    return [
      `Heads up ${firstName}, I spotted critical noise.`,
      "I am in escalation mode. Want the shortest risk brief?",
      `${temperamentLabel} posture engaged for fast decisions.`,
      "I can route you straight to the hottest issue.",
    ];
  }

  if (currentRunAgentName) {
    return [
      `I am shadowing ${currentRunAgentName} live.`,
      "Want a one-line status with next best action?",
      `${vibeTitle} channel is shaping how I brief you.`,
      currentIssueIdentifier
        ? `Current focus: ${currentIssueIdentifier}. I can summarize it.`
        : "I can break this run into signal vs noise for you.",
    ];
  }

  if (healthIssueCount > 0) {
    return [
      "I am scanning for blockers while I patrol.",
      `${healthIssueCount} signal${healthIssueCount === 1 ? "" : "s"} on my watchlist right now.`,
      `${temperamentLabel} mode is filtering what deserves attention.`,
      "Say the word and I will rank what matters first.",
    ];
  }

  if (isRoaming) {
    return [
      `Patrolling ${companyName} lanes.`,
      `${bondTitle} mode: smooth and ready.`,
      `${vibeTitle} vibe is shaping my route and chatter.`,
      "Tap a waypoint and I will reroute instantly.",
    ];
  }

  return [
    `Standing by, ${firstName}.`,
    `${temperamentLabel} tone with ${vibeTitle.toLowerCase()} delivery.`,
    "I am tuned for high-signal updates only.",
    "Give me a cue and I will switch modes.",
  ];
}

function parseProfileMirror(raw: string | null): ProfileMirror | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ProfileMirror;
    if (parsed.version !== PAPEE_PROFILE_MIRROR_VERSION) return null;
    if (!parsed.profile || typeof parsed.profile !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function readProfileMirror(companyId: string | null): PapeeMobileSnapshot["profile"] | null {
  if (typeof window === "undefined" || !companyId) return null;
  const key = `paperclip:papee-profile-mirror:${companyId}`;
  const parsed = parseProfileMirror(window.localStorage.getItem(key));
  return parsed?.profile ?? null;
}

function writeProfileMirror(companyId: string | null, profile: PapeeMobileSnapshot["profile"]) {
  if (typeof window === "undefined" || !companyId) return;
  const key = `paperclip:papee-profile-mirror:${companyId}`;
  const payload: ProfileMirror = {
    version: PAPEE_PROFILE_MIRROR_VERSION,
    profile,
    savedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(key, JSON.stringify(payload));
}

function buildEventKey(type: PapeeInteractionEventType, detail?: string | null) {
  return `${type}:${detail ?? "default"}:${Math.round(Date.now() / 2000)}`;
}

function missionToneClass(urgency: CompanionMission["urgency"]) {
  if (urgency === "critical") {
    return "border-[color-mix(in_oklab,var(--destructive)_55%,var(--boared-rule))] bg-[color-mix(in_oklab,var(--destructive)_12%,var(--boared-paper)_88%)]";
  }
  if (urgency === "warning") {
    return "border-[color-mix(in_oklab,var(--boared-acid)_52%,var(--boared-rule))] bg-[color-mix(in_oklab,var(--boared-acid)_12%,var(--boared-paper)_88%)]";
  }
  return "border-[var(--boared-rule)] bg-background";
}

function currentHabitatPhase(now: Date): HabitatPhase {
  const hour = now.getHours();
  if (hour >= 5 && hour < 9) return "dawn";
  if (hour >= 9 && hour < 18) return "day";
  if (hour >= 18 && hour < 22) return "dusk";
  return "night";
}

function firstName(session: AuthSession | null): string | null {
  const raw = session?.user.name?.trim();
  if (!raw) return null;
  return raw.split(/\s+/)[0] ?? null;
}

function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

function triggerHaptic(pattern: number | number[] = 14) {
  if (typeof navigator === "undefined") return;
  const withHaptics = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  withHaptics.vibrate?.(pattern);
}

function statusTone(issueCount: number): "default" | "secondary" | "destructive" {
  if (issueCount > 0) return "destructive";
  return "secondary";
}

function dedupeIssues(...lists: Array<Issue[] | undefined>) {
  const seen = new Set<string>();
  const merged: Issue[] = [];
  for (const list of lists) {
    for (const issue of list ?? []) {
      if (seen.has(issue.id)) continue;
      seen.add(issue.id);
      merged.push(issue);
    }
  }
  return merged;
}

function buildAmbientState(args: {
  companyName: string;
  liveRunCount: number;
  healthIssueCount: number;
  criticalIssueCount: number;
  currentFocusTitle: string | null;
  currentFocusStartedAt: string | null;
  currentHealthMessage: string | null;
  runningAgentCount: number;
}): AmbientState {
  const {
    companyName,
    liveRunCount,
    healthIssueCount,
    criticalIssueCount,
    currentFocusTitle,
    currentFocusStartedAt,
    currentHealthMessage,
    runningAgentCount,
  } = args;

  if (criticalIssueCount > 0) {
    return {
      badge: "Immediate attention",
      title: `${criticalIssueCount} critical signal${criticalIssueCount === 1 ? "" : "s"} detected`,
      subtitle: currentHealthMessage ?? "Papee is in high-alert mode and ready to escalate anything risky.",
      animState: "alarmed",
      mood: "urgent",
      energy: "high",
    };
  }

  if (currentFocusTitle) {
    return {
      badge: "Live focus",
      title: `Tracking ${currentFocusTitle}`,
      subtitle: currentFocusStartedAt
        ? `Live since ${relativeTime(currentFocusStartedAt)}. Papee is following every update as it lands.`
        : "Papee is actively tracking this thread and summarizing the signal.",
      animState: liveRunCount > 0 ? "writing" : "typing",
      mood: healthIssueCount > 0 ? "alert" : "curious",
      energy: "medium",
    };
  }

  if (healthIssueCount > 0) {
    return {
      badge: "Needs eyes",
      title: `${healthIssueCount} board signal${healthIssueCount === 1 ? "" : "s"} worth checking`,
      subtitle: currentHealthMessage ?? "Nothing catastrophic, but Papee is watching for drift and blockers.",
      animState: "thinking",
      mood: "alert",
      energy: "medium",
    };
  }

  if (runningAgentCount > 0) {
    return {
      badge: "Steady pulse",
      title: `${runningAgentCount} agent${runningAgentCount === 1 ? "" : "s"} active`,
      subtitle: `${companyName} is moving. Papee is keeping a soft watch and staying ready.`,
      animState: liveRunCount > 0 ? "typing" : "waving",
      mood: "happy",
      energy: "medium",
    };
  }

  return {
    badge: "Standby",
    title: `${companyName} is quiet right now`,
    subtitle: "No active runs at this moment. Papee is calm, present, and ready to jump in.",
    animState: "scanning",
    mood: "calm",
    energy: "low",
  };
}

function energyPulseClass(energy: AmbientState["energy"]) {
  if (energy === "high") return "papee-mobile-pulse--high";
  if (energy === "medium") return "papee-mobile-pulse--mid";
  return "papee-mobile-pulse--low";
}

function CompanionActionButton({
  icon: Icon,
  title,
  subtitle,
  onClick,
  disabled,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "papee-mobile-action group flex min-h-20 flex-col items-start justify-between gap-2 rounded-[1rem] border border-[var(--boared-rule)] bg-[color-mix(in_oklab,var(--boared-paper)_86%,var(--boared-acid)_14%)] px-3 py-2.5 text-left transition-all",
        "hover:border-foreground hover:bg-[color-mix(in_oklab,var(--boared-paper)_80%,var(--boared-acid)_20%)]",
        "disabled:cursor-not-allowed disabled:opacity-55",
      )}
    >
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-[0.65rem] border border-[var(--boared-rule)] bg-background text-foreground transition-transform group-active:scale-95">
        <Icon className="h-4 w-4" />
      </span>
      <span>
        <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-foreground">{title}</span>
        <span className="mt-0.5 block font-mono text-[0.62rem] leading-snug text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}

function PowerActionButton({
  action,
  busy,
  onRun,
}: {
  action: PowerActionDefinition;
  busy: boolean;
  onRun: (action: PowerActionDefinition) => void;
}) {
  const Icon = action.icon;
  const toneClass =
    action.tone === "danger"
      ? "border-[color-mix(in_oklab,var(--destructive)_45%,var(--boared-rule))] bg-[color-mix(in_oklab,var(--destructive)_12%,var(--boared-paper)_88%)]"
      : action.tone === "act"
        ? "border-[color-mix(in_oklab,var(--boared-acid)_42%,var(--boared-rule))] bg-[color-mix(in_oklab,var(--boared-paper)_80%,var(--boared-acid)_20%)]"
        : "border-[var(--boared-rule)] bg-background";
  const toneLabel = action.tone === "danger" ? "Guarded" : action.tone === "act" ? "Action" : "Read";
  const isDisabled = !action.tool || busy;

  return (
    <button
      type="button"
      onClick={() => onRun(action)}
      disabled={isDisabled}
      className={cn(
        "papee-mobile-action flex min-h-[5.7rem] flex-col justify-between rounded-[0.9rem] border px-2.5 py-2 text-left transition-all",
        toneClass,
        "hover:border-foreground disabled:cursor-not-allowed disabled:opacity-50",
      )}
      title={action.disabledReason}
    >
      <div className="flex items-start justify-between gap-1.5">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[0.55rem] border border-[var(--boared-rule)] bg-background">
          {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
        </span>
        <span className="font-mono text-[0.5rem] uppercase tracking-[0.08em] text-muted-foreground">{toneLabel}</span>
      </div>
      <div>
        <p className="text-[0.69rem] font-semibold leading-tight text-foreground">{action.title}</p>
        <p className="mt-1 line-clamp-2 font-mono text-[0.55rem] leading-snug text-muted-foreground">
          {action.disabledReason ?? action.subtitle}
        </p>
      </div>
    </button>
  );
}

function PocketMessageBubble({
  message,
  onFollowUp,
}: {
  message: ChatMessage;
  onFollowUp: (text: string) => void;
}) {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();
  const isUser = message.role === "user";

  async function handleAction(action: PapeeAction) {
    switch (action.type) {
      case "navigate":
        if (action.payload.path) navigate(action.payload.path);
        break;
      case "wake_agent":
        if (action.payload.agentId && selectedCompanyId) {
          try {
            await agentsApi.wakeup(
              action.payload.agentId,
              {
                source: "on_demand",
                triggerDetail: "manual",
                reason: action.payload.reason ?? "Woken by Papee from /papee mobile page",
              },
              selectedCompanyId,
            );
          } catch {
            // Keep the thread readable; top-level data refreshes naturally.
          }
        }
        break;
      case "show_issue":
        if (action.payload.issueId) navigate(`/issues/${action.payload.issueId}`);
        break;
      case "grant_secret":
        if (action.payload.path) navigate(action.payload.path);
        break;
    }
  }

  return (
    <div className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-[0.6rem] border border-[var(--boared-acid)] bg-[var(--boared-acid)] text-[var(--boared-acid-ink)]">
          <Sparkles className="h-3 w-3" />
        </div>
      )}

      <div className="max-w-[90%] space-y-1">
        <div
          className={cn(
            "rounded-[1rem] border px-3.5 py-3 text-[0.82rem] leading-relaxed",
            isUser
              ? "border-foreground bg-foreground text-background"
              : "border-[var(--boared-rule)] bg-[color-mix(in_oklab,var(--boared-paper)_84%,var(--boared-acid)_16%)] text-foreground",
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm max-w-none dark:prose-invert [&_p]:my-1 [&_ul]:my-2 [&_ol]:my-2 [&_code]:bg-background [&_code]:px-1 [&_code]:py-0.5 [&_pre]:border [&_pre]:border-[var(--boared-rule)] [&_pre]:bg-background">
              <MarkdownBody>{message.content}</MarkdownBody>
            </div>
          )}

          {!isUser && message.followUps && message.followUps.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--boared-rule)] pt-3">
              {message.followUps.map((text) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => onFollowUp(text)}
                  className="rounded-full border border-[var(--boared-rule)] bg-background px-2.5 py-1 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                >
                  {text}
                </button>
              ))}
            </div>
          )}

          {!isUser && message.actions && message.actions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--boared-rule)] pt-3">
              {message.actions.map((action) => (
                <button
                  key={`${action.type}:${action.label}`}
                  type="button"
                  onClick={() => {
                    void handleAction(action);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-foreground bg-background px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-foreground transition-colors hover:bg-foreground hover:text-background"
                >
                  <ArrowUpRight className="h-3 w-3" />
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <p className={cn("px-1 font-mono text-[0.58rem] text-muted-foreground", isUser ? "text-right" : "text-left")}>
          {relativeTime(new Date(message.timestamp))}
        </p>
      </div>
    </div>
  );
}

export function PapeeMobilePage() {
  const { companies, loading, selectedCompany, setSelectedCompanyId } = useCompany();
  const { openOnboarding } = useDialog();
  const papee = usePapeeOptional();
  const { messages, sendMessage, enact, isLoading, clearHistory, EnactConfirmDialog } = usePapeeChat();
  const [draft, setDraft] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("companion");
  const [standalone, setStandalone] = useState(() => isStandaloneMode());
  const [habitatFocusMode, setHabitatFocusMode] = useState(false);
  const [interactionNote, setInteractionNote] = useState<string | null>(null);
  const [steeringHint, setSteeringHint] = useState<string | null>(null);
  const [lastInteractionAt, setLastInteractionAt] = useState<number | null>(null);
  const [roamStationIdx, setRoamStationIdx] = useState(2);
  const [roamLegMs, setRoamLegMs] = useState(2200);
  const [roamFacing, setRoamFacing] = useState<1 | -1>(1);
  const [ambientLine, setAmbientLine] = useState<string | null>(null);
  const [bondPoints, setBondPoints] = useState(0);
  const [companionMode, setCompanionMode] = useState<CompanionMode>("balanced");
  const [companionVibe, setCompanionVibe] = useState<CompanionVibeId>("cozy");
  const [personalityScores, setPersonalityScores] = useState<Record<PersonalityFacetId, number>>(PERSONALITY_BASELINE);
  const [personalityMoments, setPersonalityMoments] = useState<PersonalityMoment[]>([]);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [lastMissionRunAt, setLastMissionRunAt] = useState<number | null>(null);
  const [lastMissionId, setLastMissionId] = useState<MissionId | null>(null);
  const [habitatBursts, setHabitatBursts] = useState<HabitatBurst[]>([]);
  const [checkInStreak, setCheckInStreak] = useState(1);
  const [lastCheckInAt, setLastCheckInAt] = useState<string | null>(null);
  const [energyLevel, setEnergyLevel] = useState(72);
  const [comboCharge, setComboCharge] = useState(0);
  const [comboFlash, setComboFlash] = useState<string | null>(null);
  const [habitatPhase, setHabitatPhase] = useState<HabitatPhase>(() => currentHabitatPhase(new Date()));
  const [ritualState, setRitualState] = useState<PapeeRitualState | null>(null);
  const [sinceLastVisitLabel, setSinceLastVisitLabel] = useState<string>("Welcome back.");
  const [motionProfile, setMotionProfile] = useState<MotionProfile>("full");
  const [actedTimeline, setActedTimeline] = useState<Array<{ id: number; summary: string; ok: boolean; at: number }>>([]);
  const [powerBusyActionId, setPowerBusyActionId] = useState<string | null>(null);
  const [profileUpdatedAt, setProfileUpdatedAt] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const habitatSectionRef = useRef<HTMLElement | null>(null);
  const controlSectionRef = useRef<HTMLElement | null>(null);
  const chatSectionRef = useRef<HTMLElement | null>(null);
  const roamStationIdxRef = useRef(roamStationIdx);
  const steeringStationRef = useRef<number | null>(null);
  const lastAmbientLineRef = useRef<string | null>(null);
  const burstSeqRef = useRef(0);
  const personalityMomentSeqRef = useRef(0);
  const habitatPointerStartRef = useRef<{ x: number; y: number; at: number; dragged: boolean } | null>(null);
  const habitatTapHistoryRef = useRef<number[]>([]);
  const lastToolTimelineKeyRef = useRef<string | null>(null);

  const activeCompany = selectedCompany ?? companies[0] ?? null;
  const companyId = activeCompany?.id ?? null;

  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });

  const { data: mobileSnapshot } = useQuery({
    queryKey: ["papee", "mobile-snapshot", companyId],
    queryFn: () => papeeApi.mobileSnapshot(companyId!),
    enabled: !!companyId,
    staleTime: 8_000,
    refetchInterval: 25_000,
  });

  const { data: dashboard } = useQuery({
    queryKey: queryKeys.dashboard(companyId ?? "__none__"),
    queryFn: () => dashboardApi.summary(companyId!),
    enabled: !!companyId,
    refetchInterval: 20_000,
  });

  const { data: health } = useQuery({
    queryKey: ["papee", "health", companyId, "mobile"],
    queryFn: () => papeeApi.health(companyId!),
    enabled: !!companyId,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const { data: liveRuns = [] } = useQuery({
    queryKey: [...queryKeys.liveRuns(companyId ?? "__none__"), "papee-mobile"],
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId!),
    enabled: !!companyId,
    refetchInterval: 5_000,
  });

  const { data: companyAgents = [] } = useQuery({
    queryKey: queryKeys.agents.list(companyId ?? "__none__"),
    queryFn: () => agentsApi.list(companyId!),
    enabled: !!companyId,
    staleTime: 20_000,
    refetchInterval: 35_000,
  });

  const userId = session?.user.id ?? null;
  const greetingName = firstName(session ?? null) ?? "there";

  const { data: unreadIssues } = useQuery({
    queryKey: userId && companyId ? queryKeys.issues.listUnreadTouchedByMe(companyId) : ["issues", "unread", "disabled"],
    queryFn: () => issuesApi.list(companyId!, { unreadForUserId: userId! }),
    enabled: !!companyId && !!userId,
    refetchInterval: 20_000,
  });

  const { data: touchedIssues } = useQuery({
    queryKey: userId && companyId ? queryKeys.issues.listTouchedByMe(companyId) : ["issues", "touched", "disabled"],
    queryFn: () => issuesApi.list(companyId!, { touchedByUserId: userId! }),
    enabled: !!companyId && !!userId,
    refetchInterval: 20_000,
  });

  const currentRun = useMemo(() => {
    const ordered = [...liveRuns].sort((a, b) => {
      const aTime = new Date(a.startedAt ?? a.createdAt).getTime();
      const bTime = new Date(b.startedAt ?? b.createdAt).getTime();
      return bTime - aTime;
    });
    return ordered.find((run) => run.status === "running" || run.status === "queued") ?? null;
  }, [liveRuns]);

  const { data: currentIssue } = useQuery({
    queryKey: currentRun?.issueId ? queryKeys.issues.detail(currentRun.issueId) : ["issues", "detail", "disabled"],
    queryFn: () => issuesApi.get(currentRun!.issueId!),
    enabled: !!currentRun?.issueId,
  });

  const personalIssues = useMemo(() => {
    const merged = dedupeIssues(unreadIssues, touchedIssues);
    return merged.filter((issue) => issue.id !== currentIssue?.id).slice(0, 4);
  }, [currentIssue?.id, touchedIssues, unreadIssues]);

  const latestRun = useMemo(() => {
    const ordered = [...liveRuns].sort((a, b) => {
      const aTime = new Date(a.startedAt ?? a.createdAt).getTime();
      const bTime = new Date(b.startedAt ?? b.createdAt).getTime();
      return bTime - aTime;
    });
    return ordered[0] ?? null;
  }, [liveRuns]);

  const focalIssue = currentIssue ?? personalIssues[0] ?? null;
  const primaryAgent = useMemo(() => {
    if (currentRun?.agentId) {
      const matched = companyAgents.find((agent) => agent.id === currentRun.agentId);
      if (matched) return matched;
    }
    if (latestRun?.agentId) {
      const matched = companyAgents.find((agent) => agent.id === latestRun.agentId);
      if (matched) return matched;
    }
    return companyAgents.find((agent) => agent.status === "running" || agent.status === "active") ?? companyAgents[0] ?? null;
  }, [companyAgents, currentRun?.agentId, latestRun?.agentId]);

  const nextIssueStatus = useMemo(() => {
    if (!focalIssue) return "in_progress";
    if (focalIssue.status === "todo") return "in_progress";
    if (focalIssue.status === "in_progress") return "in_review";
    if (focalIssue.status === "in_review") return "done";
    if (focalIssue.status === "blocked") return "todo";
    return "in_progress";
  }, [focalIssue]);

  const statusActionLabel = useMemo(() => {
    if (!focalIssue) return "Advance status";
    if (focalIssue.status === "todo") return "Start issue";
    if (focalIssue.status === "in_progress") return "Send to review";
    if (focalIssue.status === "in_review") return "Mark done";
    if (focalIssue.status === "blocked") return "Unblock issue";
    return "Advance status";
  }, [focalIssue]);

  const criticalIssueCount =
    mobileSnapshot?.liveSignal.criticalIssues
    ?? health?.issues.filter((issue) => issue.severity === "critical").length
    ?? 0;
  const warningIssueCount =
    mobileSnapshot?.liveSignal.warningIssues
    ?? health?.issues.filter((issue) => issue.severity !== "critical").length
    ?? 0;
  const healthIssueCount = health?.issues.length ?? 0;
  const unreadCount = unreadIssues?.length ?? 0;
  const runningAgentCount =
    mobileSnapshot?.liveSignal.runningAgents
    ?? (dashboard?.agents.running ?? 0) + (dashboard?.agents.active ?? 0);
  const focusLabel =
    currentIssue?.identifier
    ?? currentIssue?.title
    ?? mobileSnapshot?.liveSignal.currentIssueIdentifier
    ?? mobileSnapshot?.liveSignal.currentIssueTitle
    ?? currentRun?.agentName
    ?? null;

  const ambient = buildAmbientState({
    companyName: activeCompany?.name ?? "Paperclip",
    liveRunCount: liveRuns.length,
    healthIssueCount,
    criticalIssueCount,
    currentFocusTitle: focusLabel,
    currentFocusStartedAt: currentRun?.startedAt ?? currentRun?.createdAt ?? null,
    currentHealthMessage: health?.issues[0]?.message ?? null,
    runningAgentCount,
  });

  const contextActionState = useMemo<PapeeAnimState | null>(() => {
    if (papee?.streamingActive) return "typing";
    const current = papee?.animState;
    if (!current) return null;
    return ACTIVE_CONTEXT_STATES.has(current) ? current : null;
  }, [papee?.animState, papee?.streamingActive]);

  const operationalWorkState = useMemo<PapeeAnimState | null>(() => {
    if (!currentRun) return null;
    return currentRun.status === "queued" ? "typing" : "writing";
  }, [currentRun]);

  const activeState = contextActionState ?? operationalWorkState;
  const isRoaming = !activeState;
  const characterState: PapeeAnimState = isRoaming ? "walking" : activeState;
  const roamingStation = isRoaming ? (ROAM_STATIONS[roamStationIdx] ?? WORK_STATION) : WORK_STATION;
  const chatterDock = useMemo<"center" | "left" | "right">(() => {
    if (roamingStation.x <= 24) return "left";
    if (roamingStation.x >= 76) return "right";
    return "center";
  }, [roamingStation.x]);

  const activityLabel = useMemo(() => {
    if (isRoaming) {
      if (criticalIssueCount > 0) return `Patrolling ${roamingStation.label} (high alert)`;
      if (healthIssueCount > 0) return `Patrolling ${roamingStation.label} (watchful)`;
      return `Patrolling ${roamingStation.label}`;
    }
    if (papee?.streamingActive) return "Responding to your chat";
    if (contextActionState) return "Reacting to your interaction";
    if (currentRun?.agentName) return `Co-piloting ${currentRun.agentName}`;
    return "Working";
  }, [
    criticalIssueCount,
    contextActionState,
    currentRun?.agentName,
    healthIssueCount,
    isRoaming,
    papee?.streamingActive,
    roamingStation.label,
  ]);

  const roamingSubtitle = useMemo(() => {
    if (criticalIssueCount > 0) return "Papee keeps moving while scanning critical signals.";
    if (healthIssueCount > 0) return "Papee is roaming and watching board health in real time.";
    return "Papee is walking continuous patrol.";
  }, [criticalIssueCount, healthIssueCount]);
  const habitatStatusLine = isRoaming ? roamingSubtitle : mobileSnapshot?.ambient.title ?? ambient.title;

  const quickPrompts = useMemo(() => {
    if (currentIssue?.identifier) {
      return [
        `What changed on ${currentIssue.identifier} since last check-in?`,
        "What should I decide next?",
        "Any blockers with real risk?",
      ];
    }
    if (healthIssueCount > 0) {
      return [
        "Give me the fastest risk summary.",
        "What should I check first?",
        "What can be solved in 5 minutes?",
      ];
    }
    return [
      "What are you doing right now?",
      "How is the company pulse?",
      "What should I check before I leave?",
    ];
  }, [currentIssue?.identifier, healthIssueCount]);

  const pocketSummary = useMemo(() => {
    if (criticalIssueCount > 0) return "High alert";
    if (healthIssueCount > 0) return "Watching closely";
    if (liveRuns.length > 0) return "Live activity";
    return "Calm standby";
  }, [criticalIssueCount, healthIssueCount, liveRuns.length]);

  const forYouCount = userId ? unreadCount : mobileSnapshot?.liveSignal.pendingApprovals ?? dashboard?.pendingApprovals ?? 0;
  const modeConfig = MODE_CONFIG[companionMode];
  const activeVibe = useMemo(
    () => COMPANION_VIBES.find((vibe) => vibe.id === companionVibe) ?? COMPANION_VIBES[0],
    [companionVibe],
  );
  const dominantFacet = useMemo(() => dominantPersonalityFacet(personalityScores), [personalityScores]);
  const temperamentLabel = useMemo(() => {
    if (dominantFacet === "warmth") return "Compassion-forward";
    if (dominantFacet === "focus") return "Execution-focused";
    if (dominantFacet === "play") return "Expressive";
    return "Curious";
  }, [dominantFacet]);
  const temperamentSummary = useMemo(() => {
    if (criticalIssueCount > 0) return "Risk pressure detected, so Papee biases decisive and protective behavior.";
    if (energyLevel < 28) return "Low-energy pocket mode. Papee stays present but less theatrical.";
    if (dominantFacet === "warmth") return "Emotionally supportive and morale-first while still surfacing action.";
    if (dominantFacet === "focus") return "High signal filtering and tighter recommendations are currently dominant.";
    if (dominantFacet === "play") return "More motion, more charm, and faster engagement loops are active.";
    return "Exploration mode: Papee probes context and finds hidden opportunities.";
  }, [criticalIssueCount, dominantFacet, energyLevel]);
  const personalityFacets = useMemo(
    () =>
      (Object.keys(PERSONALITY_FACET_META) as PersonalityFacetId[]).map((id) => ({
        id,
        value: clampNumber(Math.round(personalityScores[id]), 0, 100),
        ...PERSONALITY_FACET_META[id],
      })),
    [personalityScores],
  );
  const phaseLabel = useMemo(() => {
    if (habitatPhase === "dawn") return "Dawn";
    if (habitatPhase === "day") return "Day";
    if (habitatPhase === "dusk") return "Dusk";
    return "Night";
  }, [habitatPhase]);
  const energyHint = useMemo(() => {
    if (energyLevel >= 75) return "Charged. Papee is highly expressive.";
    if (energyLevel >= 45) return "Steady. Good rhythm and responsiveness.";
    if (energyLevel >= 25) return "Draining. Feed more interactions for peak vibe.";
    return "Low battery mood. Pet or hype to recharge quickly.";
  }, [energyLevel]);
  const renderMood = useMemo<PapeeMood>(() => {
    if (energyLevel < 22) return "sleepy";
    if (companionMode === "guardian" && isRoaming) return "guarding";
    return ambient.mood;
  }, [ambient.mood, companionMode, energyLevel, isRoaming]);
  const presenceSummary = useMemo(() => {
    if (criticalIssueCount > 0) return "Guardian stance is active while Papee patrols risk.";
    if (energyLevel < 25) return "Low-energy personality mode. Interact to recharge Papee.";
    if (!isRoaming) return "Papee is actively handling your latest cue.";
    if (companionVibe === "tactical") return "Tactical vibe: stricter filtering, tighter loops, sharper calls.";
    if (companionVibe === "showtime") return "Showtime vibe: highly expressive motion and upbeat pacing.";
    if (companionMode === "playful") return "Playful patrol: faster loops, higher personality.";
    if (companionMode === "guardian") return "Guardian patrol: slower, stricter, escalation-aware.";
    return "Balanced patrol: steady movement and concise signal.";
  }, [companionMode, companionVibe, criticalIssueCount, energyLevel, isRoaming]);
  const missionLogLabel = useMemo(() => {
    if (!lastMissionId || !lastMissionRunAt) return null;
    const byId: Record<MissionId, string> = {
      triage: "Risk triage run",
      live: "Live co-pilot brief",
      inbox: "Inbox sweep",
      bond: "Bond ritual",
    };
    return `${byId[lastMissionId]} · ${relativeTime(new Date(lastMissionRunAt))}`;
  }, [lastMissionId, lastMissionRunAt]);
  const bondTier = useMemo(() => getBondTier(bondPoints), [bondPoints]);
  const bondProgress = useMemo(() => getBondProgress(bondPoints, bondTier), [bondPoints, bondTier]);
  const streakSubtitle = useMemo(() => {
    if (!lastCheckInAt) return "First check-in registered.";
    return `Last check-in ${relativeTime(new Date(lastCheckInAt))}`;
  }, [lastCheckInAt]);
  const ritualTracks = useMemo(() => {
    if (ritualState?.tracks && ritualState.tracks.length > 0) return ritualState.tracks;
    return RITUAL_ORDER.map((id) => ({
      id,
      title: RITUAL_LABELS[id],
      steps:
        id === "pulse_sweep"
          ? ["Scan signal", "Prioritize risk", "Decide first move"]
          : id === "focus_sprint"
            ? ["Pick target", "Generate brief", "Commit next action"]
            : ["Review movement", "De-noise queue", "Set next-start cue"],
      activeStep: 0,
      completedAt: null,
    }));
  }, [ritualState?.tracks]);
  const activeRitualId =
    ritualState?.activeRitualId
    ?? ritualState?.suggestedRitualId
    ?? (criticalIssueCount > 0 ? "pulse_sweep" : liveRuns.length > 0 ? "focus_sprint" : "wrap_prepare");
  const ritualLead = useMemo(() => ritualTracks.find((track) => track.id === activeRitualId) ?? ritualTracks[0] ?? null, [activeRitualId, ritualTracks]);
  const ritualLeadStep = ritualLead ? Math.max(0, Math.min(ritualLead.steps.length - 1, ritualLead.activeStep)) : 0;
  const ritualLeadStepLabel = ritualLead?.steps[ritualLeadStep] ?? null;
  const ritualLeadCompleted = ritualLead ? !!ritualLead.completedAt || ritualLeadStep >= ritualLead.steps.length - 1 : false;
  const ritualLeadProgress = ritualLead ? Math.round(((ritualLeadStep + 1) / ritualLead.steps.length) * 100) : 0;
  const ritualLeadMissionId = ritualLead ? RITUAL_MISSION_MAP[ritualLead.id] : "bond";
  const missions = useMemo<CompanionMission[]>(() => {
    const list: CompanionMission[] = [];

    if (criticalIssueCount > 0 || healthIssueCount > 0) {
      list.push({
        id: "triage",
        title: "Risk triage",
        detail:
          criticalIssueCount > 0
            ? `${criticalIssueCount} critical signal${criticalIssueCount === 1 ? "" : "s"} need a call.`
            : "Run a short risk ranking of board signals.",
        cta: "Triage now",
        urgency: criticalIssueCount > 0 ? "critical" : "warning",
      });
    }

    if (currentRun) {
      list.push({
        id: "live",
        title: "Live co-pilot",
        detail: `Shadow ${currentRun.agentName} and propose the next decision.`,
        cta: "Brief me live",
        urgency: "normal",
      });
    }

    if ((userId && unreadCount > 0) || (!userId && (dashboard?.pendingApprovals ?? 0) > 0)) {
      list.push({
        id: "inbox",
        title: userId ? "Inbox sweep" : "Approval sweep",
        detail: userId
          ? `${unreadCount} item${unreadCount === 1 ? "" : "s"} waiting for you.`
          : `${dashboard?.pendingApprovals ?? 0} pending board approval${(dashboard?.pendingApprovals ?? 0) === 1 ? "" : "s"}.`,
        cta: "Open queue",
        urgency: "warning",
      });
    }

    list.push({
      id: "bond",
      title: "Bond ritual",
      detail: "Small personality routine for extra context and morale.",
      cta: "Run ritual",
      urgency: "normal",
    });

    return list.slice(0, 3);
  }, [criticalIssueCount, currentRun, dashboard?.pendingApprovals, healthIssueCount, unreadCount, userId]);
  const ambientLinePool = useMemo(
    () =>
      buildAmbientLines({
        firstName: greetingName,
        companyName: activeCompany?.name ?? "Paperclip",
        bondTitle: bondTier.title,
        vibeTitle: activeVibe.title,
        temperamentLabel,
        isRoaming,
        energyLevel,
        criticalIssueCount,
        healthIssueCount,
        currentRunAgentName: currentRun?.agentName ?? null,
        currentIssueIdentifier: currentIssue?.identifier ?? null,
      }),
    [
      activeCompany?.name,
      activeVibe.title,
      bondTier.title,
      criticalIssueCount,
      currentIssue?.identifier,
      currentRun?.agentName,
      energyLevel,
      greetingName,
      healthIssueCount,
      isRoaming,
      temperamentLabel,
    ],
  );

  const powerActions = useMemo<PowerActionDefinition[]>(() => {
    const focalLabel = focalIssue?.identifier ?? "focus issue";
    const relevanceQuery =
      focalIssue?.identifier
      ?? focalIssue?.title.split(/\s+/).slice(0, 3).join(" ")
      ?? "error";
    const raisePriorityTo = focalIssue?.priority === "critical" ? "high" : "critical";
    const followUpTitle = focalIssue
      ? `Follow-up: ${focalIssue.title}`
      : `Papee check-in ${new Date().toLocaleDateString()}`;
    const followUpDesc = focalIssue
      ? `Created from /papee power deck while tracking ${focalLabel}.`
      : "Created from /papee power deck.";

    return [
      {
        id: "changes",
        title: "Recent changes",
        subtitle: "Read latest board activity and deltas.",
        icon: Waves,
        tone: "read",
        tool: { kind: "listRecentChanges" },
      },
      {
        id: "blockers",
        title: "Find blockers",
        subtitle: "Search blocked work across the company.",
        icon: TriangleAlert,
        tone: "read",
        tool: { kind: "searchIssues", query: "blocked" },
      },
      {
        id: "thread-brief",
        title: "Summarize thread",
        subtitle: `Extract signal from ${focalLabel}.`,
        icon: MessageCircle,
        tone: "read",
        tool: focalIssue ? { kind: "summarizeThread", issueId: focalIssue.id } : null,
        disabledReason: focalIssue ? undefined : "No issue context yet.",
      },
      {
        id: "relevant-files",
        title: "Relevant files",
        subtitle: `Pull evidence linked to ${focalLabel}.`,
        icon: Gauge,
        tone: "read",
        tool: focalIssue
          ? { kind: "listIssueRelevantFiles", issueId: focalIssue.id, limit: 8 }
          : { kind: "searchFiles", query: relevanceQuery, limit: 8 },
      },
      {
        id: "advance-status",
        title: statusActionLabel,
        subtitle: `Move ${focalLabel} to ${nextIssueStatus}.`,
        icon: ListChecks,
        tone: "act",
        tool: focalIssue ? { kind: "setIssueStatus", issueId: focalIssue.id, status: nextIssueStatus } : null,
        disabledReason: focalIssue ? undefined : "No issue selected.",
      },
      {
        id: "raise-priority",
        title: "Adjust priority",
        subtitle: `Set ${focalLabel} to ${raisePriorityTo}.`,
        icon: CircleDot,
        tone: "act",
        tool: focalIssue ? { kind: "setIssuePriority", issueId: focalIssue.id, priority: raisePriorityTo } : null,
        disabledReason: focalIssue ? undefined : "No issue selected.",
      },
      {
        id: "create-followup",
        title: "Create follow-up",
        subtitle: "Open a new issue anchored in current context.",
        icon: Sparkles,
        tone: "act",
        tool: {
          kind: "createIssue",
          title: followUpTitle,
          description: followUpDesc,
          projectId: focalIssue?.projectId ?? undefined,
        },
      },
      {
        id: "toggle-agent",
        title: primaryAgent?.status === "paused" ? "Resume agent" : "Pause agent",
        subtitle: primaryAgent
          ? `${primaryAgent.name} · ${primaryAgent.status}`
          : "Needs an available agent.",
        icon: Bot,
        tone: "act",
        tool: primaryAgent
          ? { kind: "pauseAgent", agentId: primaryAgent.id, paused: primaryAgent.status !== "paused" }
          : null,
        disabledReason: primaryAgent ? undefined : "No controllable agent found.",
      },
      {
        id: "run-agent",
        title: "Trigger run",
        subtitle: primaryAgent ? `Launch ${primaryAgent.name} now.` : "Needs an available agent.",
        icon: Zap,
        tone: "danger",
        tool: primaryAgent
          ? {
            kind: "triggerAgentRun",
            agentId: primaryAgent.id,
            prompt: focalIssue
              ? `Take a focused pass on ${focalIssue.identifier ?? focalIssue.title} and report highest-leverage next step.`
              : "Take a focused pass on the highest risk queue item and report next step.",
          }
          : null,
        disabledReason: primaryAgent ? undefined : "No controllable agent found.",
      },
      {
        id: "stop-run",
        title: "Stop run",
        subtitle: currentRun ? `Cancel ${currentRun.agentName}'s live run.` : "No live run to stop.",
        icon: Shield,
        tone: "danger",
        tool: currentRun ? { kind: "killRun", runId: currentRun.id } : null,
        disabledReason: currentRun ? undefined : "No live run to stop.",
      },
    ];
  }, [currentRun, focalIssue, nextIssueStatus, primaryAgent, statusActionLabel]);

  const pushActedEntry = useCallback((summary: string, ok = true) => {
    setActedTimeline((previous) => [
      { id: Date.now() + Math.floor(Math.random() * 1000), summary, ok, at: Date.now() },
      ...previous,
    ].slice(0, 5));
  }, []);

  const pushPersonalityMoment = useCallback((text: string, tone: PersonalityMomentTone = "signal") => {
    personalityMomentSeqRef.current += 1;
    setPersonalityMoments((previous) => [
      {
        id: personalityMomentSeqRef.current,
        text,
        tone,
        at: Date.now(),
      },
      ...previous,
    ].slice(0, 6));
  }, []);

  const applyPersonalityDelta = useCallback((delta: Partial<Record<PersonalityFacetId, number>>) => {
    setPersonalityScores((previous) => {
      const next = { ...previous };
      (Object.keys(delta) as PersonalityFacetId[]).forEach((facet) => {
        next[facet] = clampNumber(previous[facet] + (delta[facet] ?? 0), 0, 100);
      });
      return next;
    });
  }, []);

  const applyCompanionProfile = useCallback((
    profile: PapeeMobileSnapshot["profile"],
    options?: { persistMirror?: boolean },
  ) => {
    const safeProfile = sanitizeCompanionProfile(profile);
    const normalizedMode = normalizeCompanionMode(safeProfile.companionMode);
    setBondPoints(safeProfile.bondPoints);
    setCheckInStreak(safeProfile.checkInStreak);
    setEnergyLevel(safeProfile.energyLevel);
    setCompanionMode(normalizedMode);
    setCompanionVibe(MODE_TO_VIBE[normalizedMode]);
    setLastCheckInAt(safeProfile.lastCheckInAt);
    setProfileUpdatedAt(safeProfile.updatedAt);
    if (options?.persistMirror ?? true) {
      writeProfileMirror(companyId, safeProfile);
    }
  }, [companyId]);

  const syncRitualState = useCallback((next: PapeeRitualState | null | undefined) => {
    if (!next) return;
    setRitualState(next);
  }, []);

  const goToView = useCallback((next: ViewMode) => {
    setViewMode(next);
    const target =
      next === "companion"
        ? habitatSectionRef.current
        : next === "control"
          ? controlSectionRef.current
          : chatSectionRef.current;
    window.setTimeout(() => {
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }, []);

  const recordCompanionInteraction = useCallback(async (
    type: PapeeInteractionEventType,
    opts?: { ritualId?: PapeeRitualId | null; detail?: string | null; metadata?: Record<string, unknown> },
  ) => {
    if (!companyId) return;
    const actionLabel = type.replace("_", " ");
    try {
      const result = await papeeApi.interact(companyId, {
        type,
        ritualId: opts?.ritualId ?? null,
        detail: opts?.detail ?? null,
        metadata: opts?.metadata ?? null,
        idempotencyKey: buildEventKey(type, opts?.detail),
      });
      applyCompanionProfile(result.profile);
      syncRitualState(result.ritualState);
      if (!result.idempotent) {
        pushActedEntry(`Papee acted · ${actionLabel}`, true);
      }
    } catch {
      // Keep /papee interactions resilient; local UX already updates.
      pushActedEntry(`Papee could not log ${actionLabel}`, false);
    }
  }, [applyCompanionProfile, companyId, pushActedEntry, syncRitualState]);

  const progressRitualTrack = useCallback(async (
    ritualId: PapeeRitualId,
    action: "advance" | "complete" = "advance",
  ) => {
    if (!companyId) return;
    try {
      const result = await papeeApi.progressRitual(companyId, ritualId, {
        action,
        idempotencyKey: buildEventKey("mission_step", `${ritualId}:${action}`),
      });
      applyCompanionProfile(result.profile);
      syncRitualState(result.ritualState);
      setLastMissionRunAt(Date.now());
      setLastMissionId(ritualId === "pulse_sweep" ? "triage" : ritualId === "focus_sprint" ? "live" : "bond");
      const updatedTrack = result.ritualState.tracks.find((track) => track.id === ritualId);
      const completed = !!updatedTrack?.completedAt;
      if (completed) {
        spawnHabitatBurst("heart", roamingStation.x, ROAM_LANE_Y - 10);
        setInteractionNote(`${RITUAL_LABELS[ritualId]} completed.`);
        setAmbientLine("Ritual complete. Reward loop locked in.");
        setBondPoints((points) => points + 1);
        applyPersonalityDelta({ warmth: 2, focus: 1, curiosity: 1 });
        pushPersonalityMoment(`${RITUAL_LABELS[ritualId]} complete. Papee feels in sync.`, "warm");
        emitHaptic([14, 40, 14]);
        pushActedEntry(`Papee completed ${RITUAL_LABELS[ritualId]}`, true);
      } else {
        const stepLabel = updatedTrack ? `${updatedTrack.activeStep + 1}/${updatedTrack.steps.length}` : "step";
        setInteractionNote(`${RITUAL_LABELS[ritualId]} progressed (${stepLabel}).`);
        applyPersonalityDelta({ focus: 1, curiosity: 1 });
        pushPersonalityMoment(`${RITUAL_LABELS[ritualId]} advanced to ${stepLabel}.`, "signal");
        pushActedEntry(`Papee advanced ${RITUAL_LABELS[ritualId]}`, true);
      }
    } catch {
      // Non-blocking by design.
      pushActedEntry(`Papee could not progress ${RITUAL_LABELS[ritualId]}`, false);
    }
  }, [
    applyCompanionProfile,
    applyPersonalityDelta,
    companyId,
    emitHaptic,
    pushActedEntry,
    pushPersonalityMoment,
    roamingStation.x,
    syncRitualState,
  ]);

  const sendChatPrompt = useCallback((text: string, detail: string) => {
    setViewMode("chat");
    sendMessage(text);
    setLastInteractionAt(Date.now());
    applyPersonalityDelta({ curiosity: 1, focus: 1 });
    pushPersonalityMoment("You prompted a fresh conversation loop.", "signal");
    void recordCompanionInteraction("chat_prompt", {
      ritualId: activeRitualId,
      detail,
      metadata: { length: text.length },
    });
  }, [activeRitualId, applyPersonalityDelta, pushPersonalityMoment, recordCompanionInteraction, sendMessage]);

  function emitHaptic(pattern: number | number[] = 14) {
    if (!hapticsEnabled) return;
    triggerHaptic(pattern);
  }

  function spawnHabitatBurst(tone: HabitatBurstTone, x = roamingStation.x, y = roamingStation.y) {
    burstSeqRef.current += 1;
    setHabitatBursts((previous) => [
      ...previous,
      {
        id: burstSeqRef.current,
        x: Math.max(6, Math.min(94, x)),
        y: Math.max(20, Math.min(86, y)),
        tone,
        bornAt: Date.now(),
      },
    ]);
  }

  const applyCompanionVibe = useCallback((vibeId: CompanionVibeId, source = "manual") => {
    const vibe = COMPANION_VIBES.find((entry) => entry.id === vibeId);
    if (!vibe) return;
    setCompanionVibe(vibe.id);
    setCompanionMode(vibe.mode);
    setLastInteractionAt(Date.now());
    papee?.queueReaction(vibe.reaction, 1600);
    setInteractionNote(`${vibe.title} vibe active.`);
    setAmbientLine(vibe.ambientLine);
    spawnHabitatBurst(vibe.tone, roamingStation.x, ROAM_LANE_Y - 8);
    applyPersonalityDelta(PERSONALITY_VIBE_BIAS[vibe.id]);
    pushPersonalityMoment(`${vibe.title}: ${vibe.subtitle}`, toneFromBurst(vibe.tone));
    emitHaptic(vibe.id === "showtime" ? [10, 30, 10] : 10);
    void recordCompanionInteraction("focus_action", {
      detail: `vibe:${vibe.id}:${source}`,
      ritualId: vibe.ritualId,
      metadata: { vibe: vibe.id },
    });
  }, [
    applyPersonalityDelta,
    emitHaptic,
    papee,
    pushPersonalityMoment,
    recordCompanionInteraction,
    roamingStation.x,
  ]);

  const cycleCompanionMode = (next: CompanionMode) => {
    setCompanionMode(next);
    setCompanionVibe(MODE_TO_VIBE[next]);
    setLastInteractionAt(Date.now());
    setInteractionNote(`Companion mode switched to ${MODE_CONFIG[next].label.toLowerCase()}.`);
    setAmbientLine(`Mode set: ${MODE_CONFIG[next].description}`);
    setBondPoints((points) => points + 1);
    applyPersonalityDelta(
      next === "guardian"
        ? { focus: 3, play: -1 }
        : next === "playful"
          ? { play: 3, warmth: 1, focus: -1 }
          : { warmth: 1, curiosity: 1 },
    );
    pushPersonalityMoment(`${MODE_CONFIG[next].label} mode engaged.`, "signal");
    spawnHabitatBurst("spark", roamingStation.x, ROAM_LANE_Y - 8);
    emitHaptic(10);
    void recordCompanionInteraction("focus_action", {
      detail: `mode:${next}`,
      metadata: { mode: next },
    });
  };

  const runMission = (missionId: MissionId) => {
    const ritualId: PapeeRitualId =
      missionId === "triage"
        ? "pulse_sweep"
        : missionId === "live"
          ? "focus_sprint"
          : "wrap_prepare";
    setLastMissionId(missionId);
    setLastMissionRunAt(Date.now());
    setLastInteractionAt(Date.now());
    setViewMode(missionId === "bond" ? "companion" : "control");
    setBondPoints((points) => points + 2);
    setEnergyLevel((level) => Math.max(6, Math.min(100, level + (missionId === "bond" ? 4 : -2))));
    applyPersonalityDelta(
      missionId === "triage"
        ? { focus: 3, curiosity: 1, play: -1 }
        : missionId === "live"
          ? { focus: 2, curiosity: 1 }
          : missionId === "inbox"
            ? { focus: 2, warmth: 1 }
            : { warmth: 3, play: 2 },
    );
    emitHaptic(12);
    void recordCompanionInteraction("mission_step", { ritualId, detail: missionId });
    void progressRitualTrack(ritualId, "advance");

    if (missionId === "triage") {
      papee?.queueReaction(criticalIssueCount > 0 ? "alarmed" : "scanning", 1900);
      setInteractionNote("Running risk triage.");
      setAmbientLine("Triage mode on. Ranking the next highest-leverage move.");
      pushPersonalityMoment("Triage mission started. Papee tightened risk posture.", criticalIssueCount > 0 ? "alert" : "signal");
      spawnHabitatBurst(criticalIssueCount > 0 ? "alert" : "spark");
      sendMessage("Run a concise triage: top risks, urgency, and recommended first action.");
      return;
    }

    if (missionId === "live") {
      papee?.queueReaction("writing", 1800);
      setInteractionNote("Generating live co-pilot brief.");
      setAmbientLine("I am tracing the live run and extracting decision points.");
      pushPersonalityMoment("Live co-pilot loop engaged. Papee is tracking details in real time.", "signal");
      spawnHabitatBurst("spark");
      sendMessage(
        currentRun
          ? `Give a live co-pilot brief for ${currentRun.agentName}: progress, risk, next decision.`
          : "Give a live co-pilot brief for current activity.",
      );
      return;
    }

    if (missionId === "inbox") {
      papee?.queueReaction("scanning", 1700);
      setInteractionNote(userId ? "Sweeping your queue." : "Sweeping pending approvals.");
      setAmbientLine("Queue sweep initiated. I will keep it short and actionable.");
      pushPersonalityMoment("Queue sweep started. Papee is sorting what matters first.", "signal");
      spawnHabitatBurst("spark");
      if (userId && personalIssues[0]) {
        sendMessage("Give me a shortest-path summary of my unread/touched issues and what to do first.");
        return;
      }
      if (!userId && (dashboard?.pendingApprovals ?? 0) > 0) {
        sendMessage("Summarize pending approvals in priority order with recommendation.");
        return;
      }
      sendMessage("Give me a quick queue overview and next action.");
      return;
    }

    papee?.queueReaction("speaking-gesture", 1900);
    setInteractionNote("Running bond ritual.");
    setAmbientLine("Ritual complete. Syncing tone and focus.");
    pushPersonalityMoment("Bond ritual kicked off. Papee is leaning into warmth and morale.", "warm");
    spawnHabitatBurst("heart");
    sendMessage("Give me a warm but concise state-of-play check-in in three bullets.");
  };

  async function runPowerAction(action: PowerActionDefinition) {
    if (!action.tool || powerBusyActionId) return;
    setPowerBusyActionId(action.id);
    setLastInteractionAt(Date.now());
    setViewMode("control");
    setInteractionNote(`Power action: ${action.title}`);
    setAmbientLine(`Executing ${action.title.toLowerCase()}...`);
    applyPersonalityDelta(
      action.tone === "danger"
        ? { focus: 3, curiosity: 1, play: -1 }
        : action.tone === "act"
          ? { focus: 2, curiosity: 1 }
          : { curiosity: 2, focus: 1 },
    );
    emitHaptic(action.tone === "danger" ? [10, 28, 10] : 8);
    try {
      const result = await enact(action.tool);
      setAmbientLine(result.ok ? result.summary : result.error ?? result.summary);
      setInteractionNote(
        result.ok
          ? `${action.title} complete.`
          : `${action.title} failed.`,
      );
      pushPersonalityMoment(
        result.ok
          ? `Power action "${action.title}" executed: ${result.summary}`
          : `Power action "${action.title}" failed: ${result.error ?? result.summary}`,
        result.ok ? "signal" : "alert",
      );
      void recordCompanionInteraction("focus_action", {
        ritualId: activeRitualId,
        detail: `power:${action.id}`,
      });
    } finally {
      setPowerBusyActionId(null);
    }
  }

  const runScenePreset = (presetId: ScenePresetId) => {
    setLastInteractionAt(Date.now());

    if (presetId === "steady") {
      setCompanionMode("balanced");
      setCompanionVibe("cozy");
      papee?.queueReaction("scanning", 1500);
      setInteractionNote("Steady scene loaded: balanced patrol and concise updates.");
      setAmbientLine("Steady scene active. Calm patrol with practical signal.");
      setBondPoints((points) => points + 1);
      setEnergyLevel((level) => Math.min(100, level + 2));
      applyPersonalityDelta({ warmth: 1, focus: 2, curiosity: 1 });
      pushPersonalityMoment("Steady scene loaded. Papee switched to composed patrol.", "signal");
      spawnHabitatBurst("spark");
      emitHaptic(8);
      void recordCompanionInteraction("focus_action", { detail: "scene:steady", ritualId: "pulse_sweep" });
      return;
    }

    if (presetId === "boost") {
      setCompanionMode("playful");
      setCompanionVibe("showtime");
      papee?.queueReaction("celebrating", 1750);
      setInteractionNote("Boost scene loaded: expressive personality and faster pacing.");
      setAmbientLine("Boost scene active. Bigger personality, faster movement.");
      setBondPoints((points) => points + 2);
      setEnergyLevel((level) => Math.min(100, level + 6));
      applyPersonalityDelta({ play: 4, warmth: 2, focus: -1 });
      pushPersonalityMoment("Boost scene loaded. Papee went full showtime.", "warm");
      spawnHabitatBurst("heart");
      spawnHabitatBurst("spark", roamingStation.x + 3, ROAM_LANE_Y - 7);
      emitHaptic([10, 26, 10]);
      void recordCompanionInteraction("toy", { detail: "scene:boost", ritualId: "focus_sprint" });
      return;
    }

    setCompanionMode("guardian");
    setCompanionVibe("tactical");
    papee?.queueReaction("guarding", 1600);
    setInteractionNote("Guard scene loaded: stricter filtering and escalation posture.");
    setAmbientLine("Guard scene active. Tight scan and immediate escalation on risk.");
    setBondPoints((points) => points + 1);
    setEnergyLevel((level) => Math.max(6, Math.min(100, level + 1)));
    applyPersonalityDelta({ focus: 4, curiosity: 1, play: -2 });
    pushPersonalityMoment("Guard scene loaded. Papee is enforcing stricter threat scanning.", "alert");
    spawnHabitatBurst("alert");
    emitHaptic(10);
    void recordCompanionInteraction("focus_action", { detail: "scene:guard", ritualId: "wrap_prepare" });
  };

  function runPersonalityNudge(intent: "soothe" | "challenge" | "energize") {
    setLastInteractionAt(Date.now());
    if (intent === "soothe") {
      applyPersonalityDelta({ warmth: 3, focus: 1, play: -1 });
      papee?.queueReaction("waving", 1350);
      setInteractionNote("Soothe cue: Papee is now gentler and steadier.");
      setAmbientLine("Soothe acknowledged. I will keep tone calm and supportive.");
      pushPersonalityMoment("Soothe nudge accepted. Warmth channel increased.", "warm");
      spawnHabitatBurst("heart");
      emitHaptic(8);
      void recordCompanionInteraction("focus_action", { detail: "personality:soothe", ritualId: "wrap_prepare" });
      return;
    }

    if (intent === "challenge") {
      applyPersonalityDelta({ focus: 3, curiosity: 2, play: -1 });
      papee?.queueReaction("magnifying", 1450);
      setInteractionNote("Challenge cue: Papee is sharpening analysis.");
      setAmbientLine("Challenge accepted. Tightening filters and seeking weak points.");
      pushPersonalityMoment("Challenge nudge accepted. Analysis posture intensified.", "alert");
      spawnHabitatBurst("alert");
      emitHaptic([10, 24, 10]);
      void recordCompanionInteraction("focus_action", { detail: "personality:challenge", ritualId: "pulse_sweep" });
      return;
    }

    applyPersonalityDelta({ play: 3, warmth: 1, curiosity: 1 });
    papee?.queueReaction("celebrating", 1500);
    setInteractionNote("Energize cue: Papee is in expressive mode.");
    setAmbientLine("Energize accepted. I am turning up expression and momentum.");
    pushPersonalityMoment("Energize nudge accepted. Expressive loop activated.", "warm");
    spawnHabitatBurst("spark");
    emitHaptic([8, 24, 8]);
    void recordCompanionInteraction("focus_action", { detail: "personality:energize", ritualId: "focus_sprint" });
  }

  function cycleVibeFromDock() {
    const currentIndex = COMPANION_VIBES.findIndex((vibe) => vibe.id === companionVibe);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % COMPANION_VIBES.length : 0;
    const nextVibe = COMPANION_VIBES[nextIndex];
    if (!nextVibe) return;
    applyCompanionVibe(nextVibe.id, "dock");
  }

  function runCompanionAction(action: CompanionActionId) {
    setLastInteractionAt(Date.now());
    emitHaptic();

    if (action === "pet") {
      setBondPoints((previous) => previous + 3);
      setEnergyLevel((level) => Math.min(100, level + 5));
      applyPersonalityDelta({ warmth: 3, play: 1 });
      papee?.queueReaction("waving", 1600);
      papee?.showSpeechBubble(`Hey ${firstName(session ?? null) ?? "there"}!`, 1800);
      setInteractionNote("Papee perked up. Morale +1.");
      setAmbientLine("You found my weak spot. More pets please.");
      pushPersonalityMoment("Direct pet interaction. Warmth channel jumped.", "warm");
      spawnHabitatBurst("heart");
      void recordCompanionInteraction("pet", { detail: "pet" });
      return;
    }

    if (action === "focus") {
      setViewMode("chat");
      setBondPoints((previous) => previous + 2);
      setEnergyLevel((level) => Math.max(8, level - 2));
      applyPersonalityDelta({ focus: 3, curiosity: 2, play: -1 });
      papee?.queueReaction("scanning", 1600);
      papee?.setChatOpen(true);
      setInteractionNote("Papee is assembling a tight focus brief.");
      setAmbientLine("Switching to focus mode. Pulling signal from noise.");
      pushPersonalityMoment("Focus command issued. Papee is locking on decisions.", "signal");
      spawnHabitatBurst("spark");
      if (!isLoading) {
        sendMessage(
          currentIssue?.identifier
            ? `Give me a 20-second brief for ${currentIssue.identifier}.`
            : "Give me a 20-second company status brief.",
        );
      }
      void recordCompanionInteraction("focus_action", { ritualId: "focus_sprint", detail: "focus" });
      void progressRitualTrack("focus_sprint", "advance");
      return;
    }

    setBondPoints((previous) => previous + 1);
    setEnergyLevel((level) => Math.min(100, level + 1));
    applyPersonalityDelta({ focus: 2, play: -1 });
    papee?.queueReaction("shush", 1500);
    papee?.showSpeechBubble("Signal only.", 1400);
    setInteractionNote("Quiet mode engaged: just high-signal updates.");
    setAmbientLine("Quiet channel open. I will only ping real signal.");
    pushPersonalityMoment("Quiet cue accepted. Papee switched to signal-first voice.", "signal");
    spawnHabitatBurst("alert");
    void recordCompanionInteraction("cue", { ritualId: "wrap_prepare", detail: "quiet" });
  }

  function redirectRoamTo(stationIndex: number) {
    const target = ROAM_STATIONS[stationIndex];
    if (!target) return;
    const previous = ROAM_STATIONS[roamStationIdxRef.current] ?? WORK_STATION;
    setRoamFacing(target.x < previous.x ? -1 : 1);
    setRoamLegMs(620);
    setRoamStationIdx(stationIndex);
    roamStationIdxRef.current = stationIndex;
    setLastInteractionAt(Date.now());
    setBondPoints((points) => points + 1);
    setEnergyLevel((level) => Math.max(6, level - 1));
    applyPersonalityDelta({ curiosity: 1, focus: 1 });
    setInteractionNote(`Rerouting patrol to ${target.label}.`);
    setAmbientLine(`Copy. Moving to ${target.label}.`);
    pushPersonalityMoment(`Patrol rerouted to ${target.label}.`, "signal");
    spawnHabitatBurst("spark", target.x, target.y - 8);
    emitHaptic(10);
    void recordCompanionInteraction("cue", { detail: `station:${target.label}` });
  }

  function runHabitatCue(cue: HabitatCueId) {
    setLastInteractionAt(Date.now());
    setBondPoints((points) => points + 2);
    setEnergyLevel((level) => Math.min(100, level + (cue === "celebrate" ? 5 : 2)));
    emitHaptic();

    if (cue === "celebrate") {
      applyPersonalityDelta({ play: 3, warmth: 1 });
      papee?.queueReaction("celebrating", 1600);
      setInteractionNote("Mini celebration initiated.");
      setAmbientLine("Confetti mode. We earned this.");
      pushPersonalityMoment("Celebration cue. Papee released a morale burst.", "warm");
      spawnHabitatBurst("heart");
      void recordCompanionInteraction("cue", { ritualId: "wrap_prepare", detail: cue });
      return;
    }

    if (cue === "inspect") {
      applyPersonalityDelta({ curiosity: 3, focus: 1 });
      papee?.queueReaction("magnifying", 1800);
      setInteractionNote("Inspection mode: scanning current lane for clues.");
      setAmbientLine("Zooming in. Looking for weak links.");
      pushPersonalityMoment("Inspect cue. Papee initiated a focused scan sweep.", "signal");
      spawnHabitatBurst("spark");
      void recordCompanionInteraction("cue", { ritualId: "pulse_sweep", detail: cue });
      return;
    }

    applyPersonalityDelta({ warmth: 1, curiosity: 2 });
    papee?.queueReaction("speaking-gesture", 1700);
    setInteractionNote("Papee is in storyteller mode.");
    setAmbientLine("Want the one-minute briefing with flavor?");
    pushPersonalityMoment("Brief cue. Papee switched to narration mode.", "signal");
    spawnHabitatBurst("spark");
    void recordCompanionInteraction("cue", { ritualId: "focus_sprint", detail: cue });
  }

  function runHabitatToy(toy: HabitatToyId) {
    setLastInteractionAt(Date.now());
    setBondPoints((points) => points + 1);
    setEnergyLevel((level) => Math.min(100, level + 2));
    emitHaptic(8);

    if (toy === "treat") {
      applyPersonalityDelta({ warmth: 2, play: 1 });
      papee?.queueReaction("thumbs-up", 1500);
      setInteractionNote("Snack break delivered. Papee is delighted.");
      setAmbientLine("Approved. Tiny snack, big morale.");
      pushPersonalityMoment("Treat deployed. Warmth and morale climbed.", "warm");
      spawnHabitatBurst("heart");
      void recordCompanionInteraction("toy", { detail: toy });
      return;
    }

    if (toy === "hype") {
      applyPersonalityDelta({ play: 3, focus: 1 });
      papee?.queueReaction("celebrating", 1650);
      setInteractionNote("Hype pulse sent.");
      setAmbientLine("Momentum up. Keep it rolling.");
      pushPersonalityMoment("Hype pulse. Papee entered high-energy cadence.", "warm");
      spawnHabitatBurst("spark");
      void recordCompanionInteraction("toy", { ritualId: "focus_sprint", detail: toy });
      return;
    }

    if (toy === "scan") {
      applyPersonalityDelta({ focus: 2, curiosity: 2 });
      papee?.queueReaction("magnifying", 1700);
      setInteractionNote("Quick lane scan activated.");
      setAmbientLine("Scanning for hidden blockers.");
      pushPersonalityMoment("Scan toy triggered. Hidden-risk sweep in progress.", "alert");
      spawnHabitatBurst("alert");
      void recordCompanionInteraction("toy", { ritualId: "pulse_sweep", detail: toy });
      return;
    }

    applyPersonalityDelta({ warmth: 1, curiosity: 1, play: 1 });
    papee?.queueReaction("speaking-gesture", 1700);
    setInteractionNote("Story mode activated.");
    setAmbientLine("Want the dramatic one-minute recap?");
    pushPersonalityMoment("Story toy triggered. Papee is framing a narrative recap.", "signal");
    spawnHabitatBurst("spark");
    if (!isLoading) {
      sendMessage("Give me a vivid one-minute recap of what matters right now.");
    }
    void recordCompanionInteraction("toy", { ritualId: "wrap_prepare", detail: toy });
  }

  function handleHabitatPointerDown(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".papee-mobile-station-hit") || target?.closest(".papee-mobile-character-btn")) {
      habitatPointerStartRef.current = null;
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    steeringStationRef.current = roamStationIdxRef.current;
    habitatPointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      at: Date.now(),
      dragged: false,
    };
  }

  function handleHabitatPointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = habitatPointerStartRef.current;
    if (!start) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 12 || Math.abs(dx) <= Math.abs(dy)) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const nextStationIndex = nearestRoamStationIndex(Math.max(0, Math.min(100, x)));
    if (steeringStationRef.current === nextStationIndex) return;

    const previous = ROAM_STATIONS[roamStationIdxRef.current] ?? WORK_STATION;
    const next = ROAM_STATIONS[nextStationIndex] ?? WORK_STATION;
    setRoamFacing(next.x < previous.x ? -1 : 1);
    setRoamLegMs(340);
    setRoamStationIdx(nextStationIndex);
    roamStationIdxRef.current = nextStationIndex;
    steeringStationRef.current = nextStationIndex;
    start.dragged = true;
    setSteeringHint(`Steering to ${next.label}`);
  }

  function handleHabitatPointerUp(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".papee-mobile-station-hit") || target?.closest(".papee-mobile-character-btn")) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;
    const start = habitatPointerStartRef.current;
    habitatPointerStartRef.current = null;
    steeringStationRef.current = null;

    if (start?.dragged) {
      const station = ROAM_STATIONS[roamStationIdxRef.current] ?? WORK_STATION;
      setLastInteractionAt(Date.now());
      setBondPoints((points) => points + 1);
      setEnergyLevel((level) => Math.max(6, level - 1));
      applyPersonalityDelta({ focus: 1, curiosity: 1 });
      setInteractionNote(`Manual steer locked to ${station.label}.`);
      setAmbientLine(`Manual steering confirmed: ${station.label}.`);
      pushPersonalityMoment(`Manual steering confirmed at ${station.label}.`, "signal");
      spawnHabitatBurst("spark", station.x, station.y - 7);
      emitHaptic(8);
      void recordCompanionInteraction("swipe", { detail: `drag:${station.label}` });
      return;
    }

    if (start) {
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) > HABITAT_SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * 1.15) {
        const destinationIndex = dx > 0 ? ROAM_STATIONS.length - 1 : 0;
        const directionLabel = dx > 0 ? "east lane" : "west lane";
        redirectRoamTo(destinationIndex);
        papee?.queueReaction(dx > 0 ? "pointing-right" : "pointing-left", 900);
        setAmbientLine(dx > 0 ? "Quick dash to the right perimeter." : "Sliding to the left perimeter.");
        setInteractionNote(`Swipe detected. Dashing to ${directionLabel}.`);
        setEnergyLevel((level) => Math.max(8, level - 1));
        spawnHabitatBurst("spark", x, ROAM_LANE_Y - 4);
        emitHaptic(10);
        void recordCompanionInteraction("swipe", { detail: dx > 0 ? "right" : "left" });
        return;
      }
    }

    const tone: HabitatBurstTone = criticalIssueCount > 0 ? "alert" : "spark";
    spawnHabitatBurst(tone, x, y);
    setAmbientLine(criticalIssueCount > 0 ? "I noticed that ping. Staying sharp." : "Nice tap. I felt that.");
    setBondPoints((points) => points + 1);
    setEnergyLevel((level) => Math.min(100, level + 1));
    applyPersonalityDelta(criticalIssueCount > 0 ? { focus: 2, warmth: 1 } : { warmth: 1, play: 1 });
    setLastInteractionAt(Date.now());
    emitHaptic(6);
    void recordCompanionInteraction("cue", { detail: "habitat-tap" });

    const now = Date.now();
    const comboEvents = [...habitatTapHistoryRef.current.filter((stamp) => now - stamp <= HABITAT_TAP_COMBO_WINDOW_MS), now];
    habitatTapHistoryRef.current = comboEvents;
    setComboCharge(Math.min(4, comboEvents.length));

    if (comboEvents.length >= 3) {
      habitatTapHistoryRef.current = [];
      setComboCharge(4);
      setComboFlash("Turbo combo. Papee is hyped.");
      setBondPoints((points) => points + 3);
      setEnergyLevel((level) => Math.min(100, level + 6));
      applyPersonalityDelta({ play: 4, warmth: 1, curiosity: 1 });
      papee?.queueReaction("celebrating", 1900);
      setAmbientLine("Turbo combo accepted. Personality at max.");
      pushPersonalityMoment("Turbo combo triggered. Papee entered peak-expression mode.", "warm");
      spawnHabitatBurst("heart", x, y - 6);
      spawnHabitatBurst("spark", x + 3, y - 3);
      emitHaptic([12, 30, 12]);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(display-mode: standalone)");
    const update = () => setStandalone(isStandaloneMode());
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const syncPhase = () => setHabitatPhase(currentHabitatPhase(new Date()));
    syncPhase();
    const timer = window.setInterval(syncPhase, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    const previousTheme = themeMeta?.getAttribute("content") ?? null;
    const previousAppleTitle = appleTitleMeta?.getAttribute("content") ?? null;

    document.title = activeCompany ? `Papee • ${activeCompany.name}` : "Papee";
    themeMeta?.setAttribute("content", "#151412");
    appleTitleMeta?.setAttribute("content", "Papee");

    return () => {
      document.title = previousTitle;
      if (previousTheme) themeMeta?.setAttribute("content", previousTheme);
      if (previousAppleTitle) appleTitleMeta?.setAttribute("content", previousAppleTitle);
    };
  }, [activeCompany]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, papee?.streamingActive, papee?.streamingText]);

  useEffect(() => {
    if (!interactionNote) return undefined;
    const timer = window.setTimeout(() => setInteractionNote(null), 4200);
    return () => window.clearTimeout(timer);
  }, [interactionNote]);

  useEffect(() => {
    if (!steeringHint) return undefined;
    const timer = window.setTimeout(() => setSteeringHint(null), 1200);
    return () => window.clearTimeout(timer);
  }, [steeringHint]);

  useEffect(() => {
    if (papee?.streamingActive) {
      setViewMode("chat");
    }
  }, [papee?.streamingActive]);

  useEffect(() => {
    roamStationIdxRef.current = roamStationIdx;
  }, [roamStationIdx]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cancelled = false;
    let nextTimer: number | null = null;

    const sampleRuntimeMotion = () => {
      if (cancelled) return;
      if (media.matches) {
        setMotionProfile("reduced");
        nextTimer = window.setTimeout(sampleRuntimeMotion, 8_000);
        return;
      }

      const startedAt = performance.now();
      let frames = 0;
      const tick = (now: number) => {
        if (cancelled) return;
        frames += 1;
        const elapsed = now - startedAt;
        if (elapsed < 900) {
          window.requestAnimationFrame(tick);
          return;
        }
        const fps = (frames * 1000) / elapsed;
        const weakCpu = (navigator.hardwareConcurrency ?? 8) <= 4;
        setMotionProfile(fps < 42 || weakCpu ? "lite" : "full");
        nextTimer = window.setTimeout(sampleRuntimeMotion, 12_000);
      };
      window.requestAnimationFrame(tick);
    };

    const onMediaChange = () => {
      if (media.matches) {
        setMotionProfile("reduced");
        return;
      }
      sampleRuntimeMotion();
    };

    onMediaChange();
    media.addEventListener?.("change", onMediaChange);
    return () => {
      cancelled = true;
      if (nextTimer !== null) window.clearTimeout(nextTimer);
      media.removeEventListener?.("change", onMediaChange);
    };
  }, []);

  useEffect(() => {
    if (!companyId) return;
    const mirrored = readProfileMirror(companyId);
    const merged = mergeProfileWithMirror(null, mirrored);
    if (merged) {
      applyCompanionProfile(merged, { persistMirror: false });
      setSinceLastVisitLabel(sinceLastSeenLabel(merged.lastSeenAt));
    } else {
      setBondPoints(0);
      setCheckInStreak(1);
      setEnergyLevel(72);
      setCompanionMode("balanced");
      setLastCheckInAt(null);
      setProfileUpdatedAt(null);
      setSinceLastVisitLabel("Welcome back.");
    }

    setRitualState(null);
    setComboCharge(0);
    setComboFlash(null);
    setActedTimeline([]);
    setPersonalityMoments([]);
    habitatTapHistoryRef.current = [];
  }, [applyCompanionProfile, companyId]);

  useEffect(() => {
    if (!companyId || !mobileSnapshot) return;
    const merged = mergeProfileWithMirror(mobileSnapshot.profile, readProfileMirror(companyId));
    if (merged) {
      applyCompanionProfile(merged);
      const shouldUseSnapshotLabel = merged.updatedAt === mobileSnapshot.profile.updatedAt;
      setSinceLastVisitLabel(
        shouldUseSnapshotLabel
          ? mobileSnapshot.ambient.sinceLastVisitLabel || sinceLastSeenLabel(merged.lastSeenAt)
          : sinceLastSeenLabel(merged.lastSeenAt),
      );
    }
    syncRitualState(mobileSnapshot.ritualState);
  }, [applyCompanionProfile, companyId, mobileSnapshot, syncRitualState]);

  useEffect(() => {
    if (!companyId) return;
    const rawHaptics = window.localStorage.getItem(`paperclip:papee-haptics:${companyId}`);
    if (rawHaptics === "off") setHapticsEnabled(false);
    else setHapticsEnabled(true);
    const rawHabitatFocus = window.localStorage.getItem(`paperclip:papee-habitat-focus:${companyId}`);
    setHabitatFocusMode(rawHabitatFocus === "on");
    const rawVibe = window.localStorage.getItem(`paperclip:papee-vibe:${companyId}`);
    if (rawVibe && COMPANION_VIBES.some((vibe) => vibe.id === rawVibe)) {
      const nextVibe = rawVibe as CompanionVibeId;
      setCompanionVibe(nextVibe);
      const vibeConfig = COMPANION_VIBES.find((vibe) => vibe.id === nextVibe);
      if (vibeConfig) setCompanionMode(vibeConfig.mode);
    } else {
      setCompanionVibe("cozy");
      setCompanionMode("balanced");
    }
    const rawPersonality = window.localStorage.getItem(`paperclip:papee-personality:${companyId}`);
    if (rawPersonality) {
      try {
        const parsed = JSON.parse(rawPersonality) as Partial<Record<PersonalityFacetId, number>>;
        setPersonalityScores({
          warmth: clampNumber(Math.round(parsed.warmth ?? PERSONALITY_BASELINE.warmth), 0, 100),
          focus: clampNumber(Math.round(parsed.focus ?? PERSONALITY_BASELINE.focus), 0, 100),
          curiosity: clampNumber(Math.round(parsed.curiosity ?? PERSONALITY_BASELINE.curiosity), 0, 100),
          play: clampNumber(Math.round(parsed.play ?? PERSONALITY_BASELINE.play), 0, 100),
        });
      } catch {
        setPersonalityScores(PERSONALITY_BASELINE);
      }
    } else {
      setPersonalityScores(PERSONALITY_BASELINE);
    }
    setPersonalityMoments([]);
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    window.localStorage.setItem(`paperclip:papee-haptics:${companyId}`, hapticsEnabled ? "on" : "off");
  }, [companyId, hapticsEnabled]);

  useEffect(() => {
    if (!companyId) return;
    window.localStorage.setItem(`paperclip:papee-habitat-focus:${companyId}`, habitatFocusMode ? "on" : "off");
  }, [companyId, habitatFocusMode]);

  useEffect(() => {
    if (!companyId) return;
    window.localStorage.setItem(`paperclip:papee-vibe:${companyId}`, companionVibe);
  }, [companyId, companionVibe]);

  useEffect(() => {
    if (!companyId) return;
    window.localStorage.setItem(`paperclip:papee-personality:${companyId}`, JSON.stringify(personalityScores));
  }, [companyId, personalityScores]);

  useEffect(() => {
    const result = papee?.lastToolResult;
    if (!result) return;
    const key = `${result.ok ? "ok" : "err"}:${result.summary}:${result.error ?? ""}:${result.entity?.id ?? ""}`;
    if (lastToolTimelineKeyRef.current === key) return;
    lastToolTimelineKeyRef.current = key;
    pushActedEntry(`Papee acted · ${result.summary}`, result.ok);
  }, [papee?.lastToolResult, pushActedEntry]);

  useEffect(() => {
    if (!isRoaming || !activeCompany) return undefined;
    const decayMs = companionMode === "playful" ? 10_000 : 13_500;
    const timer = window.setInterval(() => {
      setEnergyLevel((level) => Math.max(6, level - 1));
    }, decayMs);
    return () => window.clearInterval(timer);
  }, [activeCompany, companionMode, isRoaming]);

  useEffect(() => {
    if (comboCharge <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setComboCharge((charge) => Math.max(0, charge - 1));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [comboCharge]);

  useEffect(() => {
    if (!comboFlash) return undefined;
    const timer = window.setTimeout(() => setComboFlash(null), 2100);
    return () => window.clearTimeout(timer);
  }, [comboFlash]);

  useEffect(() => {
    if (!isRoaming || energyLevel > 20) return undefined;
    const timer = window.setTimeout(() => {
      papee?.queueReaction("sleepy-nod", 1300);
      setAmbientLine("Small yawn... I can still keep watch.");
    }, 900);
    return () => window.clearTimeout(timer);
  }, [energyLevel, isRoaming, papee]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHabitatBursts((previous) => previous.filter((burst) => Date.now() - burst.bornAt < 1200));
    }, 260);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!ambientLine) return undefined;
    const timer = window.setTimeout(() => setAmbientLine(null), 3400);
    return () => window.clearTimeout(timer);
  }, [ambientLine]);

  useEffect(() => {
    if (!activeCompany) return undefined;
    const emitLine = () => {
      if (papee?.streamingActive || ambientLinePool.length === 0) return;
      const candidates = ambientLinePool.filter((line) => line !== lastAmbientLineRef.current);
      const pool = candidates.length > 0 ? candidates : ambientLinePool;
      const picked = pool[Math.floor(Math.random() * pool.length)] ?? null;
      if (!picked) return;
      lastAmbientLineRef.current = picked;
      setAmbientLine(picked);
    };
    emitLine();
    const interval = window.setInterval(emitLine, isRoaming ? modeConfig.chatterRoamMs : modeConfig.chatterActiveMs);
    return () => window.clearInterval(interval);
  }, [activeCompany, ambientLinePool, isRoaming, modeConfig.chatterActiveMs, modeConfig.chatterRoamMs, papee?.streamingActive]);

  useEffect(() => {
    if (!isRoaming) {
      setRoamStationIdx(2);
      setRoamLegMs(700);
      setRoamFacing(1);
      return undefined;
    }

    let cancelled = false;
    let timer: number | null = null;

    const retarget = () => {
      if (cancelled) return;
      const previousIndex = roamStationIdxRef.current;
      const nextIndex = pickNextRoamStation(previousIndex);
      const previousX = (ROAM_STATIONS[previousIndex] ?? WORK_STATION).x;
      const nextX = (ROAM_STATIONS[nextIndex] ?? WORK_STATION).x;
      const legDuration = modeConfig.legMinMs + Math.round(Math.random() * (modeConfig.legMaxMs - modeConfig.legMinMs));
      setRoamLegMs(legDuration);
      setRoamFacing(nextX < previousX ? -1 : 1);
      setRoamStationIdx(nextIndex);
      roamStationIdxRef.current = nextIndex;
      const nextHopMs = Math.max(220, Math.min(modeConfig.retargetMs, legDuration - 80));
      timer = window.setTimeout(retarget, nextHopMs);
    };

    retarget();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [isRoaming, modeConfig.legMaxMs, modeConfig.legMinMs, modeConfig.retargetMs]);

  useEffect(() => {
    if (!isRoaming || !activeCompany) return undefined;
    const cadenceMs = companionMode === "playful" ? 7600 : 10_400;
    const interval = window.setInterval(() => {
      if (Math.random() < (companionMode === "playful" ? 0.45 : 0.66)) return;
      const routines: Array<{ state: PapeeAnimState; line: string; tone: HabitatBurstTone; ms: number }> = [
        {
          state: "magnifying",
          line: "Quick sweep complete. No hidden turbulence here.",
          tone: "spark",
          ms: 1350,
        },
        {
          state: "speaking-gesture",
          line: "Patrol report ready whenever you want it.",
          tone: "spark",
          ms: 1450,
        },
        {
          state: criticalIssueCount > 0 ? "alarmed" : "celebrating",
          line: criticalIssueCount > 0 ? "Keeping guard up while I roam." : "Smooth lanes. Loving this tempo.",
          tone: criticalIssueCount > 0 ? "alert" : "heart",
          ms: 1250,
        },
      ];
      if (activeVibe.id === "showtime") {
        routines.push({
          state: "jumping",
          line: "Showtime loop active. I am keeping this lively.",
          tone: "heart",
          ms: 980,
        });
      }
      if (activeVibe.id === "tactical") {
        routines.push({
          state: "guarding",
          line: "Tactical pass complete. No signal escaped the net.",
          tone: "alert",
          ms: 1200,
        });
      }
      const picked = routines[Math.floor(Math.random() * routines.length)];
      if (!picked) return;
      papee?.queueReaction(picked.state, picked.ms);
      setAmbientLine(picked.line);
      applyPersonalityDelta(
        picked.tone === "alert"
          ? { focus: 2, curiosity: 1, play: -1 }
          : picked.tone === "heart"
            ? { warmth: 2, play: 1 }
            : { curiosity: 1, focus: 1 },
      );
      pushPersonalityMoment(picked.line, toneFromBurst(picked.tone));
      const station = ROAM_STATIONS[roamStationIdxRef.current] ?? WORK_STATION;
      burstSeqRef.current += 1;
      setHabitatBursts((previous) => [
        ...previous,
        {
          id: burstSeqRef.current,
          x: station.x,
          y: ROAM_LANE_Y - 8,
          tone: picked.tone,
          bornAt: Date.now(),
        },
      ]);
    }, cadenceMs);
    return () => window.clearInterval(interval);
  }, [activeCompany, activeVibe.id, applyPersonalityDelta, companionMode, criticalIssueCount, isRoaming, papee, pushPersonalityMoment]);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background px-6 text-center">
        <div className="space-y-3">
          <LoaderCircle className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
          <p className="font-mono text-[0.72rem] text-muted-foreground">Waking Papee…</p>
        </div>
      </div>
    );
  }

  if (!activeCompany) {
    return (
      <div className="papee-mobile-shell flex h-dvh items-center justify-center px-5 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
        <div className="w-full max-w-sm rounded-[1.4rem] border border-[var(--boared-rule)] bg-[color-mix(in_oklab,var(--boared-paper)_88%,var(--boared-acid)_12%)] p-6 text-center">
          <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-[1rem] border border-[var(--boared-rule)] bg-background">
            <PapeeCharacter state="waving" size="lg" mood="happy" className="papee-pocket-float" />
          </div>
          <div className="boared-label text-foreground mb-2">Papee companion</div>
          <h1 className="boared-display text-[1.65rem] leading-[1.02]">
            Papee needs a <em>company</em> first.
          </h1>
          <p className="mt-3 font-mono text-[0.72rem] text-muted-foreground">
            Create one and this becomes your pocket check-in app.
          </p>
          <div className="mt-5">
            <Button onClick={() => openOnboarding()}>Create company</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("papee-mobile-shell relative h-dvh overflow-y-auto text-foreground", `papee-mobile-motion--${motionProfile}`)}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className={cn("papee-mobile-orb papee-mobile-orb--left", energyPulseClass(ambient.energy))} />
        <div className={cn("papee-mobile-orb papee-mobile-orb--right", energyPulseClass(ambient.energy))} />
      </div>

      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-md flex-col gap-4 px-4 pb-[calc(env(safe-area-inset-bottom)+5.6rem)] pt-[calc(env(safe-area-inset-top)+0.7rem)]">
        <header className="papee-mobile-card papee-mobile-top-nav flex items-center justify-between gap-3 rounded-[1.15rem] px-3.5 py-2.5">
          <div>
            <div className="boared-wordmark text-[1.02rem]">Papee</div>
            <p className="font-mono text-[0.58rem] uppercase tracking-[0.1em] text-muted-foreground">
              {standalone ? "Homescreen mode" : "Browser mode"}
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link to="/dashboard">
              <Home className="h-4 w-4" />
              Board
            </Link>
          </Button>
        </header>

        {!standalone && (
          <div className="papee-mobile-card rounded-[1.05rem] border-dashed px-3.5 py-2.5">
            <p className="font-mono text-[0.68rem] leading-relaxed text-muted-foreground">
              Add <span className="text-foreground">/papee</span> to your iPhone Home Screen for instant check-ins.
            </p>
          </div>
        )}

        {companies.length > 1 && (
          <div className="papee-mobile-card overflow-x-auto rounded-[1.05rem] px-1 py-1">
            <div className="flex gap-1">
              {companies.map((company) => (
                <button
                  key={company.id}
                  type="button"
                  onClick={() => setSelectedCompanyId(company.id)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.08em] transition-colors",
                    company.id === activeCompany.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-[var(--boared-rule)] bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {company.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <section className="papee-mobile-card papee-mobile-command-bridge rounded-[1.2rem] p-3">
          <div className="flex items-start justify-between gap-2.5">
            <div className="min-w-0">
              <p className="font-mono text-[0.56rem] uppercase tracking-[0.1em] text-muted-foreground">
                Pocket companion OS
              </p>
              <h2 className="boared-display mt-1 text-[1.2rem] leading-[1.02] text-foreground">
                Mission control for <em>{activeCompany.name}</em>
              </h2>
              <p className="mt-1 font-mono text-[0.56rem] text-muted-foreground">
                {sinceLastVisitLabel}{profileUpdatedAt ? ` · Synced ${relativeTime(new Date(profileUpdatedAt))}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={cycleVibeFromDock}
              className="rounded-full border border-[var(--boared-rule)] bg-background px-2.5 py-1 font-mono text-[0.54rem] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
              title={`Cycle vibe from ${activeVibe.title}`}
            >
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-[var(--boared-acid)]" />
                {activeVibe.title}
              </span>
            </button>
          </div>

          <div className="mt-2.5 grid grid-cols-3 gap-1.5">
            {(Object.keys(VIEW_MODE_LABELS) as ViewMode[]).map((mode) => {
              const details = VIEW_MODE_LABELS[mode];
              const Icon = details.icon;
              const countLabel =
                mode === "companion"
                  ? `${bondPoints} pts`
                  : mode === "control"
                    ? `${criticalIssueCount + warningIssueCount}`
                    : `${messages.length}`;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => goToView(mode)}
                  className={cn(
                    "rounded-[0.82rem] border px-2 py-2 text-left transition-colors",
                    viewMode === mode
                      ? "border-foreground bg-[color-mix(in_oklab,var(--boared-paper)_72%,var(--boared-acid)_28%)]"
                      : "border-[var(--boared-rule)] bg-background",
                  )}
                  aria-pressed={viewMode === mode}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="inline-flex items-center gap-1 font-mono text-[0.54rem] uppercase tracking-[0.08em] text-muted-foreground">
                      <Icon className="h-3 w-3 text-[var(--boared-acid)]" />
                      {details.title}
                    </span>
                    <span className="font-mono text-[0.5rem] uppercase tracking-[0.08em] text-muted-foreground">{details.hint}</span>
                  </div>
                  <p className="mt-1 text-[0.74rem] font-semibold text-foreground">{countLabel}</p>
                  <p className="mt-0.5 line-clamp-2 font-mono text-[0.54rem] text-muted-foreground">{details.subtitle}</p>
                </button>
              );
            })}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <span className="papee-mobile-ribbon-chip">
              <Bot className="h-3 w-3 text-[var(--boared-acid)]" />
              {temperamentLabel}
            </span>
            <span className="papee-mobile-ribbon-chip">
              <Zap className="h-3 w-3 text-[var(--boared-acid)]" />
              {Math.round(energyLevel)}% energy
            </span>
            <span className="papee-mobile-ribbon-chip">
              <HeartHandshake className="h-3 w-3 text-[var(--boared-acid)]" />
              {checkInStreak} day streak
            </span>
            <span className="papee-mobile-ribbon-chip">
              <TriangleAlert className="h-3 w-3 text-[var(--boared-acid)]" />
              {criticalIssueCount + warningIssueCount} signals
            </span>
          </div>
        </section>

        <section ref={habitatSectionRef} className="papee-mobile-card papee-mobile-sheen space-y-4 rounded-[1.45rem] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge
                  variant={statusTone(criticalIssueCount)}
                  className={cn(criticalIssueCount === 0 && "border-foreground bg-background text-foreground")}
                >
                  {ambient.badge}
                </Badge>
                <span className="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground">{pocketSummary}</span>
              </div>
              <h1 className="boared-display mt-2 text-[1.8rem] leading-[0.95] text-foreground">
                Hi <em>{greetingName}</em>.
              </h1>
              <p className="mt-2 max-w-[34ch] font-mono text-[0.68rem] leading-relaxed text-muted-foreground">
                {ambient.subtitle}
              </p>
            </div>
            <div className="rounded-full border border-[var(--boared-rule)] bg-background px-2 py-1 font-mono text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground">
              {activeCompany.name}
            </div>
          </div>
          <p className="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground">
            {sinceLastVisitLabel}{profileUpdatedAt ? ` · Synced ${relativeTime(new Date(profileUpdatedAt))}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--boared-rule)] bg-background px-2 py-0.5 font-mono text-[0.54rem] uppercase tracking-[0.08em] text-muted-foreground">
              <Sparkles className="h-3 w-3 text-[var(--boared-acid)]" />
              {activeVibe.title} vibe
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--boared-rule)] bg-background px-2 py-0.5 font-mono text-[0.54rem] uppercase tracking-[0.08em] text-muted-foreground">
              <Bot className="h-3 w-3 text-[var(--boared-acid)]" />
              {temperamentLabel}
            </span>
          </div>

          <div className="relative overflow-hidden rounded-[1.25rem] border border-[var(--boared-rule)] bg-[color-mix(in_oklab,var(--boared-paper)_82%,var(--boared-acid)_18%)] px-3 py-3">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,color-mix(in_oklab,var(--boared-acid)_16%,transparent),transparent_58%)]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-7 top-3 h-28 w-28 rounded-full bg-[color-mix(in_oklab,var(--boared-acid)_14%,transparent)] blur-2xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-6 bottom-1 h-20 w-20 rounded-full bg-[color-mix(in_oklab,var(--boared-ink)_18%,transparent)] blur-2xl"
            />
            <div
              className={cn(
                "papee-mobile-habitat relative overflow-hidden rounded-[1rem] border border-[var(--boared-rule)] bg-[color-mix(in_oklab,var(--boared-paper)_88%,var(--boared-acid)_12%)]",
                habitatFocusMode ? "h-64" : "h-52",
                `papee-mobile-habitat--${habitatPhase}`,
              )}
              tabIndex={0}
              aria-label="Papee habitat. Swipe or use arrow keys to move Papee."
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  redirectRoamTo(0);
                  return;
                }
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  redirectRoamTo(ROAM_STATIONS.length - 1);
                  return;
                }
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  runHabitatCue("inspect");
                }
              }}
              onPointerDown={handleHabitatPointerDown}
              onPointerMove={handleHabitatPointerMove}
              onPointerUp={handleHabitatPointerUp}
              onPointerCancel={() => {
                habitatPointerStartRef.current = null;
                steeringStationRef.current = null;
                setSteeringHint(null);
              }}
            >
              <div className={cn("papee-mobile-sky-object", `papee-mobile-sky-object--${habitatPhase}`)} aria-hidden="true" />
              <div className="papee-mobile-lane" aria-hidden="true" />
              {habitatBursts.map((burst) => (
                <span
                  key={burst.id}
                  aria-hidden="true"
                  className={cn("papee-mobile-burst", `papee-mobile-burst--${burst.tone}`)}
                  style={{ left: `${burst.x}%`, top: `${burst.y}%` }}
                />
              ))}
              {ROAM_STATIONS.map((station, stationIndex) => (
                <button
                  key={station.label}
                  type="button"
                  onClick={() => redirectRoamTo(stationIndex)}
                  aria-label={`Send Papee to ${station.label}`}
                  className="papee-mobile-station-hit"
                  title={`Move to ${station.label}`}
                  style={{ left: `${station.x}%`, top: `${station.y}%` }}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "papee-mobile-station",
                      isRoaming && station.label === roamingStation.label && "papee-mobile-station--active",
                    )}
                  />
                </button>
              ))}

              <div
                className={cn("papee-mobile-roamer", !isRoaming && "papee-mobile-roamer--active")}
                style={
                  {
                    left: `${roamingStation.x}%`,
                    transitionDuration: `${isRoaming ? roamLegMs : 700}ms`,
                    "--papee-facing": String(roamFacing),
                  } as CSSProperties
                }
              >
                {ambientLine && (
                  <div
                    className={cn(
                      "papee-mobile-chatter-bubble",
                      chatterDock === "left" && "papee-mobile-chatter-bubble--left",
                      chatterDock === "right" && "papee-mobile-chatter-bubble--right",
                    )}
                  >
                    {ambientLine}
                  </div>
                )}
                {comboFlash && (
                  <div className="papee-mobile-combo-badge">
                    {comboFlash}
                  </div>
                )}
                <PapeeCharacter
                  state={characterState}
                  mood={renderMood}
                  size="lg"
                  className={cn(
                    "papee-mobile-character-btn",
                    isRoaming ? "papee-mobile-walker" : "papee-mobile-worker",
                    energyPulseClass(ambient.energy),
                  )}
                  onClick={() => runCompanionAction("pet")}
                />
              </div>

              {steeringHint && (
                <div className="absolute inset-x-4 top-2 z-20 rounded-[0.65rem] border border-[var(--boared-rule)] bg-background/92 px-2 py-1 text-center font-mono text-[0.56rem] uppercase tracking-[0.08em] text-foreground backdrop-blur-[1px]">
                  {steeringHint}
                </div>
              )}

              <div className="papee-mobile-habitat-hud absolute inset-x-2 bottom-2 z-20 rounded-[0.8rem] border border-[var(--boared-rule)] bg-background/95 px-2.5 py-2 backdrop-blur-[1px]">
                <p className="truncate font-mono text-[0.56rem] uppercase tracking-[0.08em] text-muted-foreground" title={activityLabel}>
                  {activityLabel}
                </p>
                <p className="papee-mobile-habitat-hud-line mt-0.5 text-[0.72rem] text-foreground" title={habitatStatusLine}>
                  {habitatStatusLine}
                </p>
              </div>
            </div>

            <div className="relative mt-2 flex items-center justify-between px-1">
              <p className="font-mono text-[0.6rem] uppercase tracking-[0.08em] text-muted-foreground">
                {isRoaming ? "Roaming mode" : "Active mode"} · {phaseLabel}
              </p>
              <div className="flex items-center gap-1.5">
                <p className="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground">
                  Tap, swipe, or drag
                </p>
                <button
                  type="button"
                  onClick={() => setHabitatFocusMode((previous) => !previous)}
                  className="rounded-full border border-[var(--boared-rule)] bg-background px-2 py-0.5 font-mono text-[0.54rem] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                >
                  {habitatFocusMode ? "Guided" : "Immersive"}
                </button>
              </div>
            </div>

            {viewMode === "companion" ? (
              <>
                <div className="mt-1 grid grid-cols-3 gap-1.5 px-1">
                  <button
                    type="button"
                    onClick={() => runHabitatCue("inspect")}
                    className="papee-mobile-habitat-cue"
                  >
                    Inspect
                  </button>
                  <button
                    type="button"
                    onClick={() => runHabitatCue("celebrate")}
                    className="papee-mobile-habitat-cue"
                  >
                    Celebrate
                  </button>
                  <button
                    type="button"
                    onClick={() => runHabitatCue("salute")}
                    className="papee-mobile-habitat-cue"
                  >
                    Brief me
                  </button>
                </div>

                <div className="mt-1 grid grid-cols-2 gap-1.5 px-1">
                  <button
                    type="button"
                    onClick={() => runHabitatToy("treat")}
                    className="papee-mobile-habitat-cue papee-mobile-habitat-cue--tile"
                  >
                    <HeartHandshake className="h-3.5 w-3.5" />
                    Treat
                  </button>
                  <button
                    type="button"
                    onClick={() => runHabitatToy("hype")}
                    className="papee-mobile-habitat-cue papee-mobile-habitat-cue--tile"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Hype
                  </button>
                  <button
                    type="button"
                    onClick={() => runHabitatToy("scan")}
                    className="papee-mobile-habitat-cue papee-mobile-habitat-cue--tile"
                  >
                    <Gauge className="h-3.5 w-3.5" />
                    Scan
                  </button>
                  <button
                    type="button"
                    onClick={() => runHabitatToy("story")}
                    className="papee-mobile-habitat-cue papee-mobile-habitat-cue--tile"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Story
                  </button>
                </div>

                {!habitatFocusMode && (
                  <div className="mt-2 space-y-2 rounded-[0.9rem] border border-[var(--boared-rule)] bg-background/80 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-[0.56rem] uppercase tracking-[0.08em] text-muted-foreground">Companion mode</p>
                      <p className="font-mono text-[0.56rem] uppercase tracking-[0.08em] text-muted-foreground">{modeConfig.short}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => cycleCompanionMode("balanced")}
                        className={cn(
                          "papee-mobile-habitat-cue",
                          companionMode === "balanced" && "border-foreground bg-[color-mix(in_oklab,var(--boared-paper)_74%,var(--boared-acid)_26%)]",
                        )}
                      >
                        <Gauge className="mx-auto mb-1 h-3.5 w-3.5" />
                        Balance
                      </button>
                      <button
                        type="button"
                        onClick={() => cycleCompanionMode("playful")}
                        className={cn(
                          "papee-mobile-habitat-cue",
                          companionMode === "playful" && "border-foreground bg-[color-mix(in_oklab,var(--boared-paper)_74%,var(--boared-acid)_26%)]",
                        )}
                      >
                        <Gamepad2 className="mx-auto mb-1 h-3.5 w-3.5" />
                        Playful
                      </button>
                      <button
                        type="button"
                        onClick={() => cycleCompanionMode("guardian")}
                        className={cn(
                          "papee-mobile-habitat-cue",
                          companionMode === "guardian" && "border-foreground bg-[color-mix(in_oklab,var(--boared-paper)_74%,var(--boared-acid)_26%)]",
                        )}
                      >
                        <Shield className="mx-auto mb-1 h-3.5 w-3.5" />
                        Guardian
                      </button>
                    </div>
                    <p className="font-mono text-[0.58rem] text-muted-foreground">{modeConfig.description}</p>
                    <div className="rounded-[0.75rem] border border-[var(--boared-rule)] bg-background/80 px-2 py-1.5">
                      <p className="font-mono text-[0.56rem] uppercase tracking-[0.08em] text-muted-foreground">Presence</p>
                      <p className="mt-0.5 text-[0.68rem] text-foreground">{presenceSummary}</p>
                      <p className="mt-0.5 font-mono text-[0.56rem] text-muted-foreground">
                        {checkInStreak} day streak · {streakSubtitle}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => papee?.updatePrefs({ enableStreaming: !(papee?.prefs.enableStreaming ?? true) })}
                        className="papee-mobile-habitat-cue papee-mobile-habitat-cue--setting"
                      >
                        <Waves className="mx-auto mb-1 h-3.5 w-3.5" />
                        Stream
                        <span className="papee-mobile-setting-state">{papee?.prefs.enableStreaming ? "On" : "Off"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => papee?.updatePrefs({ enableSounds: !(papee?.prefs.enableSounds ?? false) })}
                        className="papee-mobile-habitat-cue papee-mobile-habitat-cue--setting"
                      >
                        {papee?.prefs.enableSounds ? (
                          <Volume2 className="mx-auto mb-1 h-3.5 w-3.5" />
                        ) : (
                          <VolumeX className="mx-auto mb-1 h-3.5 w-3.5" />
                        )}
                        Sound
                        <span className="papee-mobile-setting-state">{papee?.prefs.enableSounds ? "On" : "Off"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setHapticsEnabled((enabled) => !enabled)}
                        className="papee-mobile-habitat-cue papee-mobile-habitat-cue--setting"
                      >
                        <Zap className="mx-auto mb-1 h-3.5 w-3.5" />
                        Haptic
                        <span className="papee-mobile-setting-state">{hapticsEnabled ? "On" : "Off"}</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="mt-1 rounded-[0.75rem] border border-dashed border-[var(--boared-rule)] px-2.5 py-2 text-center font-mono text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground">
                Companion controls minimized. Switch to Companion tab for full interaction deck.
              </p>
            )}
          </div>

          {viewMode === "companion" ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Link
                  to={currentRun?.issueId ? `/issues/${currentRun.issueId}` : "/dashboard"}
                  className="block rounded-[0.95rem] border border-[var(--boared-rule)] bg-background px-2.5 py-2.5 no-underline text-foreground transition-colors hover:border-foreground"
                >
                  <p className="boared-label text-muted-foreground">Live</p>
                  <p className="mt-1 boared-display text-[1.3rem] leading-none">{liveRuns.length}</p>
                  <p className="font-mono text-[0.58rem] text-muted-foreground">runs</p>
                </Link>
                <Link
                  to="/agents"
                  className="block rounded-[0.95rem] border border-[var(--boared-rule)] bg-background px-2.5 py-2.5 no-underline text-foreground transition-colors hover:border-foreground"
                >
                  <p className="boared-label text-muted-foreground">Agents</p>
                  <p className="mt-1 boared-display text-[1.3rem] leading-none">{runningAgentCount}</p>
                  <p className="font-mono text-[0.58rem] text-muted-foreground">awake</p>
                </Link>
                <Link
                  to={userId ? "/inbox" : "/approvals"}
                  className="block rounded-[0.95rem] border border-[var(--boared-rule)] bg-background px-2.5 py-2.5 no-underline text-foreground transition-colors hover:border-foreground"
                >
                  <p className="boared-label text-muted-foreground">For you</p>
                  <p className="mt-1 boared-display text-[1.3rem] leading-none">{forYouCount}</p>
                  <p className="font-mono text-[0.58rem] text-muted-foreground">{userId ? "unread" : "approvals"}</p>
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <CompanionActionButton
                  icon={CircleDot}
                  title="Focus"
                  subtitle="20-second brief"
                  onClick={() => runCompanionAction("focus")}
                  disabled={isLoading}
                />
                <CompanionActionButton
                  icon={Moon}
                  title="Quiet"
                  subtitle="Signal-only mode"
                  onClick={() => runCompanionAction("quiet")}
                />
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {SCENE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => runScenePreset(preset.id)}
                    className="rounded-[0.78rem] border border-[var(--boared-rule)] bg-background px-2 py-2 text-left transition-colors hover:border-foreground"
                  >
                    <preset.icon className="h-3.5 w-3.5 text-[var(--boared-acid)]" />
                    <p className="mt-1 text-[0.68rem] font-semibold text-foreground">{preset.title}</p>
                    <p className="mt-0.5 line-clamp-2 font-mono text-[0.54rem] uppercase tracking-[0.08em] text-muted-foreground">
                      {preset.subtitle}
                    </p>
                  </button>
                ))}
              </div>

              <div className="rounded-[0.9rem] border border-[var(--boared-rule)] bg-background/90 px-3 py-2.5">
                <p className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground">Interaction log</p>
                <p className="mt-1 text-[0.77rem] text-foreground">
                  {interactionNote ?? "Use the action buttons to interact with Papee and shape the check-in style."}
                </p>
                <p className="mt-1 font-mono text-[0.58rem] text-muted-foreground">
                  {lastInteractionAt ? `Last touch ${relativeTime(new Date(lastInteractionAt))}` : "No interaction this session yet"}
                </p>
                <div className="mt-2">
                  <div className="flex items-center justify-between gap-2 font-mono text-[0.56rem] uppercase tracking-[0.08em] text-muted-foreground">
                    <span>Bond level · {bondTier.title}</span>
                    <span>{bondPoints} pts</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--boared-rule)_80%,transparent)]">
                    <div
                      className="h-full rounded-full bg-[color-mix(in_oklab,var(--boared-acid)_72%,var(--boared-paper))] transition-all duration-500"
                      style={{ width: `${bondProgress}%` }}
                    />
                  </div>
                  <p className="mt-1 font-mono text-[0.58rem] text-muted-foreground">{bondTier.summary}</p>
                </div>
                <div className="mt-2">
                  <div className="flex items-center justify-between gap-2 font-mono text-[0.56rem] uppercase tracking-[0.08em] text-muted-foreground">
                    <span>Energy</span>
                    <span>{Math.round(energyLevel)}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--boared-rule)_80%,transparent)]">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        energyLevel >= 45
                          ? "bg-[color-mix(in_oklab,var(--boared-acid)_72%,var(--boared-paper))]"
                          : "bg-[color-mix(in_oklab,var(--destructive)_62%,var(--boared-paper))]",
                      )}
                      style={{ width: `${Math.max(4, Math.min(100, energyLevel))}%` }}
                    />
                  </div>
                  <p className="mt-1 font-mono text-[0.58rem] text-muted-foreground">{energyHint}</p>
                </div>
                <div className="mt-2 rounded-[0.75rem] border border-[var(--boared-rule)] bg-[color-mix(in_oklab,var(--boared-paper)_82%,var(--boared-acid)_18%)] px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-mono text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground">
                      <HeartHandshake className="h-3 w-3 text-[var(--boared-acid)]" />
                      Combo meter
                    </span>
                    <span className="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-foreground">{comboCharge}/4</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <span
                        key={`combo-${index}`}
                        className={cn(
                          "h-1.5 w-1.5 rounded-full border border-[var(--boared-rule)]",
                          index < comboCharge
                            ? "bg-[color-mix(in_oklab,var(--boared-acid)_72%,var(--boared-paper))]"
                            : "bg-[color-mix(in_oklab,var(--boared-paper)_80%,transparent)]",
                        )}
                      />
                    ))}
                    <span className="font-mono text-[0.56rem] uppercase tracking-[0.08em] text-muted-foreground">
                      Tap habitat quickly to fill
                    </span>
                  </div>
                </div>
                {actedTimeline.length > 0 && (
                  <div className="mt-2 rounded-[0.75rem] border border-[var(--boared-rule)] bg-background px-2.5 py-2">
                    <p className="font-mono text-[0.56rem] uppercase tracking-[0.08em] text-muted-foreground">Papee acted</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {actedTimeline.map((entry) => (
                        <span
                          key={entry.id}
                          className={cn(
                            "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[0.54rem] uppercase tracking-[0.06em]",
                            entry.ok
                              ? "border-[var(--boared-rule)] bg-[color-mix(in_oklab,var(--boared-paper)_86%,var(--boared-acid)_14%)] text-foreground"
                              : "border-[color-mix(in_oklab,var(--destructive)_45%,var(--boared-rule))] bg-[color-mix(in_oklab,var(--destructive)_12%,var(--boared-paper)_88%)] text-foreground",
                          )}
                          title={entry.summary}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", entry.ok ? "bg-[var(--boared-acid)]" : "bg-[var(--destructive)]")} />
                          <span className="truncate">{entry.summary}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="papee-mobile-personality-panel rounded-[0.9rem] border border-[var(--boared-rule)] px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-[0.56rem] uppercase tracking-[0.08em] text-muted-foreground">Personality studio</p>
                    <p className="mt-0.5 text-[0.77rem] font-semibold text-foreground">{temperamentLabel} temperament</p>
                    <p className="mt-0.5 text-[0.67rem] text-muted-foreground">{temperamentSummary}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center rounded-full border border-[var(--boared-rule)] bg-background px-2 py-0.5 font-mono text-[0.54rem] uppercase tracking-[0.08em] text-foreground">
                    {activeVibe.title}
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {COMPANION_VIBES.map((vibe) => (
                    <button
                      key={vibe.id}
                      type="button"
                      onClick={() => applyCompanionVibe(vibe.id)}
                      className={cn(
                        "papee-mobile-vibe-chip rounded-[0.72rem] border px-2 py-1.5 text-left",
                        companionVibe === vibe.id
                          ? "border-foreground bg-[color-mix(in_oklab,var(--boared-paper)_72%,var(--boared-acid)_28%)]"
                          : "border-[var(--boared-rule)] bg-background",
                      )}
                    >
                      <p className="font-mono text-[0.52rem] uppercase tracking-[0.08em] text-muted-foreground">{vibe.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[0.64rem] text-foreground">{vibe.subtitle}</p>
                    </button>
                  ))}
                </div>

                <div className="mt-2 space-y-1.5">
                  {personalityFacets.map((facet) => {
                    const Icon = facet.icon;
                    return (
                      <div key={facet.id} className="rounded-[0.72rem] border border-[var(--boared-rule)] bg-background px-2 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 font-mono text-[0.54rem] uppercase tracking-[0.08em] text-muted-foreground">
                            <Icon className="h-3 w-3 text-[var(--boared-acid)]" />
                            {facet.label}
                          </span>
                          <span className="font-mono text-[0.54rem] uppercase tracking-[0.08em] text-foreground">{facet.value}%</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--boared-rule)_80%,transparent)]">
                          <div
                            className="h-full rounded-full bg-[color-mix(in_oklab,var(--boared-acid)_72%,var(--boared-paper))] transition-all duration-500"
                            style={{ width: `${Math.max(5, facet.value)}%` }}
                          />
                        </div>
                        <p className="mt-1 font-mono text-[0.52rem] text-muted-foreground">{facet.hint}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => runPersonalityNudge("soothe")}
                    className="papee-mobile-habitat-cue"
                  >
                    Soothe
                  </button>
                  <button
                    type="button"
                    onClick={() => runPersonalityNudge("challenge")}
                    className="papee-mobile-habitat-cue"
                  >
                    Challenge
                  </button>
                  <button
                    type="button"
                    onClick={() => runPersonalityNudge("energize")}
                    className="papee-mobile-habitat-cue"
                  >
                    Energize
                  </button>
                </div>

                <div className="mt-2 rounded-[0.72rem] border border-[var(--boared-rule)] bg-background px-2.5 py-2">
                  <p className="font-mono text-[0.56rem] uppercase tracking-[0.08em] text-muted-foreground">Recent moments</p>
                  {personalityMoments.length === 0 ? (
                    <p className="mt-1 text-[0.67rem] text-muted-foreground">
                      No moments logged yet. Interact with Papee to build personality memory.
                    </p>
                  ) : (
                    <div className="mt-1.5 space-y-1">
                      {personalityMoments.slice(0, 3).map((moment) => (
                        <div
                          key={moment.id}
                          className={cn(
                            "rounded-[0.62rem] border px-2 py-1",
                            moment.tone === "alert"
                              ? "border-[color-mix(in_oklab,var(--destructive)_48%,var(--boared-rule))] bg-[color-mix(in_oklab,var(--destructive)_10%,var(--boared-paper)_90%)]"
                              : moment.tone === "warm"
                                ? "border-[color-mix(in_oklab,var(--boared-acid)_48%,var(--boared-rule))] bg-[color-mix(in_oklab,var(--boared-acid)_12%,var(--boared-paper)_88%)]"
                                : "border-[var(--boared-rule)] bg-[color-mix(in_oklab,var(--boared-paper)_88%,var(--boared-acid)_12%)]",
                          )}
                        >
                          <p className="text-[0.67rem] leading-snug text-foreground">{moment.text}</p>
                          <p className="mt-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-muted-foreground">
                            {relativeTime(new Date(moment.at))}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-[0.9rem] border border-dashed border-[var(--boared-rule)] bg-background/85 px-3 py-3">
              <p className="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground">
                Companion deck collapsed in {VIEW_MODE_LABELS[viewMode].title} view.
              </p>
              <p className="mt-1 text-[0.74rem] text-foreground">
                Keep checking live signal here, or switch back for full personality controls.
              </p>
              <button
                type="button"
                onClick={() => goToView("companion")}
                className="mt-2 rounded-full border border-[var(--boared-rule)] bg-background px-2.5 py-1 font-mono text-[0.56rem] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
              >
                Open companion deck
              </button>
            </div>
          )}
        </section>

        {viewMode !== "chat" && (
          <section ref={controlSectionRef} className="papee-mobile-card space-y-3 rounded-[1.25rem] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="boared-label text-foreground">Right now</p>
              <h2 className="boared-display text-[1.12rem] leading-[1.1]">
                {currentIssue
                  ? currentIssue.title
                  : currentRun
                    ? `${currentRun.agentName} is active`
                    : health?.issues[0]?.message ?? "Nothing noisy is happening"}
              </h2>
            </div>
            {currentRun && <StatusBadge status={currentRun.status} />}
          </div>

          <p className="font-mono text-[0.66rem] text-muted-foreground">
            {currentIssue
              ? `${currentIssue.identifier ?? "Focus issue"} · ${relativeTime(currentRun?.startedAt ?? currentRun?.createdAt ?? currentIssue.updatedAt)}`
              : currentRun
                ? `Started ${relativeTime(currentRun.startedAt ?? currentRun.createdAt)}`
                : healthIssueCount > 0
                  ? "Papee is actively scanning board health."
                  : "Papee is on standby and ready to jump in."}
          </p>

          {currentIssue && (
            <Link
              to={issueUrl(currentIssue)}
              className="flex items-center justify-between rounded-[0.9rem] border border-[var(--boared-rule)] bg-background px-3 py-2.5 no-underline text-foreground transition-colors hover:border-foreground"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2 boared-label text-muted-foreground">
                  <CircleDot className="h-3 w-3" />
                  Focus issue
                </span>
                <span className="mt-1 block truncate text-[0.82rem]">
                  {currentIssue.identifier ?? currentIssue.id.slice(0, 8)}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          )}

          {currentRun && (
            <Link
              to={agentUrl({ id: currentRun.agentId, name: currentRun.agentName })}
              className="flex items-center justify-between rounded-[0.9rem] border border-[var(--boared-rule)] bg-background px-3 py-2.5 no-underline text-foreground transition-colors hover:border-foreground"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2 boared-label text-muted-foreground">
                  <Bot className="h-3 w-3" />
                  Active agent
                </span>
                <span className="mt-1 block truncate text-[0.82rem]">{currentRun.agentName}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          )}
          </section>
        )}

        {viewMode !== "chat" && (
          <section className="papee-mobile-card space-y-3 rounded-[1.25rem] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="boared-label text-foreground">Now flow</p>
              <h3 className="boared-display text-[1rem] leading-tight">
                {ritualLead?.title ?? "Pocket ritual"} in progress
              </h3>
            </div>
            <ListChecks className="h-4 w-4 text-[var(--boared-acid)]" />
          </div>
          <p className="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground">
            Suggested by live signal · {RITUAL_LABELS[ritualState?.suggestedRitualId ?? activeRitualId]}
            {missionLogLabel ? ` · ${missionLogLabel}` : ""}
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {ritualTracks.map((track) => {
              const stepCount = Math.max(1, track.steps.length);
              const step = Math.max(0, Math.min(stepCount - 1, track.activeStep));
              const selected = ritualLead?.id === track.id;
              const completed = !!track.completedAt || step >= stepCount - 1;
              return (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => {
                    setRitualState((previous) => ({
                      suggestedRitualId: previous?.suggestedRitualId ?? track.id,
                      activeRitualId: track.id,
                      tracks: previous?.tracks ?? ritualTracks,
                    }));
                    setInteractionNote(`${track.title} selected.`);
                    setAmbientLine(`Switching to ${track.title}.`);
                    void recordCompanionInteraction("focus_action", { ritualId: track.id, detail: "select-track" });
                  }}
                  className={cn(
                    "rounded-[0.8rem] border px-2 py-2 text-left transition-colors",
                    selected
                      ? "border-foreground bg-[color-mix(in_oklab,var(--boared-paper)_80%,var(--boared-acid)_20%)]"
                      : "border-[var(--boared-rule)] bg-background",
                  )}
                >
                  <p className="font-mono text-[0.54rem] uppercase tracking-[0.08em] text-muted-foreground">{RITUAL_LABELS[track.id]}</p>
                  <p className="mt-1 text-[0.72rem] font-semibold text-foreground">{completed ? "Done" : `${step + 1}/${stepCount}`}</p>
                </button>
              );
            })}
          </div>

          {ritualLead && (
            <div className={cn("rounded-[0.9rem] border px-3 py-2.5", missionToneClass("normal"))}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[0.78rem] font-semibold text-foreground">{ritualLead.title}</p>
                  <p className="mt-1 font-mono text-[0.62rem] text-muted-foreground">
                    {ritualLeadStepLabel ?? "Ready"}
                  </p>
                </div>
                <p className="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground">
                  {ritualLeadStep + 1}/{ritualLead.steps.length}
                </p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--boared-rule)_80%,transparent)]">
                <div
                  className="h-full rounded-full bg-[color-mix(in_oklab,var(--boared-acid)_72%,var(--boared-paper))] transition-all duration-500"
                  style={{ width: `${Math.max(8, ritualLeadProgress)}%` }}
                />
              </div>
              <div className="mt-2 grid gap-1">
                {ritualLead.steps.map((step, index) => (
                  <div
                    key={`${ritualLead.id}:${step}`}
                    className={cn(
                      "rounded-[0.65rem] border px-2 py-1 text-[0.66rem]",
                      index <= ritualLeadStep
                        ? "border-[var(--boared-rule)] bg-[color-mix(in_oklab,var(--boared-paper)_84%,var(--boared-acid)_16%)] text-foreground"
                        : "border-[var(--boared-rule)] bg-background text-muted-foreground",
                    )}
                  >
                    {step}
                  </div>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => progressRitualTrack(ritualLead.id, ritualLeadCompleted ? "complete" : "advance")}
                  className="rounded-full border border-[var(--boared-rule)] bg-background px-2.5 py-1.5 font-mono text-[0.58rem] uppercase tracking-[0.08em] text-foreground transition-colors hover:border-foreground"
                >
                  {ritualLeadCompleted ? "Celebrate loop" : "Advance step"}
                </button>
                <button
                  type="button"
                  onClick={() => runMission(ritualLeadMissionId)}
                  disabled={isLoading}
                  className="rounded-full border border-[var(--boared-rule)] bg-background px-2.5 py-1.5 font-mono text-[0.58rem] uppercase tracking-[0.08em] text-foreground transition-colors hover:border-foreground disabled:opacity-50"
                >
                  Run with Papee
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {missions.map((mission) => (
              <div key={mission.id} className={cn("rounded-[0.85rem] border px-3 py-2", missionToneClass(mission.urgency))}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[0.74rem] font-semibold text-foreground">{mission.title}</p>
                    <p className="mt-0.5 line-clamp-2 font-mono text-[0.6rem] text-muted-foreground">{mission.detail}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => runMission(mission.id)}
                    disabled={isLoading}
                    className="shrink-0 rounded-full border border-[var(--boared-rule)] bg-background px-2 py-1 font-mono text-[0.54rem] uppercase tracking-[0.08em] text-foreground transition-colors hover:border-foreground disabled:opacity-50"
                  >
                    {mission.cta}
                  </button>
                </div>
              </div>
            ))}
          </div>
          </section>
        )}

        {viewMode !== "chat" && (
          <section className="papee-mobile-card space-y-3 rounded-[1.25rem] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="boared-label text-foreground">Power deck</p>
                <h3 className="boared-display text-[1rem] leading-tight">Real tool calls from /papee</h3>
              </div>
              <span className="font-mono text-[0.56rem] uppercase tracking-[0.08em] text-muted-foreground">
                {powerBusyActionId ? "Executing" : "Ready"}
              </span>
            </div>
            <p className="font-mono text-[0.58rem] text-muted-foreground">
              Read, act, and govern from here. Guarded actions automatically ask for confirmation.
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {powerActions.map((action) => (
                <PowerActionButton
                  key={action.id}
                  action={action}
                  busy={powerBusyActionId === action.id}
                  onRun={(next) => {
                    void runPowerAction(next);
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {viewMode === "control" && (
          <section className="grid grid-cols-2 gap-2">
            <Link
              to="/issues"
              className="papee-mobile-card block rounded-[1.05rem] p-3 no-underline text-foreground transition-colors hover:border-foreground"
            >
              <p className="boared-label text-muted-foreground">Signal board</p>
              <p className="mt-1 boared-display text-[1.35rem] leading-none">{criticalIssueCount}</p>
              <p className="font-mono text-[0.58rem] text-muted-foreground">
                critical · {warningIssueCount} warnings
              </p>
            </Link>
            <Link
              to={userId ? "/inbox" : "/approvals"}
              className="papee-mobile-card block rounded-[1.05rem] p-3 no-underline text-foreground transition-colors hover:border-foreground"
            >
              <p className="boared-label text-muted-foreground">{userId ? "Your queue" : "Approvals"}</p>
              <p className="mt-1 boared-display text-[1.35rem] leading-none">{forYouCount}</p>
              <p className="font-mono text-[0.58rem] text-muted-foreground">open now</p>
            </Link>
          </section>
        )}

        {viewMode === "control" && (
          <section className="papee-mobile-card space-y-3 rounded-[1.25rem] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="boared-label text-foreground">{userId ? "Your queue" : "Board queue"}</p>
              <h3 className="boared-display text-[1rem] leading-tight">
                {userId ? `${unreadCount} item${unreadCount === 1 ? "" : "s"} waiting on you` : "Approvals and board load"}
              </h3>
            </div>
            <TriangleAlert className="h-4 w-4 text-[var(--boared-acid)]" />
          </div>

          {userId ? (
            personalIssues.length > 0 ? (
              <div className="space-y-2">
                {personalIssues.map((issue) => (
                  <Link
                    key={issue.id}
                    to={issueUrl(issue)}
                    className="block rounded-[0.9rem] border border-[var(--boared-rule)] bg-background px-3 py-2.5 no-underline text-foreground transition-colors hover:border-foreground"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[0.8rem]">{issue.identifier ?? issue.id.slice(0, 8)}</span>
                      {issue.isUnreadForMe && <Badge variant="secondary">unread</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 font-mono text-[0.66rem] text-muted-foreground">{issue.title}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="rounded-[0.9rem] border border-dashed border-[var(--boared-rule)] px-3 py-3 font-mono text-[0.67rem] text-muted-foreground">
                Nothing personal is piling up right now.
              </p>
            )
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-[0.9rem] border border-[var(--boared-rule)] bg-background px-2.5 py-2.5">
                <p className="boared-label text-muted-foreground">Approvals</p>
                <p className="mt-1 boared-display text-[1.2rem] leading-none">{dashboard?.pendingApprovals ?? 0}</p>
              </div>
              <div className="rounded-[0.9rem] border border-[var(--boared-rule)] bg-background px-2.5 py-2.5">
                <p className="boared-label text-muted-foreground">Blocked</p>
                <p className="mt-1 boared-display text-[1.2rem] leading-none">{dashboard?.tasks.blocked ?? 0}</p>
              </div>
            </div>
          )}
          </section>
        )}

        {viewMode === "control" && currentRun?.issueId && (
          <section className="papee-mobile-card space-y-3 rounded-[1.25rem] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="boared-label text-foreground">Live trace</p>
                <h3 className="boared-display text-[1rem] leading-tight">What Papee is seeing now</h3>
              </div>
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.08em] text-muted-foreground">Realtime</span>
            </div>
            <LiveRunWidget issueId={currentRun.issueId} companyId={companyId} allowCancel={false} />
          </section>
        )}

        <section
          ref={chatSectionRef}
          className={cn(
            "papee-mobile-card space-y-3 rounded-[1.35rem] p-3.5",
            viewMode === "chat" && "border-foreground bg-[color-mix(in_oklab,var(--boared-paper)_82%,var(--boared-acid)_18%)]",
          )}
        >
          <div className="flex items-center justify-between gap-3 px-0.5">
            <div>
              <p className="boared-label text-foreground">Talk to Papee</p>
              <h3 className="boared-display text-[1rem] leading-tight">Ask for a decision-grade readout.</h3>
            </div>
            <div className="flex items-center gap-1.5">
              {viewMode !== "chat" && (
                <button
                  type="button"
                  onClick={() => goToView("chat")}
                  className="rounded-full border border-[var(--boared-rule)] px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                >
                  Expand
                </button>
              )}
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => clearHistory()}
                  className="rounded-full border border-[var(--boared-rule)] px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className={cn(
            "papee-mobile-chat-scroll space-y-3 overflow-y-auto rounded-[1rem] border border-[var(--boared-rule)] bg-background px-3 py-3",
            viewMode === "chat" ? "max-h-[30rem]" : "max-h-[18rem]",
          )}>
            {messages.length === 0 && !papee?.streamingActive && (
              <div className="rounded-[0.9rem] border border-dashed border-[var(--boared-rule)] bg-[color-mix(in_oklab,var(--boared-paper)_86%,var(--boared-acid)_14%)] px-3 py-4">
                <p className="font-mono text-[0.67rem] text-muted-foreground">
                  Ask for risk summaries, next best actions, or a 20-second briefing before you close the app.
                </p>
              </div>
            )}

            {messages.map((message) => (
              <PocketMessageBubble
                key={message.id}
                message={message}
                onFollowUp={(text) => sendChatPrompt(text, "follow-up")}
              />
            ))}

            {papee?.streamingActive && (
              <div className="flex gap-2">
                <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-[0.6rem] border border-[var(--boared-acid)] bg-[var(--boared-acid)] text-[var(--boared-acid-ink)]">
                  <LoaderCircle className="h-3 w-3 animate-spin" />
                </div>
                <div className="max-w-[90%] rounded-[1rem] border border-[var(--boared-rule)] bg-[color-mix(in_oklab,var(--boared-paper)_84%,var(--boared-acid)_16%)] px-3.5 py-3 text-[0.82rem]">
                  <div className="prose prose-sm max-w-none dark:prose-invert [&_p]:my-1">
                    <MarkdownBody>{papee.streamingText || "Thinking…"}</MarkdownBody>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {viewMode === "chat" && papee?.topicStack && papee.topicStack.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {papee.topicStack.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => sendChatPrompt(`Quick update on ${topic}.`, `topic:${topic}`)}
                  className="rounded-full border border-[var(--boared-rule)] bg-background px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                >
                  {topic}
                </button>
              ))}
            </div>
          )}

          {viewMode === "chat" && (
            <div className="flex flex-wrap gap-1.5">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={isLoading}
                  onClick={() => sendChatPrompt(prompt, "quick-prompt")}
                  className="rounded-full border border-[var(--boared-rule)] bg-background px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          <form
            className="rounded-[1rem] border border-[var(--boared-rule)] bg-background p-2"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = draft.trim();
              if (!trimmed || isLoading) return;
              sendChatPrompt(trimmed, "chat-box");
              setDraft("");
            }}
          >
            <div className="flex items-center gap-2">
              <label htmlFor="papee-mobile-input" className="sr-only">
                Message Papee
              </label>
              <div className="flex flex-1 items-center gap-2 rounded-[0.85rem] border border-[var(--boared-rule)] bg-background px-3">
                <MessageCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  id="papee-mobile-input"
                  ref={inputRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Ask Papee for what matters now…"
                  className="h-11 w-full bg-transparent text-[0.82rem] outline-none placeholder:text-muted-foreground"
                />
              </div>
              <Button type="submit" size="icon-sm" disabled={isLoading || draft.trim().length === 0} className="rounded-full">
                {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
              </Button>
            </div>
          </form>
        </section>
      </div>

      <div className="papee-mobile-fab-dock pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.45rem)] z-40 px-4">
        <div className="pointer-events-auto mx-auto grid w-full max-w-md grid-cols-4 gap-1.5 rounded-[1rem] border border-[var(--boared-rule)] bg-background/95 p-1.5 backdrop-blur-[6px]">
          <button
            type="button"
            onClick={() => goToView("companion")}
            className={cn(
              "papee-mobile-fab-btn",
              viewMode === "companion" && "border-foreground bg-[color-mix(in_oklab,var(--boared-paper)_74%,var(--boared-acid)_26%)] text-foreground",
            )}
          >
            <HeartHandshake className="h-3.5 w-3.5" />
            Companion
          </button>
          <button
            type="button"
            onClick={() => goToView("control")}
            className={cn(
              "papee-mobile-fab-btn",
              viewMode === "control" && "border-foreground bg-[color-mix(in_oklab,var(--boared-paper)_74%,var(--boared-acid)_26%)] text-foreground",
            )}
          >
            <Gauge className="h-3.5 w-3.5" />
            Control
          </button>
          <button
            type="button"
            onClick={() => goToView("chat")}
            className={cn(
              "papee-mobile-fab-btn",
              viewMode === "chat" && "border-foreground bg-[color-mix(in_oklab,var(--boared-paper)_74%,var(--boared-acid)_26%)] text-foreground",
            )}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Chat
          </button>
          <button
            type="button"
            onClick={cycleVibeFromDock}
            className="papee-mobile-fab-btn"
            title={`Cycle vibe from ${activeVibe.title}`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Vibe
          </button>
        </div>
      </div>

      <EnactConfirmDialog />
      <ToastViewport />
    </div>
  );
}
