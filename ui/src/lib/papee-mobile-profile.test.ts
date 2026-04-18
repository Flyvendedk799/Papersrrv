// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  mergeProfileWithMirror,
  profileUpdatedAtEpoch,
  sanitizeCompanionProfile,
  sinceLastSeenLabel,
} from "./papee-mobile-profile";
import type { CompanionProfile } from "./papee-mobile-profile";

function makeProfile(overrides: Partial<CompanionProfile> = {}): CompanionProfile {
  return {
    bondPoints: 10,
    checkInStreak: 3,
    energyLevel: 70,
    companionMode: "balanced",
    activeRitualId: "pulse_sweep",
    lastCheckInAt: "2026-04-16T08:00:00.000Z",
    lastMissionAt: "2026-04-16T08:10:00.000Z",
    lastSeenAt: "2026-04-16T08:12:00.000Z",
    updatedAt: "2026-04-16T08:15:00.000Z",
    ...overrides,
  };
}

describe("papee-mobile-profile sync", () => {
  it("prefers mirror profile when mirror updatedAt is newer", () => {
    const server = makeProfile({ bondPoints: 9, updatedAt: "2026-04-16T08:15:00.000Z" });
    const mirror = makeProfile({ bondPoints: 16, updatedAt: "2026-04-16T08:19:00.000Z" });
    const merged = mergeProfileWithMirror(server, mirror);
    expect(merged?.bondPoints).toBe(16);
  });

  it("falls back to server profile when mirror timestamp is stale", () => {
    const server = makeProfile({ checkInStreak: 5, updatedAt: "2026-04-16T08:19:00.000Z" });
    const mirror = makeProfile({ checkInStreak: 2, updatedAt: "2026-04-16T08:01:00.000Z" });
    const merged = mergeProfileWithMirror(server, mirror);
    expect(merged?.checkInStreak).toBe(5);
  });

  it("sanitizes invalid profile values from local mirror", () => {
    const dirty = makeProfile({
      bondPoints: -17,
      checkInStreak: 0,
      energyLevel: 188,
      companionMode: "invalid" as never,
      updatedAt: "not-a-date",
    });
    const clean = sanitizeCompanionProfile(dirty);
    expect(clean.bondPoints).toBe(0);
    expect(clean.checkInStreak).toBe(1);
    expect(clean.energyLevel).toBe(100);
    expect(clean.companionMode).toBe("balanced");
    expect(profileUpdatedAtEpoch(clean)).toBeGreaterThan(0);
  });

  it("builds readable since-last-seen labels", () => {
    expect(sinceLastSeenLabel(null, Date.parse("2026-04-17T10:00:00.000Z"))).toBe("Welcome back.");
    expect(sinceLastSeenLabel("2026-04-17T09:40:00.000Z", Date.parse("2026-04-17T10:00:00.000Z"))).toContain("min");
  });
});
