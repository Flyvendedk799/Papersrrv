import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Companion progression/profile state used by /papee mobile.
 *
 * This is intentionally user-scoped (companyId + userId) so we can
 * keep behavior "according to your account/profile" across devices.
 */
export const papeeCompanionProfiles = pgTable(
  "papee_companion_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),

    bondPoints: integer("bond_points").notNull().default(0),
    checkInStreak: integer("check_in_streak").notNull().default(1),
    energyLevel: integer("energy_level").notNull().default(72),
    companionMode: text("companion_mode").notNull().default("balanced"),

    activeRitualId: text("active_ritual_id"),
    ritualProgress: jsonb("ritual_progress")
      .$type<Record<string, { step: number; completedAt?: string | null }>>()
      .notNull()
      .default({}),
    sessionState: jsonb("session_state")
      .$type<{ recentInteractionKeys?: string[] }>()
      .notNull()
      .default({}),

    lastCheckInAt: timestamp("last_check_in_at", { withTimezone: true }),
    lastMissionAt: timestamp("last_mission_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUserUnique: uniqueIndex("papee_companion_profiles_company_user_uq").on(table.companyId, table.userId),
    companyIdx: index("papee_companion_profiles_company_idx").on(table.companyId),
    companyModeIdx: index("papee_companion_profiles_company_mode_idx").on(table.companyId, table.companionMode),
  }),
);

export type PapeeCompanionProfileRow = typeof papeeCompanionProfiles.$inferSelect;
export type NewPapeeCompanionProfileRow = typeof papeeCompanionProfiles.$inferInsert;

