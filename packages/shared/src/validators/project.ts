import { z } from "zod";
import { PROJECT_STATUSES } from "../constants.js";

const projectWorkspaceFields = {
  name: z.string().min(1).optional(),
  cwd: z.string().min(1).optional().nullable(),
  repoUrl: z.string().url().optional().nullable(),
  repoRef: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
};

export const createProjectWorkspaceSchema = z.object({
  ...projectWorkspaceFields,
  isPrimary: z.boolean().optional().default(false),
}).superRefine((value, ctx) => {
  const hasCwd = typeof value.cwd === "string" && value.cwd.trim().length > 0;
  const hasRepo = typeof value.repoUrl === "string" && value.repoUrl.trim().length > 0;
  if (!hasCwd && !hasRepo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Workspace requires at least one of cwd or repoUrl.",
      path: ["cwd"],
    });
  }
});

export type CreateProjectWorkspace = z.infer<typeof createProjectWorkspaceSchema>;

export const updateProjectWorkspaceSchema = z.object({
  ...projectWorkspaceFields,
  isPrimary: z.boolean().optional(),
}).partial();

export type UpdateProjectWorkspace = z.infer<typeof updateProjectWorkspaceSchema>;

const projectFields = {
  /** @deprecated Use goalIds instead */
  goalId: z.string().uuid().optional().nullable(),
  goalIds: z.array(z.string().uuid()).optional(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  status: z.enum(PROJECT_STATUSES).optional().default("backlog"),
  leadAgentId: z.string().uuid().optional().nullable(),
  targetDate: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  archivedAt: z.string().datetime().optional().nullable(),
};

export const createProjectSchema = z.object({
  ...projectFields,
  workspace: createProjectWorkspaceSchema.optional(),
});

export type CreateProject = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object(projectFields).partial();

export type UpdateProject = z.infer<typeof updateProjectSchema>;

/* ------------------------------------------------------------------
 * Project source (codebase) validators
 *
 * A project may be linked to exactly one source: either a GitHub
 * repo (via an existing github_connections row) or an uploaded local
 * archive (zip). `source_kind='none'` is the default.
 * ------------------------------------------------------------------ */

export const projectSourceKindSchema = z.enum(["none", "github", "local_archive"]);
export type ProjectSourceKind = z.infer<typeof projectSourceKindSchema>;

export const linkGithubSourceSchema = z.object({
  connectionId: z.string().uuid(),
  owner: z.string().min(1).max(120),
  repo: z.string().min(1).max(120),
});
export type LinkGithubSource = z.infer<typeof linkGithubSourceSchema>;

/** Shape of the `source` object embedded in a hydrated Project response. */
export const projectSourceShape = z.object({
  kind: projectSourceKindSchema,
  github: z
    .object({
      connectionId: z.string().uuid(),
      owner: z.string(),
      repo: z.string(),
      defaultBranch: z.string().nullable(),
    })
    .nullable()
    .optional(),
  archive: z
    .object({
      assetId: z.string().uuid(),
      filename: z.string(),
      sizeBytes: z.number(),
      entryCount: z.number(),
    })
    .nullable()
    .optional(),
  ingestedAt: z.string().datetime().nullable().optional(),
});
export type ProjectSource = z.infer<typeof projectSourceShape>;

/** Archive entry row returned by GET /projects/:id/source/files. */
export const projectArchiveEntrySchema = z.object({
  id: z.string().uuid(),
  path: z.string(),
  sizeBytes: z.number(),
  sha1: z.string().nullable(),
  contentType: z.string().nullable(),
  isDirectory: z.boolean(),
  assetId: z.string().uuid().nullable(),
});
export type ProjectArchiveEntry = z.infer<typeof projectArchiveEntrySchema>;
