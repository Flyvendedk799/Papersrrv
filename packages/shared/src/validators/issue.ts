import { z } from "zod";
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from "../constants.js";
import { issueKindSchema, planOutputSchema } from "./planning.js";

export const issueAssigneeAdapterOverridesSchema = z
  .object({
    adapterConfig: z.record(z.unknown()).optional(),
    useProjectWorkspace: z.boolean().optional(),
  })
  .strict();

/** Effort-estimate tiers. Hint only — no binding on capacity. */
export const issueEstimateSchema = z.enum(["xs", "s", "m", "l", "xl"]);
export type IssueEstimate = z.infer<typeof issueEstimateSchema>;

export const createIssueSchema = z.object({
  projectId: z.string().uuid().optional().nullable(),
  goalId: z.string().uuid().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  status: z.enum(ISSUE_STATUSES).optional().default("backlog"),
  priority: z.enum(ISSUE_PRIORITIES).optional().default("medium"),
  assigneeAgentId: z.string().uuid().optional().nullable(),
  assigneeUserId: z.string().optional().nullable(),
  requestDepth: z.number().int().nonnegative().optional().default(0),
  billingCode: z.string().optional().nullable(),
  assigneeAdapterOverrides: issueAssigneeAdapterOverridesSchema.optional().nullable(),
  labelIds: z.array(z.string().uuid()).optional(),
  // Dossier causal linkage. Optional + nullable; writers set them
  // when the caller knows the source.
  createdFromCommentId: z.string().uuid().optional().nullable(),
  createdFromRunId: z.string().uuid().optional().nullable(),
  // Planning-issue foundation (migration 0041). kind is chosen at
  // creation via the create-issue dialog's mode selector; defaults
  // to "issue". planOutputJson / transferredToBacklogAt are set by
  // the transfer endpoint, not by the creator.
  kind: issueKindSchema.optional().default("issue"),
  planOutputJson: planOutputSchema.optional().nullable(),
  // F2 / migration 0045 — PM primitives.
  dueDate: z.string().datetime().optional().nullable(),
  estimate: issueEstimateSchema.optional().nullable(),
});

export type CreateIssue = z.infer<typeof createIssueSchema>;

export const createIssueLabelSchema = z.object({
  name: z.string().trim().min(1).max(48),
  color: z.string().regex(/^#(?:[0-9a-fA-F]{6})$/, "Color must be a 6-digit hex value"),
});

export type CreateIssueLabel = z.infer<typeof createIssueLabelSchema>;

export const updateIssueSchema = createIssueSchema.partial().extend({
  comment: z.string().min(1).optional(),
  hiddenAt: z.string().datetime().nullable().optional(),
  rank: z.string().max(32).optional().nullable(),
});

/** F3 — bulk update operations on issues. */
export const bulkIssueUpdateSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(500),
    op: z.enum([
      "set_status",
      "set_priority",
      "set_assignee_agent",
      "set_assignee_user",
      "archive",
      "unarchive",
      "delete",
      "add_labels",
      "remove_labels",
      "set_project",
      "set_due_date",
      "set_estimate",
    ]),
    status: z.enum(ISSUE_STATUSES).optional(),
    priority: z.enum(ISSUE_PRIORITIES).optional(),
    assigneeAgentId: z.string().uuid().nullable().optional(),
    assigneeUserId: z.string().nullable().optional(),
    projectId: z.string().uuid().nullable().optional(),
    labelIds: z.array(z.string().uuid()).optional(),
    dueDate: z.string().datetime().nullable().optional(),
    estimate: issueEstimateSchema.nullable().optional(),
  });
export type BulkIssueUpdate = z.infer<typeof bulkIssueUpdateSchema>;

/** F9 — reorder within a status column. `rank` is a fractional
 * string inserted between prevRank and nextRank; the server can
 * compute it if only neighbours are supplied. */
export const reorderIssueSchema = z.object({
  status: z.enum(ISSUE_STATUSES).optional(),
  rank: z.string().max(32).optional(),
  beforeIssueId: z.string().uuid().nullable().optional(),
  afterIssueId: z.string().uuid().nullable().optional(),
});
export type ReorderIssue = z.infer<typeof reorderIssueSchema>;

export type UpdateIssue = z.infer<typeof updateIssueSchema>;

export const checkoutIssueSchema = z.object({
  agentId: z.string().uuid(),
  expectedStatuses: z.array(z.enum(ISSUE_STATUSES)).nonempty(),
});

export type CheckoutIssue = z.infer<typeof checkoutIssueSchema>;

export const addIssueCommentSchema = z.object({
  body: z.string().min(1),
  reopen: z.boolean().optional(),
  interrupt: z.boolean().optional(),
  // Dossier causal linkage: this comment is a direct reply to an
  // earlier comment on the same issue.
  replyToCommentId: z.string().uuid().optional().nullable(),
});

export type AddIssueComment = z.infer<typeof addIssueCommentSchema>;

export const linkIssueApprovalSchema = z.object({
  approvalId: z.string().uuid(),
});

