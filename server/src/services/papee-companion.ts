import { and, desc, eq, inArray, sql } from "@paperclipai/db";
import type { Db } from "@paperclipai/db";
import {
  agents,
  approvals,
  heartbeatRuns,
  issues,
  papeeCompanionProfiles,
} from "@paperclipai/db";
import type {
  PapeeCompanionProfile,
  PapeeInteractionEvent,
  PapeeInteractionResponse,
  PapeeLiveSignal,
  PapeeMobileSnapshot,
  PapeeRitualId,
  PapeeRitualProgressResponse,
  PapeeRitualState,
  PapeeRitualTrack,
} from "@paperclipai/shared";
import { RITUAL_LIBRARY, advanceRitualProgress, interactionDelta, type RitualProgressMap } from "./papee-companion-rules.js";

type ProfileRow = typeof papeeCompanionProfiles.$inferSelect;

function nowIso() {
  return new Date().toISOString();
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function clampEnergy(input: number) {
  return Math.max(1, Math.min(100, Math.round(input)));
}

function clampBond(input: number) {
  return Math.max(0, Math.round(input));
}

function clampMode(input: string | null | undefined): "balanced" | "playful" | "guardian" {
  if (input === "playful" || input === "guardian" || input === "balanced") return input;
  return "balanced";
}

function normalizeRitualId(input: string | null | undefined): PapeeRitualId | null {
  if (input === "pulse_sweep" || input === "focus_sprint" || input === "wrap_prepare") return input;
  return null;
}

function toProfile(row: ProfileRow): PapeeCompanionProfile {
  return {
    bondPoints: clampBond(row.bondPoints),
    checkInStreak: Math.max(1, row.checkInStreak),
    energyLevel: clampEnergy(row.energyLevel),
    companionMode: clampMode(row.companionMode),
    activeRitualId: normalizeRitualId(row.activeRitualId),
    lastCheckInAt: row.lastCheckInAt ? new Date(row.lastCheckInAt).toISOString() : null,
    lastMissionAt: row.lastMissionAt ? new Date(row.lastMissionAt).toISOString() : null,
    lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function resolveCheckInStreak(previous: number, lastCheckInAt: Date | null, now: Date): number {
  if (!lastCheckInAt) return Math.max(1, previous);
  const start = new Date(lastCheckInAt.getFullYear(), lastCheckInAt.getMonth(), lastCheckInAt.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.round((today - start) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return Math.max(1, previous);
  if (diffDays === 1) return Math.max(1, previous + 1);
  return 1;
}

function getProgressMap(row: ProfileRow): RitualProgressMap {
  const value = row.ritualProgress;
  if (!value || typeof value !== "object") return {};
  return value as RitualProgressMap;
}

function phaseAt(date: Date): "dawn" | "day" | "dusk" | "night" {
  const h = date.getHours();
  if (h >= 5 && h < 9) return "dawn";
  if (h >= 9 && h < 18) return "day";
  if (h >= 18 && h < 22) return "dusk";
  return "night";
}

function sinceLastVisitLabel(lastSeenAt: Date | null, now: Date) {
  if (!lastSeenAt) return "First check-in on this device profile.";
  const ms = now.getTime() - lastSeenAt.getTime();
  if (ms < 60_000) return "Welcome back just now.";
  if (ms < 60 * 60_000) return `Back after ${Math.max(1, Math.round(ms / 60_000))} min.`;
  if (ms < 24 * 60 * 60_000) return `Back after ${Math.max(1, Math.round(ms / (60 * 60_000)))} hour(s).`;
  return `Back after ${Math.max(1, Math.round(ms / (24 * 60 * 60_000)))} day(s).`;
}

function deriveSuggestedRitual(signal: PapeeLiveSignal): PapeeRitualId {
  if (signal.criticalIssues > 0 || signal.warningIssues > 0) return "pulse_sweep";
  if (signal.liveRuns > 0) return "focus_sprint";
  return "wrap_prepare";
}

function buildRitualState(row: ProfileRow, signal: PapeeLiveSignal): PapeeRitualState {
  const progress = getProgressMap(row);
  const tracks: PapeeRitualTrack[] = (Object.keys(RITUAL_LIBRARY) as PapeeRitualId[]).map((id) => {
    const config = RITUAL_LIBRARY[id];
    const saved = progress[id];
    const step = Math.max(0, Math.min(config.steps.length - 1, saved?.step ?? 0));
    return {
      id,
      title: config.title,
      steps: config.steps,
      activeStep: step,
      completedAt: saved?.completedAt ?? null,
    };
  });
  const suggestedRitualId = deriveSuggestedRitual(signal);
  return {
    suggestedRitualId,
    activeRitualId: normalizeRitualId(row.activeRitualId) ?? suggestedRitualId,
    tracks,
  };
}

async function ensureProfile(db: Db, companyId: string, userId: string): Promise<ProfileRow> {
  const existing = await db
    .select()
    .from(papeeCompanionProfiles)
    .where(and(eq(papeeCompanionProfiles.companyId, companyId), eq(papeeCompanionProfiles.userId, userId)))
    .then((rows) => rows[0] ?? null);
  if (existing) return existing;

  const now = new Date();
  await db
    .insert(papeeCompanionProfiles)
    .values({
      companyId,
      userId,
      bondPoints: 0,
      checkInStreak: 1,
      energyLevel: 72,
      companionMode: "balanced",
      ritualProgress: {},
      sessionState: { recentInteractionKeys: [] },
      lastCheckInAt: now,
      lastSeenAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [papeeCompanionProfiles.companyId, papeeCompanionProfiles.userId],
    });

  const created = await db
    .select()
    .from(papeeCompanionProfiles)
    .where(and(eq(papeeCompanionProfiles.companyId, companyId), eq(papeeCompanionProfiles.userId, userId)))
    .then((rows) => rows[0] ?? null);
  if (!created) {
    throw new Error("Failed to initialize companion profile");
  }
  return created;
}

async function readLiveSignal(db: Db, companyId: string): Promise<PapeeLiveSignal> {
  const [liveRuns, runningAgents, criticalIssues, warningIssues, pendingApprovals] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(heartbeatRuns)
      .where(and(eq(heartbeatRuns.companyId, companyId), inArray(heartbeatRuns.status, ["queued", "running"])))
      .then((rows) => Number(rows[0]?.count ?? 0)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(agents)
      .where(and(eq(agents.companyId, companyId), inArray(agents.status, ["running", "active", "idle"])))
      .then((rows) => Number(rows[0]?.count ?? 0)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(issues)
      .where(
        and(
          eq(issues.companyId, companyId),
          eq(issues.priority, "critical"),
          inArray(issues.status, ["backlog", "todo", "in_progress", "in_review", "blocked"]),
        ),
      )
      .then((rows) => Number(rows[0]?.count ?? 0)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(issues)
      .where(
        and(
          eq(issues.companyId, companyId),
          inArray(issues.priority, ["high", "medium", "low"]),
          inArray(issues.status, ["backlog", "todo", "in_progress", "in_review", "blocked"]),
        ),
      )
      .then((rows) => Number(rows[0]?.count ?? 0)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(approvals)
      .where(and(eq(approvals.companyId, companyId), eq(approvals.status, "pending")))
      .then((rows) => Number(rows[0]?.count ?? 0)),
  ]);

  const latestLiveRun = await db
    .select({
      agentName: agents.name,
      issueId: sql<string | null>`${heartbeatRuns.contextSnapshot} ->> 'issueId'`.as("issueId"),
    })
    .from(heartbeatRuns)
    .innerJoin(agents, eq(heartbeatRuns.agentId, agents.id))
    .where(and(eq(heartbeatRuns.companyId, companyId), inArray(heartbeatRuns.status, ["queued", "running"])))
    .orderBy(desc(heartbeatRuns.createdAt))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  const currentIssue = latestLiveRun?.issueId
    ? await db
        .select({
          identifier: issues.identifier,
          title: issues.title,
        })
        .from(issues)
        .where(and(eq(issues.companyId, companyId), eq(issues.id, latestLiveRun.issueId)))
        .then((rows) => rows[0] ?? null)
    : null;

  return {
    liveRuns,
    runningAgents,
    criticalIssues,
    warningIssues,
    pendingApprovals,
    currentIssueIdentifier: currentIssue?.identifier ?? null,
    currentIssueTitle: currentIssue?.title ?? null,
    currentAgentName: latestLiveRun?.agentName ?? null,
  };
}

function isDuplicateEvent(
  profile: ProfileRow,
  idempotencyKey: string | null | undefined,
) {
  if (!idempotencyKey) return false;
  const state = (profile.sessionState ?? {}) as { recentInteractionKeys?: string[] };
  const keys = Array.isArray(state.recentInteractionKeys) ? state.recentInteractionKeys : [];
  return keys.includes(idempotencyKey);
}

function withEventKey(profile: ProfileRow, idempotencyKey: string | null | undefined) {
  const state = (profile.sessionState ?? {}) as { recentInteractionKeys?: string[] };
  const keys = Array.isArray(state.recentInteractionKeys) ? state.recentInteractionKeys : [];
  if (!idempotencyKey) return state;
  const next = [idempotencyKey, ...keys.filter((k) => k !== idempotencyKey)].slice(0, 24);
  return { ...state, recentInteractionKeys: next };
}

export function papeeCompanionService(db: Db) {
  return {
    async mobileSnapshot(companyId: string, userId: string): Promise<PapeeMobileSnapshot> {
      const now = new Date();
      const profile = await ensureProfile(db, companyId, userId);
      const signal = await readLiveSignal(db, companyId);
      const sinceLabel = sinceLastVisitLabel(asDate(profile.lastSeenAt), now);

      const vibe: "calm" | "alert" | "urgent" =
        signal.criticalIssues > 0 ? "urgent" : signal.warningIssues > 0 ? "alert" : "calm";
      const ambientTitle =
        signal.currentIssueTitle
          ? `Tracking ${signal.currentIssueTitle}`
          : signal.criticalIssues > 0
            ? `${signal.criticalIssues} critical signal(s) detected`
            : "Papee is in steady patrol mode";
      const ambientSubtitle =
        signal.currentAgentName
          ? `Live with ${signal.currentAgentName}. Open /papee for fast decisions.`
          : signal.pendingApprovals > 0
            ? `${signal.pendingApprovals} pending approval(s) waiting for attention.`
            : "No browser push needed. Your check-in loop lives right here.";

      const updated = await db
        .update(papeeCompanionProfiles)
        .set({
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(and(eq(papeeCompanionProfiles.companyId, companyId), eq(papeeCompanionProfiles.userId, userId)))
        .returning()
        .then((rows) => rows[0] ?? profile);

      return {
        profile: toProfile(updated),
        liveSignal: signal,
        ritualState: buildRitualState(updated, signal),
        ambient: {
          phase: phaseAt(now),
          vibe,
          title: ambientTitle,
          subtitle: ambientSubtitle,
          sinceLastVisitLabel: sinceLabel,
        },
      };
    },

    async recordInteraction(
      companyId: string,
      userId: string,
      event: PapeeInteractionEvent,
    ): Promise<PapeeInteractionResponse> {
      const now = new Date();
      const profile = await ensureProfile(db, companyId, userId);
      const signal = await readLiveSignal(db, companyId);
      if (isDuplicateEvent(profile, event.idempotencyKey)) {
        return {
          profile: toProfile(profile),
          ritualState: buildRitualState(profile, signal),
          idempotent: true,
        };
      }

      const deltas = interactionDelta(event);
      const lastCheckIn = asDate(profile.lastCheckInAt);
      const nextStreak = resolveCheckInStreak(profile.checkInStreak, lastCheckIn, now);

      const ritualId = normalizeRitualId(event.ritualId ?? profile.activeRitualId);
      let progress = getProgressMap(profile);
      if (event.type === "mission_step" && ritualId) {
        progress = advanceRitualProgress(ritualId, progress, "advance", nowIso()).progress;
      }

      const updated = await db
        .update(papeeCompanionProfiles)
        .set({
          bondPoints: clampBond(profile.bondPoints + deltas.bondDelta),
          energyLevel: clampEnergy(profile.energyLevel + deltas.energyDelta),
          checkInStreak: nextStreak,
          activeRitualId: ritualId,
          ritualProgress: progress,
          sessionState: withEventKey(profile, event.idempotencyKey),
          lastMissionAt: event.type === "mission_step" ? now : profile.lastMissionAt,
          lastCheckInAt: now,
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(and(eq(papeeCompanionProfiles.companyId, companyId), eq(papeeCompanionProfiles.userId, userId)))
        .returning()
        .then((rows) => rows[0] ?? profile);

      return {
        profile: toProfile(updated),
        ritualState: buildRitualState(updated, signal),
        idempotent: false,
        reward: {
          bondDelta: deltas.bondDelta,
          energyDelta: deltas.energyDelta,
          note: event.type === "mission_step" ? "Ritual momentum increased." : "Interaction recorded.",
        },
      };
    },

    async progressRitual(
      companyId: string,
      userId: string,
      ritualId: PapeeRitualId,
      action: "advance" | "complete" = "advance",
      idempotencyKey?: string | null,
    ): Promise<PapeeRitualProgressResponse> {
      const now = new Date();
      const profile = await ensureProfile(db, companyId, userId);
      const signal = await readLiveSignal(db, companyId);
      if (isDuplicateEvent(profile, idempotencyKey)) {
        return {
          profile: toProfile(profile),
          ritualState: buildRitualState(profile, signal),
          ritualId,
          progressed: false,
        };
      }

      const progressState = advanceRitualProgress(ritualId, getProgressMap(profile), action, nowIso());

      const updated = await db
        .update(papeeCompanionProfiles)
        .set({
          activeRitualId: ritualId,
          ritualProgress: progressState.progress,
          bondPoints: clampBond(profile.bondPoints + (progressState.completed ? 4 : 1)),
          energyLevel: clampEnergy(profile.energyLevel + (progressState.completed ? 3 : 0)),
          sessionState: withEventKey(profile, idempotencyKey),
          lastMissionAt: progressState.completed ? now : profile.lastMissionAt,
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(and(eq(papeeCompanionProfiles.companyId, companyId), eq(papeeCompanionProfiles.userId, userId)))
        .returning()
        .then((rows) => rows[0] ?? profile);

      return {
        profile: toProfile(updated),
        ritualState: buildRitualState(updated, signal),
        ritualId,
        progressed: progressState.progressed,
      };
    },
  };
}
