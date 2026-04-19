import { z } from "zod";

/**
 * Create a GitHub connection using a Personal Access Token.
 * Backlog 4.0 A1 — PAT-first strategy.
 */
export const createGithubConnectionSchema = z.object({
  token: z.string().min(1).max(1024),
  accountLogin: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
    .optional(),
  /**
   * Optional note — stored on the associated company secret's description.
   */
  description: z.string().max(500).optional().nullable(),
});

export type CreateGithubConnection = z.infer<typeof createGithubConnectionSchema>;

/**
 * Query params for live repo reads (future: filter flags).
 */
export const listGithubPullsQuerySchema = z.object({
  state: z.enum(["open", "closed", "all"]).optional(),
  connectionId: z.string().uuid().optional(),
});

export type ListGithubPullsQuery = z.infer<typeof listGithubPullsQuerySchema>;

/**
 * PR mutation payloads (backlog 4.0 B3).
 * All endpoints using these are gated behind the `pr_actions` server feature flag.
 */
export const pullCommentSchema = z.object({
  body: z.string().min(1).max(65536),
  connectionId: z.string().uuid().optional(),
});
export type PullCommentInput = z.infer<typeof pullCommentSchema>;

export const pullReviewSchema = z.object({
  event: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]),
  body: z.string().max(65536).optional(),
  connectionId: z.string().uuid().optional(),
});
export type PullReviewInput = z.infer<typeof pullReviewSchema>;

export const pullMergeSchema = z.object({
  method: z.enum(["merge", "squash", "rebase"]).optional(),
  commitTitle: z.string().max(256).optional(),
  commitMessage: z.string().max(65536).optional(),
  connectionId: z.string().uuid().optional(),
});
export type PullMergeInput = z.infer<typeof pullMergeSchema>;