export type LinkIssueApproval = z.infer<typeof linkIssueApprovalSchema>;

export const createIssueAttachmentMetadataSchema = z.object({
  issueCommentId: z.string().uuid().optional().nullable(),
});

/* ──────────────────────────────────────────────────────────────
 * F6 — issue link kinds + mutations
 * ────────────────────────────────────────────────────────────── */

export const issueLinkKindSchema = z.enum([
  "blocks",
  "blocked_by",
  "duplicates",
  "duplicated_by",
  "relates_to",
]);
export type IssueLinkKind = z.infer<typeof issueLinkKindSchema>;

/** Kinds that auto-mirror to an inverse on the other side. */
export const INVERSE_LINK_KIND: Partial<Record<IssueLinkKind, IssueLinkKind>> = {
  blocks: "blocked_by",
  blocked_by: "blocks",
  duplicates: "duplicated_by",
  duplicated_by: "duplicates",
};

export const createIssueLinkSchema = z.object({
  targetIssueId: z.string().uuid(),
  kind: issueLinkKindSchema,
});
export type CreateIssueLink = z.infer<typeof createIssueLinkSchema>;

/* ──────────────────────────────────────────────────────────────
 * F7 — watchers
 * ────────────────────────────────────────────────────────────── */

export const addWatcherSchema = z
  .object({
    userId: z.string().optional().nullable(),
    agentId: z.string().uuid().optional().nullable(),
  })
  .refine(
    (v) => Boolean(v.userId) !== Boolean(v.agentId),
    "Exactly one of userId or agentId is required",
  );
export type AddWatcher = z.infer<typeof addWatcherSchema>;

/* ──────────────────────────────────────────────────────────────
 * F4 — saved views
 * ────────────────────────────────────────────────────────────── */

export const savedViewFiltersSchema = z
  .object({
    status: z.array(z.enum(ISSUE_STATUSES)).optional(),
    priority: z.array(z.enum(ISSUE_PRIORITIES)).optional(),
    assigneeAgentId: z.union([z.string().uuid(), z.literal("me"), z.literal("none")]).optional(),
    assigneeUserId: z.union([z.string(), z.literal("me"), z.literal("none")]).optional(),
    projectId: z.union([z.string().uuid(), z.literal("none")]).optional(),
    labelIds: z.array(z.string().uuid()).optional(),
    q: z.string().optional(),
    includeArchived: z.boolean().optional(),
    dueWithinDays: z.number().int().nonnegative().optional(),
    overdueOnly: z.boolean().optional(),
  })
  .passthrough();
export type SavedViewFilters = z.infer<typeof savedViewFiltersSchema>;

export const createSavedViewSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400).optional().nullable(),
  filters: savedViewFiltersSchema,
  sortKey: z.string().max(60).optional().nullable(),
  groupBy: z.string().max(32).optional().nullable(),
  viewKind: z.enum(["list", "kanban"]).optional().default("list"),
  isPinned: z.boolean().optional(),
  isShared: z.boolean().optional(),
});
export type CreateSavedView = z.infer<typeof createSavedViewSchema>;

export const updateSavedViewSchema = createSavedViewSchema.partial();
export type UpdateSavedView = z.infer<typeof updateSavedViewSchema>;

/* ──────────────────────────────────────────────────────────────
 * F5 — issue templates
 * ────────────────────────────────────────────────────────────── */

export const issueTemplateVariableSchema = z.object({
  name: z.string().trim().min(1).max(48),
  label: z.string().trim().min(1).max(120),
  default: z.string().max(400).optional().nullable(),
  required: z.boolean().optional(),
});
export type IssueTemplateVariable = z.infer<typeof issueTemplateVariableSchema>;

export const createIssueTemplateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400).optional().nullable(),
  titleTemplate: z.string().trim().min(1).max(200),
  bodyTemplate: z.string().max(8000).optional().nullable(),
  defaultPriority: z.enum(ISSUE_PRIORITIES).optional().nullable(),
  defaultKind: issueKindSchema.optional().default("issue"),
  defaultAssigneeAgentId: z.string().uuid().optional().nullable(),
  defaultAssigneeUserId: z.string().optional().nullable(),
  defaultProjectId: z.string().uuid().optional().nullable(),
  defaultLabelIds: z.array(z.string().uuid()).optional().nullable(),
  variables: z.array(issueTemplateVariableSchema).max(30).optional().nullable(),
});
export type CreateIssueTemplate = z.infer<typeof createIssueTemplateSchema>;

/** Body sent when instantiating a template into a new issue. */
export const instantiateIssueTemplateSchema = z.object({
  templateId: z.string().uuid(),
  values: z.record(z.string()).optional(),
  overrides: createIssueSchema.partial().optional(),
});
export type InstantiateIssueTemplate = z.infer<typeof instantiateIssueTemplateSchema>;

export type CreateIssueAttachmentMetadata = z.infer<typeof createIssueAttachmentMetadataSchema>;
