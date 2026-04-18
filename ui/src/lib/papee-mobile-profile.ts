import type { PapeeCompanionMode, PapeeMobileSnapshot } from "@/api/papee";

export type CompanionProfile = PapeeMobileSnapshot["profile"];

export function normalizeCompanionMode(raw: string | null | undefined): PapeeCompanionMode {
  if (raw === "playful" || raw === "guardian" || raw === "balanced") return raw;
  return "balanced";
}

function clampEnergy(input: number): number {
  if (!Number.isFinite(input)) return 72;
  return Math.max(1, Math.min(100, Math.round(input)));
}

function clampBond(input: number): number {
  if (!Number.isFinite(input)) return 0;
  return Math.max(0, Math.round(input));
}

function clampStreak(input: number): number {
  if (!Number.isFinite(input)) return 1;
  return Math.max(1, Math.round(input));
}

function safeIso(input: string | null | undefined): string | null {
  if (!input) return null;
  const time = new Date(input).getTime();
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString();
}

export function sanitizeCompanionProfile(profile: CompanionProfile): CompanionProfile {
  return {
    ...profile,
    bondPoints: clampBond(profile.bondPoints),
    checkInStreak: clampStreak(profile.checkInStreak),
    energyLevel: clampEnergy(profile.energyLevel),
    companionMode: normalizeCompanionMode(profile.companionMode),
    lastCheckInAt: safeIso(profile.lastCheckInAt),
    lastMissionAt: safeIso(profile.lastMissionAt),
    lastSeenAt: safeIso(profile.lastSeenAt),
    updatedAt: safeIso(profile.updatedAt) ?? new Date().toISOString(),
  };
}

export function profileUpdatedAtEpoch(profile: CompanionProfile | null | undefined): number {
  if (!profile?.updatedAt) return 0;
  const ts = new Date(profile.updatedAt).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

export function mergeProfileWithMirror(
  serverProfile: CompanionProfile | null,
  mirrorProfile: CompanionProfile | null,
): CompanionProfile | null {
  if (!serverProfile && !mirrorProfile) return null;
  if (!serverProfile && mirrorProfile) return sanitizeCompanionProfile(mirrorProfile);
  if (!mirrorProfile && serverProfile) return sanitizeCompanionProfile(serverProfile);
  const winner =
    profileUpdatedAtEpoch(mirrorProfile) > profileUpdatedAtEpoch(serverProfile)
      ? mirrorProfile
      : serverProfile;
  if (!winner) return null;
  return sanitizeCompanionProfile(winner);
}

export function sinceLastSeenLabel(lastSeenAt: string | null, nowMs = Date.now()): string {
  if (!lastSeenAt) return "Welcome back.";
  const then = new Date(lastSeenAt).getTime();
  if (Number.isNaN(then)) return "Welcome back.";
  const diffMs = Math.max(0, nowMs - then);
  if (diffMs < 60_000) return "Back just now.";
  if (diffMs < 60 * 60_000) return `Back after ${Math.max(1, Math.round(diffMs / 60_000))} min.`;
  if (diffMs < 24 * 60 * 60_000) return `Back after ${Math.max(1, Math.round(diffMs / (60 * 60_000)))} hour(s).`;
  return `Back after ${Math.max(1, Math.round(diffMs / (24 * 60 * 60_000)))} day(s).`;
}
