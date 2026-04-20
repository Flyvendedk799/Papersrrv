/**
 * Planning-issue validators (migration 0041).
 *
 * `PlanOutput` is the enforced shape of the final plan artifact
 * that a planning-kind issue converges to. Agents produce free-form
 * markdown; the server reshapes it into this schema before persist
 * (see server/src/services/plan-output-formatter.ts) — so readers
 * and UI can depend on the shape regardless of which agent or
 * model wrote the output.
 *
 * Keep the schema narrow and lenient: required fields produce a
 * usable plan; optional sections only render if present.
 */

import { z } from "zod";

/** Owner pointer on a plan step.
 *
 * Upgraded from free-form string in 0043_plan_depth (F2). A step
 * can carry:
 *   - an `agentId` — resolves to a real Agent row; enables
 *     notifications + per-agent plan-step queue.
 *   - a `userId` — a human teammate.
 *   - a `label` — free-form text (role like "frontend", or an
 *     unresolved name). Legacy string owners parse into this.
 *
 * All fields optional. At least one is required to be meaningful
 * but the schema itself is permissive — a totally empty owner
 * object means "unassigned".
 */
export const planOutputStepOwnerSchema = z
  .object({
    agentId: z.string().uuid().optional().nullable(),
    userId: z.string().min(1).max(120).optional().nullable(),
    label: z.string().trim().max(120).optional().nullable(),
  })
  .strict();

export type PlanOutputStepOwner = z.infer<typeof planOutputStepOwnerSchema>;

/** Coerce legacy string owners into the new structured shape. */
function coerceOwner(raw: unknown): PlanOutputStepOwner | null | undefined {
  if (raw == null) return raw as null | undefined;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.length === 0 ? null : { label: trimmed };
  }
  if (typeof raw === "object") return raw as PlanOutputStepOwner;
  return undefined;
}

export const planOutputStepSchema = z.object({
  /** Short imperative title — e.g. "Migrate auth.ts to session tokens". */
  title: z.string().trim().min(1).max(200),
  /** 1–3 sentence rationale / what-to-do. Markdown-lite OK. */
  detail: z.string().trim().min(1).max(2000),
  /** Owner pointer — see planOutputStepOwnerSchema. Legacy string
   * owners are coerced into `{ label }` so historical plans parse. */
  owner: z
    .preprocess(coerceOwner, planOutputStepOwnerSchema.nullable())
    .optional(),
  /** Zero-indexed step positions this one depends on. Cycles are
   * caller's responsibility; validator doesn't enforce DAG shape. */
  dependsOn: z.array(z.number().int().nonnegative()).max(20).optional(),
  /** Rough effort tier; hint only, not binding. */
  effort: z.enum(["small", "medium", "large"]).optional(),
  /** When a work issue has been spawned for this step (F1), the issue
   * id is recorded here. Read-only from the caller's perspective — the
   * server writes this on spawn-issue endpoints. Allowed in the schema
   * so round-tripping through persist/validate is stable. */
  spawnedIssueId: z.string().uuid().nullable().optional(),
});

export const planOutputSchema = z.object({
  /** 1–2 sentence TL;DR of the plan. Non-technical-readable. */
  summary: z.string().trim().min(1).max(400),
  /** Why this plan exists + what was investigated. Context for
   * anyone landing on the plan cold. Markdown allowed. */
  context: z.string().trim().min(1).max(4000),
  /** Ordered proposed steps. At least one. */
  proposedSteps: z.array(planOutputStepSchema).min(1).max(40),
  /** Open risks callers should weigh before executing. Optional. */
  risks: z.array(z.string().trim().min(1).max(400)).max(20).optional(),
  /** Unresolved questions. Shown as a checklist. Optional. */
  openQuestions: z.array(z.string().trim().min(1).max(400)).max(20).optional(),
  /** Who the plan suggests should own which slice. Optional. */
  delegations: z
    .array(
      z.object({
        agent: z.string().trim().min(1).max(120),
        task: z.string().trim().min(1).max(400),
      }),
    )
    .max(30)
    .optional(),
  /** Schema version — bump when the shape changes incompatibly. */
  schemaVersion: z.literal(1).default(1),
});

export type PlanOutputStep = z.infer<typeof planOutputStepSchema>;
export type PlanOutput = z.infer<typeof planOutputSchema>;

/** Plan execution progress (F4). Returned by
 * GET /backlog/plans/:id/progress and attached to hydrated
 * plan responses. Counts roll up issues linked via
 * `issues.source_plan_id`. */
export const planProgressSchema = z.object({
  total: z.number().int().nonnegative(),
  spawned: z.number().int().nonnegative(),
  inFlight: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
});
export type PlanProgress = z.infer<typeof planProgressSchema>;

/** Issue kinds. `"issue"` is the legacy/default work-ticket kind;
 * `"planning"` is the investigation-produces-a-plan kind. */
export const issueKindSchema = z.enum(["issue", "planning"]);
export type IssueKind = z.infer<typeof issueKindSchema>;

/** Body for POST /api/issues/:id/transfer-to-backlog. All optional —
 * server derives sensible defaults from the source issue. */
export const transferToBacklogSchema = z.object({
  /** Override the title of the resulting backlog plan. Falls back to
   * the issue title when absent. */
  title: z.string().trim().max(200).optional(),
  /** Override the `kind` of the resulting backlog plan.
   * Defaults to "custom". */
  planKind: z.enum(["sprint", "milestone", "roadmap", "custom"]).optional(),
  /** When true, also seed `backlog_items` from each `proposedSteps`
   * entry. Default: false — user should curate. */
  seedItems: z.boolean().optional(),
  /** Raw plan output from the caller — either already-shaped
   * `PlanOutput` or free-form markdown the server will reshape via
   * the plan-output-formatter. When absent the server falls back
   * to whatever is already persisted on the issue. Typed as
   * `unknown` so callers aren't forced to pre-format. */
  planOutput: z.unknown().optional(),
});

export type TransferToBacklogInput = z.infer<typeof transferToBacklogSchema>;
